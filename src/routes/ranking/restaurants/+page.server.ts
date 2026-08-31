import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { deriveRankingProjection } from '$lib/domain/ranking/revision';
import { runtimeConfig } from '$lib/server/config';
import { db } from '$lib/server/db';
import { ConflictError, DomainValidationError, NotFoundError } from '$lib/server/domain/errors';
import { requireUser } from '$lib/server/http/auth-guard';
import { localizedPath } from '$lib/server/http/locale';
import { CatalogueRepository } from '$lib/server/repositories/catalogue';
import { ParticipationRepository } from '$lib/server/repositories/participation';
import { PersonalCommentRepository } from '$lib/server/repositories/personal-comments';
import { RankingRepository } from '$lib/server/repositories/rankings';
import { stringField } from '$lib/server/security/auth-forms';
import { PersonalCommentService } from '$lib/server/services/personal-comments';
import { ProductAnalyticsService } from '$lib/server/services/product-analytics';
import { RecommendationAttributionService } from '$lib/server/services/recommendation-attribution';
import { RankingService } from '$lib/server/services/rankings';
import type { Actions, PageServerLoad } from './$types';

const catalogue = new CatalogueRepository(db, runtimeConfig.appEnvironment);
const participation = new ParticipationRepository(db);
const rankingRepository = new RankingRepository(db);
const rankings = new RankingService(rankingRepository, participation, runtimeConfig.appEnvironment);
const comments = new PersonalCommentService(new PersonalCommentRepository(db));
const analytics = new ProductAnalyticsService(db);
const recommendationAttribution = new RecommendationAttributionService(db, analytics);

function safeError(error: unknown) {
	if (
		error instanceof ConflictError ||
		error instanceof DomainValidationError ||
		error instanceof NotFoundError
	)
		return error.message;
	throw error;
}

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const name = event.url.searchParams.get('q')?.trim().slice(0, 120) ?? '';
	const locality = event.url.searchParams.get('locality')?.trim().slice(0, 120) ?? '';
	const capture = await rankings.captureContext(user.id);
	const [selected, results] = await Promise.all([
		rankings.listVisitedPlaces(user.id, 'restaurant'),
		name || locality
			? catalogue.search({
					category: 'restaurant',
					dataClass: capture.provenance === 'synthetic' ? 'synthetic' : 'real',
					text: [name, locality].filter(Boolean).join(' '),
					limit: 24
				})
			: []
	]);
	if (name || locality) {
		await analytics.record({
			userId: user.id,
			cohortAssignmentId: capture.cohortAssignmentId,
			name: 'catalogue-search',
			category: 'restaurant',
			metadata: { resultCount: results.length, localityFiltered: Boolean(locality) }
		});
	}
	const selectedIds = new Set(selected.map((item) => item.placeId));
	const list = selected[0] ? await rankingRepository.findList(user.id, 'restaurant') : undefined;
	const currentRevision = list
		? await rankingRepository.loadCurrentRevision(user.id, list.id)
		: undefined;
	const openSession = selected[0]
		? await rankingRepository.findOpenSession(user.id, selected[0].listId)
		: undefined;
	return {
		query: { name, locality },
		selected,
		list: list
			? {
					id: list.id,
					currentRevisionId: currentRevision?.id,
					projection: currentRevision
						? deriveRankingProjection(currentRevision, openSession?.summary())
						: undefined
				}
			: undefined,
		openSession: openSession?.summary(),
		results: results.map((result) => ({ ...result, selected: selectedIds.has(result.placeId) }))
	};
};

