import { error, fail, redirect } from '@sveltejs/kit';
import { runtimeConfig } from '$lib/server/config';
import { db } from '$lib/server/db';
import { NotFoundError } from '$lib/server/domain/errors';
import { deriveRankingDisplay } from '$lib/domain/ranking/revision';
import { currentLocale, localizedPath } from '$lib/server/http/locale';
import { CatalogueRepository } from '$lib/server/repositories/catalogue';
import { ParticipationRepository } from '$lib/server/repositories/participation';
import { PersonalCommentRepository } from '$lib/server/repositories/personal-comments';
import { RankingRepository } from '$lib/server/repositories/rankings';
import { ProductAnalyticsService } from '$lib/server/services/product-analytics';
import { PersonalCommentService } from '$lib/server/services/personal-comments';
import { RecommendationAttributionService } from '$lib/server/services/recommendation-attribution';
import { RankingService } from '$lib/server/services/rankings';
import { ReviewService } from '$lib/server/services/reviews';
import { recommendations } from '$lib/server/services/recommendation-runtime';
import type { Actions, PageServerLoad } from './$types';

const catalogue = new CatalogueRepository(db, runtimeConfig.appEnvironment);
const reviews = new ReviewService(db, runtimeConfig.appEnvironment);
const rankingRepository = new RankingRepository(db);
const participation = new ParticipationRepository(db);
const rankings = new RankingService(rankingRepository, participation, runtimeConfig.appEnvironment);
const analytics = new ProductAnalyticsService(db);
const attribution = new RecommendationAttributionService(db, analytics);
const comments = new PersonalCommentService(new PersonalCommentRepository(db));

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const requestedId = decodeURIComponent(params.placeId);
	try {
		const place = await catalogue.getPublicPlace(requestedId);
		if (place.redirected) {
			const target = new URL(
				localizedPath(`/places/${encodeURIComponent(place.placeId)}`),
				url.origin
			);
			target.search = url.search;
			redirect(308, `${target.pathname}${target.search}`);
		}
		const cursor = url.searchParams.get('reviews') ?? undefined;
		const list = locals.user
			? await rankingRepository.findList(locals.user.id, place.category)
			: undefined;
		const visitedPlaceIds = list
			? await rankingRepository.listVisitedPlaceIds(locals.user!.id, list.id)
			: [];
		const visited = visitedPlaceIds.includes(place.placeId);
		const revision = list
			? await rankingRepository.loadCurrentRevision(locals.user!.id, list.id)
			: undefined;
		const rankingDisplay = revision ? deriveRankingDisplay(revision) : undefined;
		const tierIndex = rankingDisplay?.orderedTiers.findIndex((tier) =>
			tier.placeIds.includes(place.placeId)
		);
		let recommendationTopNational = false;
		if (locals.user) {
			const capture = await rankings.captureContext(locals.user.id);
			const recommendationPage = await recommendations.list({
				userId: locals.user.id,
				category: place.category,
				dataClass: capture.provenance === 'synthetic' ? 'synthetic' : 'real',
				revision,
				visitedPlaceIds,
				all: true
			});
			const supported = recommendationPage.results.filter((item) => item.supported);
			const targetIndex = supported.findIndex((item) => item.placeId === place.placeId);
			recommendationTopNational =
				targetIndex >= 0 && targetIndex < Math.ceil(supported.length * 0.1);
		}
		return {
			place,
			authenticated: Boolean(locals.user),
			visited,
			rankingRelationship:
				tierIndex !== undefined && tierIndex >= 0
					? {
							position: tierIndex + 1,
							tied: rankingDisplay!.orderedTiers[tierIndex].placeIds.length > 1
						}
					: visited
						? { unplaced: true as const }
						: undefined,
			recommendationTopNational,
			personalComment: locals.user
				? (await comments.get(locals.user.id, place.placeId))?.body
				: undefined,
			reviews: await reviews.listPublicPage(place.placeId, currentLocale(), { cursor, limit: 10 })
		};
	} catch (cause) {
		if (cause instanceof NotFoundError) error(404, 'Place not found');
		throw cause;
	}
};

export const actions = {
	addVisited: async (event) => {
		const user = event.locals.user;
		if (!user) redirect(303, localizedPath('/auth/sign-in'));
		const place = await catalogue.getPublicPlace(decodeURIComponent(event.params.placeId));
		const capture = await rankings.captureContext(user.id);
		const result = await rankings.selectVisitedPlace(user.id, place.category, place.placeId);
		if (result.added) {
			await attribution.attributeVisitedConversion({
				userId: user.id,
				category: place.category,
				placeId: place.placeId,
				cohortAssignmentId: capture.cohortAssignmentId,
				provenance: capture.provenance
			});
		}
		return { section: 'visited', added: result.added };
	},
	saveComment: async (event) => {
		const user = event.locals.user;
		if (!user) redirect(303, localizedPath('/auth/sign-in'));
		const place = await catalogue.getPublicPlace(decodeURIComponent(event.params.placeId));
		try {
			await comments.save(
				user.id,
				place.placeId,
				String((await event.request.formData()).get('body') ?? '')
			);
			return { section: 'comment', saved: true };
		} catch (cause) {
			return fail(400, {
				section: 'comment',
				error: cause instanceof Error ? cause.message : 'Comment could not be saved'
			});
		}
	},
	deleteComment: async (event) => {
		const user = event.locals.user;
		if (!user) redirect(303, localizedPath('/auth/sign-in'));
		const place = await catalogue.getPublicPlace(decodeURIComponent(event.params.placeId));
		await comments.delete(user.id, place.placeId);
		return { section: 'comment', deleted: true };
	}
} satisfies Actions;
