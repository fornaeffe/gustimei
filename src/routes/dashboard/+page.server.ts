import { deriveRankingDisplay } from '$lib/domain/ranking/revision';
import { db } from '$lib/server/db';
import { requireUser } from '$lib/server/http/auth-guard';
import { RankingRepository } from '$lib/server/repositories/rankings';
import type { PageServerLoad } from './$types';

const rankings = new RankingRepository(db);

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const list = await rankings.findList(user.id, 'restaurant');
	const [placeIds, revision] = list
		? await Promise.all([
				rankings.listVisitedPlaceIds(user.id, list.id),
				rankings.loadCurrentRevision(user.id, list.id)
			])
		: [[], undefined];
	let restaurantRanking;
	if (list && revision) {
		const display = deriveRankingDisplay(revision);
		const completedSession = await rankings.findCompletedSessionForRevision(
			user.id,
			list.id,
			revision.id
		);
		restaurantRanking = {
			sessionId: completedSession?.id,
			rankedPlaces: display.orderedTiers.flatMap((tier) => tier.placeIds).length,
			unresolvedPlaces: display.unresolvedPlaceGroups.flat().length
		};
	}
	return {
		email: user.email,
		emailVerified: user.emailVerified,
		restaurantPlaces: placeIds.length,
		restaurantRanking
	};
};