export const actions = {
	add: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		try {
			const existingList = await rankingRepository.findList(user.id, 'restaurant');
			const result = await rankings.selectVisitedPlace(
				user.id,
				'restaurant',
				stringField(form, 'placeId')
			);
			const selected = await rankings.listVisitedPlaces(user.id, 'restaurant');
			const capture = await rankings.captureContext(user.id);
			if (result.added) {
				await recommendationAttribution.attributeVisitedConversion({
					userId: user.id,
					category: 'restaurant',
					placeId: stringField(form, 'placeId'),
					cohortAssignmentId: capture.cohortAssignmentId,
					provenance: capture.provenance
				});
			}
			await analytics.record({
				userId: user.id,
				cohortAssignmentId: capture.cohortAssignmentId,
				name: 'visited-place-added',
				category: 'restaurant',
				metadata: { selectedCount: selected.length, duplicate: !result.added }
			});
			if (result.added && selected.length === 2) {
				await analytics.record({
					userId: user.id,
					cohortAssignmentId: capture.cohortAssignmentId,
					name: 'ranking-threshold-reached',
					category: 'restaurant',
					metadata: { selectedCount: selected.length }
				});
			}
			if (result.added && existingList?.currentRevisionId) {
				const session = await rankings.startInsertionSession(
					user.id,
					existingList.id,
					stringField(form, 'placeId')
				);
				redirect(303, localizedPath(`/ranking/restaurants/session/${session.id}`));
			}
			return { section: 'selection', added: result.added };
		} catch (error) {
			if (isRedirect(error)) throw error;
			return fail(400, { section: 'selection', error: safeError(error) });
		}
	},
	remove: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		try {
			const removed = await rankings.removeUnrankedVisitedPlace(
				user.id,
				'restaurant',
				stringField(form, 'placeId')
			);
			if (removed) {
				const selected = await rankings.listVisitedPlaces(user.id, 'restaurant');
				const capture = await rankings.captureContext(user.id);
				await analytics.record({
					userId: user.id,
					cohortAssignmentId: capture.cohortAssignmentId,
					name: 'visited-place-removed',
					category: 'restaurant',
					metadata: { selectedCount: selected.length }
				});
			}
			return { section: 'selection', removed };
		} catch (error) {
			return fail(409, { section: 'selection', error: safeError(error) });
		}
	},
	saveComment: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		const placeId = stringField(form, 'placeId');
		try {
			await comments.save(user.id, placeId, stringField(form, 'body'));
			return { section: 'comment', saved: true, placeId };
		} catch (error) {
			return fail(400, { section: 'comment', error: safeError(error) });
		}
	},
	deleteComment: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		await comments.delete(user.id, stringField(form, 'placeId'));
		return { section: 'comment', deleted: true };
	},
	start: async (event) => {
		const user = requireUser(event);
		try {
			const list = await rankingRepository.findList(user.id, 'restaurant');
			if (!list) throw new DomainValidationError('Select at least two restaurants first');
			const session = await rankings.startInitialSession(user.id, list.id);
			const selected = await rankings.listVisitedPlaces(user.id, 'restaurant');
			const capture = await rankings.captureContext(user.id);
			await analytics.record({
				userId: user.id,
				cohortAssignmentId: capture.cohortAssignmentId,
				name: 'ranking-started',
				category: 'restaurant',
				metadata: { selectedCount: selected.length }
			});
			redirect(303, localizedPath(`/ranking/restaurants/session/${session.id}`));
		} catch (error) {
			if (isRedirect(error)) throw error;
			return fail(400, { section: 'ranking', error: safeError(error) });
		}
	},
	repair: async (event) => {
		const user = requireUser(event);
		try {
			const list = await rankingRepository.findList(user.id, 'restaurant');
			if (!list) throw new NotFoundError('The ranking list was not found');
			const session = await rankings.startRepairSession(user.id, list.id);
			redirect(303, localizedPath(`/ranking/restaurants/session/${session.id}`));
		} catch (error) {
			if (isRedirect(error)) throw error;
			return fail(409, { section: 'ranking', error: safeError(error) });
		}
	},
	deleteCategory: async (event) => {
		const user = requireUser(event);
		try {
			await rankingRepository.deleteCategory(user.id, 'restaurant');
			return { section: 'ranking', deleted: true };
		} catch (error) {
			return fail(409, { section: 'ranking', error: safeError(error) });
		}
	}
} satisfies Actions;
