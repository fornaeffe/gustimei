import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import { runtimeConfig } from '$lib/server/config';
import { db } from '$lib/server/db';
import { requireUser } from '$lib/server/http/auth-guard';
import { DomainValidationError } from '$lib/server/domain/errors';
import { localizedPath } from '$lib/server/http/locale';
import { ParticipationRepository } from '$lib/server/repositories/participation';
import { RankingRepository } from '$lib/server/repositories/rankings';
import { stringField } from '$lib/server/security/auth-forms';
import { ProductAnalyticsService } from '$lib/server/services/product-analytics';
import { RecommendationAttributionService } from '$lib/server/services/recommendation-attribution';
import {
	recommendationArtifacts,
	recommendations
} from '$lib/server/services/recommendation-runtime';
import { RankingService } from '$lib/server/services/rankings';
import type { Actions, PageServerLoad } from './$types';

const rankingRepository = new RankingRepository(db);
const participation = new ParticipationRepository(db);
const rankings = new RankingService(rankingRepository, participation, runtimeConfig.appEnvironment);
const analytics = new ProductAnalyticsService(db);
const attribution = new RecommendationAttributionService(db, analytics);

async function context(userId: string) {
	const capture = await rankings.captureContext(userId);
	const list = await rankingRepository.findList(userId, 'restaurant');
	const [visitedPlaceIds, revision] = list
		? await Promise.all([
				rankingRepository.listVisitedPlaceIds(userId, list.id),
				rankingRepository.loadCurrentRevision(userId, list.id)
			])
		: [[], undefined];
	return {
		capture,
		list,
		visitedPlaceIds,
		revision,
		dataClass: capture.provenance === 'synthetic' ? ('synthetic' as const) : ('real' as const)
	};
}

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const current = await context(user.id);
	const locality = event.url.searchParams.get('locality')?.trim().slice(0, 120) ?? '';
	const cursor = event.url.searchParams.get('cursor') ?? undefined;
	try {
		return {
			locality,
			page: await recommendations.list({
				userId: user.id,
				category: 'restaurant',
				dataClass: current.dataClass,
				revision: current.revision,
				visitedPlaceIds: current.visitedPlaceIds,
				locality,
				cursor
			})
		};
	} catch (cause) {
		if (cause instanceof DomainValidationError) error(400, cause.message);
		throw cause;
	}
};

export const actions = {
	exposed: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		const artifactId = stringField(form, 'artifactId');
		const submitted = form
			.getAll('placeId')
			.filter((value): value is string => typeof value === 'string');
		const current = await context(user.id);
		const artifact = await recommendationArtifacts.load(
			'restaurant',
			current.dataClass,
			artifactId
		);
		if (!artifact) return fail(409, { section: 'exposure', error: 'Snapshot expired' });
		const visited = new Set(current.visitedPlaceIds);
		const eligible = submitted.filter(
			(placeId) => Object.hasOwn(artifact.placeSupport, placeId) && !visited.has(placeId)
		);
		await attribution.recordRenderedExposures({
			userId: user.id,
			category: 'restaurant',
			cohortAssignmentId: current.capture.cohortAssignmentId,
			provenance: current.capture.provenance,
			artifactId,
			rankingRevisionId: current.revision?.id,
			eligibleUnvisitedPlaceIds: eligible
		});
		return { section: 'exposure', recorded: true };
	},
	addVisited: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		const placeId = stringField(form, 'placeId');
		try {
			const current = await context(user.id);
			const result = await rankings.selectVisitedPlace(user.id, 'restaurant', placeId);
			if (result.added) {
				await attribution.attributeVisitedConversion({
					userId: user.id,
					category: 'restaurant',
					placeId,
					cohortAssignmentId: current.capture.cohortAssignmentId,
					provenance: current.capture.provenance
				});
				if (current.list?.currentRevisionId) {
					const session = await rankings.startInsertionSession(user.id, current.list.id, placeId);
					redirect(303, localizedPath(`/ranking/restaurants/session/${session.id}`));
				}
			}
			return { section: 'visited', added: result.added, placeId };
		} catch (error) {
			if (isRedirect(error)) throw error;
			return fail(400, {
				section: 'visited',
				error: error instanceof Error ? error.message : 'The place could not be added'
			});
		}
	}
} satisfies Actions;
