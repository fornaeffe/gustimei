import { error, redirect } from '@sveltejs/kit';
import { runtimeConfig } from '$lib/server/config';
import { db } from '$lib/server/db';
import { NotFoundError } from '$lib/server/domain/errors';
import { currentLocale, localizedPath } from '$lib/server/http/locale';
import { CatalogueRepository } from '$lib/server/repositories/catalogue';
import { ReviewService } from '$lib/server/services/reviews';
import type { PageServerLoad } from './$types';

const catalogue = new CatalogueRepository(db, runtimeConfig.appEnvironment);
const reviews = new ReviewService(db, runtimeConfig.appEnvironment);

export const load: PageServerLoad = async ({ params, url }) => {
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
		return {
			place,
			reviews: await reviews.listPublicPage(place.placeId, currentLocale(), { cursor, limit: 10 })
		};
	} catch (cause) {
		if (cause instanceof NotFoundError) error(404, 'Place not found');
		throw cause;
	}
};
