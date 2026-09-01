import { fail, isRedirect, redirect, type RequestEvent } from '@sveltejs/kit';
import { deriveRankingDisplay, deriveRankingProjection } from '$lib/domain/ranking/revision';
import { runtimeConfig } from '$lib/server/config';
import { db } from '$lib/server/db';
import { ConflictError, DomainValidationError, NotFoundError } from '$lib/server/domain/errors';
import { requireUser } from '$lib/server/http/auth-guard';
import { localizedPath } from '$lib/server/http/locale';
import { ParticipationRepository } from '$lib/server/repositories/participation';
import { PersonalCommentRepository } from '$lib/server/repositories/personal-comments';
import { RankingRepository } from '$lib/server/repositories/rankings';
import { stringField } from '$lib/server/security/auth-forms';
import { PersonalCommentService } from '$lib/server/services/personal-comments';
import { RankingService } from '$lib/server/services/rankings';
import type { Actions, PageServerLoad } from './$types';

const repository = new RankingRepository(db);
const rankings = new RankingService(
	repository,
	new ParticipationRepository(db),
	runtimeConfig.appEnvironment
);
const comments = new PersonalCommentService(new PersonalCommentRepository(db));

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
	return {
		openSession: openSession?.summary(),
		projection: revision ? deriveRankingProjection(revision) : undefined,
		tiers:
			display?.orderedTiers.map((tier, index) => ({
				position: index + 1,
				places: tier.placeIds.flatMap((placeId) => {
					const place = placeById.get(placeId);
					return place ? [place] : [];
				})
			})) ?? [],
		unplaced: places.filter((place) => !rankedIds.has(place.placeId)),
		unresolved:
			display?.unresolvedPlaceGroups.flatMap((group) =>
				group.flatMap((placeId) => {
					const place = placeById.get(placeId);
					return place ? [place] : [];
				})
			) ?? []
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
	}
} satisfies Actions;
