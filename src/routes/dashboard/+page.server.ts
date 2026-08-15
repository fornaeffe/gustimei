import { and, count, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { rankingList, rankingListPlace } from '$lib/server/db/schema';
import { requireUser } from '$lib/server/http/auth-guard';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const [summary] = await db
		.select({ places: count(rankingListPlace.placeId), listId: rankingList.id })
		.from(rankingList)
		.leftJoin(rankingListPlace, eq(rankingListPlace.listId, rankingList.id))
		.where(and(eq(rankingList.ownerId, user.id), eq(rankingList.category, 'restaurant')))
		.groupBy(rankingList.id)
		.limit(1);
	return {
		email: user.email,
		emailVerified: user.emailVerified,
		restaurantPlaces: summary?.places ?? 0
	};
};
