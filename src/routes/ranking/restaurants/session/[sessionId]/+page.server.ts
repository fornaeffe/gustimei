import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import type { ComparisonOutcome } from '$lib/domain/ranking/contracts';
import { deriveRankingDisplay, deriveRankingProjection } from '$lib/domain/ranking/revision';
import { runtimeConfig } from '$lib/server/config';
import { db } from '$lib/server/db';
import { placeReview } from '$lib/server/db/schema';
import { ConflictError, DomainValidationError, NotFoundError } from '$lib/server/domain/errors';
import { requireUser } from '$lib/server/http/auth-guard';
import { localizedPath } from '$lib/server/http/locale';
import { ParticipationRepository } from '$lib/server/repositories/participation';
import { RankingRepository } from '$lib/server/repositories/rankings';
import { stringField } from '$lib/server/security/auth-forms';
import { ProductAnalyticsService } from '$lib/server/services/product-analytics';
import { RankingService } from '$lib/server/services/rankings';
import type { Actions, PageServerLoad } from './$types';

const rankingRepository = new RankingRepository(db);
const rankings = new RankingService(
	rankingRepository,
	new ParticipationRepository(db),
	runtimeConfig.appEnvironment
);
const analytics = new ProductAnalyticsService(db);
const outcomes = new Set<ComparisonOutcome>(['left', 'right', 'tie', 'skip']);

function safeError(error: unknown) {
	if (
		error instanceof ConflictError ||
		error instanceof DomainValidationError ||
		error instanceof NotFoundError
	) {
		return error.message;
	}
	throw error;
}

function outcomeField(form: FormData) {
	const value = stringField(form, 'outcome') as ComparisonOutcome;
	if (!outcomes.has(value)) throw new DomainValidationError('Choose a valid comparison outcome');
	return value;
}

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const session = await rankingRepository.loadSession(user.id, event.params.sessionId);
	const places = await rankings.listVisitedPlaces(user.id, 'restaurant');
	const placeById = new Map(places.map((place) => [place.placeId, place]));
	const comparison = session.nextComparison();
	const currentRevision = await rankingRepository.loadCurrentRevision(user.id, session.listId);
	const sessionEvidenceIds = new Set(session.evidence.map((item) => item.id));
	const revisionEvidenceIds = new Set([
		...(currentRevision?.activeEvidence.map((item) => item.id) ?? []),
		...(currentRevision?.excludedEvidence.map((item) => item.evidence.id) ?? [])
	]);
	const revision =
		currentRevision && [...sessionEvidenceIds].every((id) => revisionEvidenceIds.has(id))
			? currentRevision
			: undefined;
	const display = revision ? deriveRankingDisplay(revision) : undefined;
	const ranking = revision
		? {
				tiers: display!.orderedTiers.map((tier, index) => ({
					position: index + 1,
					places: tier.placeIds.flatMap((placeId) => {
						const place = placeById.get(placeId);
						return place ? [place] : [];
					})
				}))
			}
		: undefined;

	let reviewPrompt;
	const promptShownAt = Number(event.cookies.get('ranking_review_prompt_shown_at') ?? 0);
	const promptDismissedAt = Number(event.cookies.get('ranking_review_prompt_dismissed_at') ?? 0);
	const now = Date.now();
	const showCapElapsed =
		!Number.isFinite(promptShownAt) || now - promptShownAt >= 30 * 24 * 60 * 60 * 1_000;
	const dismissalCapElapsed =
		!Number.isFinite(promptDismissedAt) || now - promptDismissedAt >= 90 * 24 * 60 * 60 * 1_000;
	if (
		revision &&
		user.emailVerified &&
		['initial-order', 'insertion'].includes(session.purpose) &&
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
		session: session.summary(),
		comparison: comparison
			? {
					...comparison,
					left: placeById.get(comparison.leftPlaceId),
					right: placeById.get(comparison.rightPlaceId)
				}
			: undefined,
		latestEvidenceId: session.latestActiveEvidence()?.id,
		ranking,
		reviewPrompt
	};
};

export const actions = {
	submit: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		try {
			const outcome = outcomeField(form);
			const result = await rankings.submit(
				user.id,
				event.params.sessionId,
				stringField(form, 'comparisonId'),
				outcome
			);
			if (result.captured) {
				const capture = await rankings.captureContext(user.id);
				await analytics.record({
					userId: user.id,
					cohortAssignmentId: capture.cohortAssignmentId,
					name: 'comparison-submitted',
					category: 'restaurant',
					metadata: {
						outcome,
						answeredCount: result.session.progress().answered,
						estimatedTotal: result.session.progress().estimatedTotal
					}
				});
			}
			if (result.session.lifecycle === 'completed') {
				const revision = await rankings.publishCompletedSession(
					user.id,
					event.params.sessionId,
					'restaurant'
				);
				if (result.captured) {
					const capture = await rankings.captureContext(user.id);
					const projection = deriveRankingProjection(revision);
					await analytics.record({
						userId: user.id,
						cohortAssignmentId: capture.cohortAssignmentId,
						name: 'ranking-completed',
						category: 'restaurant',
						metadata: {
							orderCoverage: projection.orderCoverage,
							hasUnresolved: revision.unresolvedRelations.length > 0
						}
					});
				}
			}
			redirect(303, localizedPath(`/ranking/restaurants/session/${event.params.sessionId}`));
		} catch (error) {
			if (isRedirect(error)) throw error;
			return fail(409, { section: 'comparison', error: safeError(error) });
		}
	},
	undo: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		try {
			const result = await rankings.undo(
				user.id,
				event.params.sessionId,
				stringField(form, 'evidenceId')
			);
			if (result.undone) {
				const capture = await rankings.captureContext(user.id);
				await analytics.record({
					userId: user.id,
					cohortAssignmentId: capture.cohortAssignmentId,
					name: 'comparison-undone',
					category: 'restaurant',
					metadata: { answeredCount: result.session.progress().answered }
				});
			}
			redirect(303, localizedPath(`/ranking/restaurants/session/${event.params.sessionId}`));
		} catch (error) {
			if (isRedirect(error)) throw error;
			return fail(409, { section: 'comparison', error: safeError(error) });
		}
	},
	publish: async (event) => {
		const user = requireUser(event);
		try {
			await rankings.publishCompletedSession(user.id, event.params.sessionId, 'restaurant');
			redirect(303, localizedPath(`/ranking/restaurants/session/${event.params.sessionId}`));
		} catch (error) {
			if (isRedirect(error)) throw error;
			return fail(409, { section: 'publish', error: safeError(error) });
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
