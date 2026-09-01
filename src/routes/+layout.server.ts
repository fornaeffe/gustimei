import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { RankingRepository } from '$lib/server/repositories/rankings';
import { deriveRankingProjection } from '$lib/domain/ranking/revision';

const rankings = new RankingRepository(db);

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) return { user: null, pendingRankingCount: 0 };
	const list = await rankings.findList(locals.user.id, 'restaurant');
	const [visitedPlaceIds, revision, openSession] = list
		? await Promise.all([
				rankings.listVisitedPlaceIds(locals.user.id, list.id),
				rankings.loadCurrentRevision(locals.user.id, list.id),
				rankings.findOpenSession(locals.user.id, list.id)
			])
		: [[], undefined, undefined];
	return {
		user: { email: locals.user.email, emailVerified: locals.user.emailVerified },
		pendingRankingCount: Math.max(
			openSession ? 1 : 0,
			revision
				? Math.max(
						visitedPlaceIds.filter((placeId) => !revision.activePlaceIds.includes(placeId)).length,
						['repair', 'continue-ranking'].includes(
							deriveRankingProjection(revision).nextAction.type
						)
							? 1
							: 0
					)
				: visitedPlaceIds.length >= 2
					? visitedPlaceIds.length
					: 0
		)
	};
};
