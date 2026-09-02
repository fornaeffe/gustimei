import { fail, isRedirect, redirect, type RequestEvent } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import type { RankingDirection } from '$lib/domain/ranking/contracts';
import {
	deriveRankingDisplay,
	deriveRankingProjection,
	planAdjacentTierAdjustment
} from '$lib/domain/ranking/revision';
import { runtimeConfig } from '$lib/server/config';
import { db } from '$lib/server/db';
import { placeReview } from '$lib/server/db/schema';
import { ConflictError, DomainValidationError, NotFoundError } from '$lib/server/domain/errors';
import { requireUser } from '$lib/server/http/auth-guard';
import { localizedPath } from '$lib/server/http/locale';
import { ParticipationRepository } from '$lib/server/repositories/participation';
import { PersonalCommentRepository } from '$lib/server/repositories/personal-comments';
import { RankingRepository } from '$lib/server/repositories/rankings';
import { stringField } from '$lib/server/security/auth-forms';
import { PersonalCommentService } from '$lib/server/services/personal-comments';
import { ProductAnalyticsService } from '$lib/server/services/product-analytics';
import { RankingService } from '$lib/server/services/rankings';
import type { Actions, PageServerLoad } from './$types';

const repository = new RankingRepository(db);
const rankings = new RankingService(
	repository,
	new ParticipationRepository(db),
	runtimeConfig.appEnvironment
);
const comments = new PersonalCommentService(new PersonalCommentRepository(db));
const analytics = new ProductAnalyticsService(db);

function safeError(cause: unknown) {
	if (
		cause instanceof ConflictError ||
		cause instanceof DomainValidationError ||
		cause instanceof NotFoundError
	)
		return cause.message;
	throw cause;
}

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const places = await rankings.listVisitedPlaces(user.id, 'restaurant');
	const list = await repository.findList(user.id, 'restaurant');
	const [revision, openSession] = list
		? await Promise.all([
				repository.loadCurrentRevision(user.id, list.id),
				repository.findOpenSession(user.id, list.id)
			])
		: [undefined, undefined];
	const placeById = new Map(places.map((place) => [place.placeId, place]));
	const display = revision ? deriveRankingDisplay(revision) : undefined;
	const rankedIds = new Set(revision?.activePlaceIds ?? []);
	let reviewPrompt;
	const promptShownAt = Number(event.cookies.get('ranking_review_prompt_shown_at') ?? 0);
	const promptDismissedAt = Number(event.cookies.get('ranking_review_prompt_dismissed_at') ?? 0);
	const now = Date.now();
	const showCapElapsed =
		!Number.isFinite(promptShownAt) || now - promptShownAt >= 30 * 24 * 60 * 60 * 1_000;
	const dismissalCapElapsed =
		!Number.isFinite(promptDismissedAt) || now - promptDismissedAt >= 90 * 24 * 60 * 60 * 1_000;
	if (
		event.url.searchParams.get('completed') === '1' &&
		revision &&
		user.emailVerified &&
		showCapElapsed &&
		dismissalCapElapsed
	) {
		const reviewed = await db
			.select({ placeId: placeReview.placeId })
			.from(placeReview)
			.where(
				and(
					eq(placeReview.authorId, user.id),
					inArray(placeReview.placeId, [...revision.activePlaceIds])
				)
			);
		const reviewedIds = new Set(reviewed.map((item) => item.placeId));
		reviewPrompt = places.find(
			(place) => revision.activePlaceIds.includes(place.placeId) && !reviewedIds.has(place.placeId)
		);
		if (reviewPrompt) {
			const capture = await rankings.captureContext(user.id);
			await analytics.record({
				userId: user.id,
				cohortAssignmentId: capture.cohortAssignmentId,
				name: 'review-prompt-shown',
				category: 'restaurant'
			});
			event.cookies.set('ranking_review_prompt_shown_at', String(now), {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: runtimeConfig.appEnvironment === 'production',
				maxAge: 60 * 60 * 24 * 30
			});
		}
	}
	return {
		openSession: openSession?.summary(),
		revisionId: revision?.id,
		adjusted: event.url.searchParams.get('adjusted') === '1',
		projection: revision ? deriveRankingProjection(revision) : undefined,
		tiers:
			display?.orderedTiers.map((tier, index) => ({
				position: index + 1,
				places: tier.placeIds.flatMap((placeId) => {
					const place = placeById.get(placeId);
					if (!place) return [];
					return [
						{
							...place,
							moveUpEffect: !openSession
								? planAdjacentTierAdjustment(revision!, placeId, 'up')?.effect
								: undefined,
							moveDownEffect: !openSession
								? planAdjacentTierAdjustment(revision!, placeId, 'down')?.effect
								: undefined,
							canReposition: !openSession && revision?.unresolvedRelations.length === 0
						}
					];
				})
			})) ?? [],
		unplaced: places.filter((place) => !rankedIds.has(place.placeId)),
		unresolved:
			display?.unresolvedPlaceGroups.flatMap((group) =>
				group.flatMap((placeId) => {
					const place = placeById.get(placeId);
					return place ? [place] : [];
				})
			) ?? [],
		reviewPrompt
	};
};

