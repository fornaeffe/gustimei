import { error, redirect } from '@sveltejs/kit';
import { runtimeConfig } from '$lib/server/config';
import { db } from '$lib/server/db';
import { NotFoundError } from '$lib/server/domain/errors';
import { currentLocale, localizedPath } from '$lib/server/http/locale';
import { CatalogueRepository } from '$lib/server/repositories/catalogue';
import { ParticipationRepository } from '$lib/server/repositories/participation';
import { RankingRepository } from '$lib/server/repositories/rankings';
import { ProductAnalyticsService } from '$lib/server/services/product-analytics';
import { RecommendationAttributionService } from '$lib/server/services/recommendation-attribution';
import { RankingService } from '$lib/server/services/rankings';
import { ReviewService } from '$lib/server/services/reviews';
import type { Actions, PageServerLoad } from './$types';

const catalogue = new CatalogueRepository(db, runtimeConfig.appEnvironment);
const reviews = new ReviewService(db, runtimeConfig.appEnvironment);
const rankingRepository = new RankingRepository(db);
const participation = new ParticipationRepository(db);
const rankings = new RankingService(rankingRepository, participation, runtimeConfig.appEnvironment);
const analytics = new ProductAnalyticsService(db);
const attribution = new RecommendationAttributionService(db, analytics);

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
		const visited = list
			? (await rankingRepository.listVisitedPlaceIds(locals.user!.id, list.id)).includes(
					place.placeId
				)
			: false;
		return {
			place,
			authenticated: Boolean(locals.user),
			visited,
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
		const existing = await rankingRepository.findList(user.id, place.category);
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
			if (place.category === 'restaurant' && existing?.currentRevisionId) {
				const session = await rankings.startInsertionSession(user.id, existing.id, place.placeId);
				redirect(303, localizedPath(`/ranking/restaurants/session/${session.id}`));
			}
		}
		return { section: 'visited', added: result.added };
	}
} satisfies Actions;