async function redirectToSession(event: RequestEvent, rebuild = false) {
	const user = requireUser(event);
	try {
		const list = await repository.findList(user.id, 'restaurant');
		if (!list) throw new DomainValidationError('Add at least two visited restaurants first');
		const session = rebuild
			? await rankings.startInitialSession(user.id, list.id)
			: await rankings.startUsefulSession(user.id, list.id);
		redirect(303, localizedPath(`/ranking/restaurants/session/${session.id}`));
	} catch (cause) {
		if (isRedirect(cause)) throw cause;
		return fail(400, { section: 'ranking', error: safeError(cause) });
	}
}

export const actions = {
	start: (event) => redirectToSession(event),
	rebuild: (event) => redirectToSession(event, true),
	adjust: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		try {
			const direction = stringField(form, 'direction') as RankingDirection;
			if (direction !== 'up' && direction !== 'down') {
				throw new DomainValidationError('Choose a valid ranking direction');
			}
			const list = await repository.findList(user.id, 'restaurant');
			if (!list) throw new NotFoundError('The ranking list was not found');
			await rankings.adjustAdjacentPlace(
				user.id,
				list.id,
				stringField(form, 'placeId'),
				direction,
				stringField(form, 'revisionId')
			);
			const capture = await rankings.captureContext(user.id);
			await analytics.record({
				userId: user.id,
				cohortAssignmentId: capture.cohortAssignmentId,
				name: 'comparison-submitted',
				category: 'restaurant',
				metadata: { outcome: 'adjacent-adjustment', answeredCount: 1, estimatedTotal: 1 }
			});
			redirect(303, `${localizedPath('/ranking/restaurants')}?adjusted=1`);
		} catch (cause) {
			if (isRedirect(cause)) throw cause;
			return fail(409, { section: 'adjustment', error: safeError(cause) });
		}
	},
	reposition: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		try {
			const list = await repository.findList(user.id, 'restaurant');
			if (!list) throw new NotFoundError('The ranking list was not found');
			const session = await rankings.startRepositionSession(
				user.id,
				list.id,
				stringField(form, 'placeId')
			);
			redirect(303, localizedPath(`/ranking/restaurants/session/${session.id}`));
		} catch (cause) {
			if (isRedirect(cause)) throw cause;
			return fail(409, { section: 'adjustment', error: safeError(cause) });
		}
	},
	saveComment: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		try {
			await comments.save(user.id, stringField(form, 'placeId'), stringField(form, 'body'));
			return { section: 'comment', saved: true };
		} catch (cause) {
			return fail(400, { section: 'comment', error: safeError(cause) });
		}
	},
	deleteComment: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		await comments.delete(user.id, stringField(form, 'placeId'));
		return { section: 'comment', deleted: true };
	},
	removePlace: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		try {
			const list = await repository.findList(user.id, 'restaurant');
			if (!list) throw new NotFoundError('The ranking list was not found');
			await rankings.removeRankedPlace(
				user.id,
				list.id,
				'restaurant',
				stringField(form, 'placeId')
			);
			return { section: 'maintenance', removed: true };
		} catch (cause) {
			return fail(409, { section: 'maintenance', error: safeError(cause) });
		}
	},
	deleteCategory: async (event) => {
		const user = requireUser(event);
		try {
			await repository.deleteCategory(user.id, 'restaurant');
			return { section: 'maintenance', deleted: true };
		} catch (cause) {
			return fail(409, { section: 'maintenance', error: safeError(cause) });
		}
	},
	dismissReviewPrompt: async (event) => {
		const user = requireUser(event);
		event.cookies.set('ranking_review_prompt_dismissed_at', String(Date.now()), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: runtimeConfig.appEnvironment === 'production',
			maxAge: 60 * 60 * 24 * 90
		});
		const capture = await rankings.captureContext(user.id);
		await analytics.record({
			userId: user.id,
			cohortAssignmentId: capture.cohortAssignmentId,
			name: 'review-prompt-dismissed',
			category: 'restaurant'
		});
		return { section: 'reviewPrompt', dismissed: true };
	}
} satisfies Actions;
