import type { RankingRevision } from '../ranking/contracts';
import { deriveTieredRankingFromCurrentRevision } from './evidence';
import { trainGlobalPrior, trainNearestNeighbor, type TieredRanking } from './models';
import {
	PERSONALIZATION_GATE,
	type RecommendationArtifact,
	type RecommendationScore,
	type RecommendationServingGate
} from './contracts';

export function deriveServingGate(
	userId: string,
	revision: RankingRevision | undefined,
	artifact: RecommendationArtifact
): RecommendationServingGate {
	const ranking = revision ? deriveTieredRankingFromCurrentRevision(userId, revision) : undefined;
	const places = ranking?.tiers.flat() ?? [];
	const supportedRankedPlaces = places.filter(
		(placeId) =>
			(artifact.placeSupport[placeId] ?? 0) >= PERSONALIZATION_GATE.minimumCommunitySupport
	).length;
	const hasSupportedEvidence = Object.values(artifact.placeSupport).some(
		(support) => support >= PERSONALIZATION_GATE.minimumCommunitySupport
	);
	const eligible =
		places.length >= PERSONALIZATION_GATE.rankedPlaces &&
		(ranking?.tiers.length ?? 0) >= PERSONALIZATION_GATE.resolvedTiers &&
		supportedRankedPlaces >= PERSONALIZATION_GATE.supportedRankedPlaces;
	return {
		mode: eligible
			? 'personalized'
			: hasSupportedEvidence
				? 'community-prior'
				: 'insufficient-evidence',
		rankedPlaces: places.length,
		resolvedTiers: ranking?.tiers.length ?? 0,
		supportedRankedPlaces,
		required: PERSONALIZATION_GATE
	};
}

export function scoreRecommendationCandidates(input: {
	userId: string;
	revision?: RankingRevision;
	artifact: RecommendationArtifact;
	candidatePlaceIds: readonly string[];
	visitedPlaceIds: ReadonlySet<string>;
}) {
	const rankings: TieredRanking[] = input.artifact.rankings.map((ranking) => ({
		userId: ranking.userId,
		category: input.artifact.category,
		tiers: ranking.tiers
	}));
	const gate = deriveServingGate(input.userId, input.revision, input.artifact);
	const prior = trainGlobalPrior(rankings);
	const currentRanking = input.revision
		? deriveTieredRankingFromCurrentRevision(input.userId, input.revision)
		: undefined;
	const personalized =
		gate.mode === 'personalized' && currentRanking
			? trainNearestNeighbor(rankings).personalize?.(currentRanking)
			: undefined;
	const scores: RecommendationScore[] = input.candidatePlaceIds.map((placeId) => ({
		placeId,
		score: personalized?.(placeId) ?? prior.score(input.userId, placeId),
		visited: input.visitedPlaceIds.has(placeId),
		supported:
			(input.artifact.placeSupport[placeId] ?? 0) >= PERSONALIZATION_GATE.minimumCommunitySupport
	}));
	scores.sort(
		(first, second) =>
			Number(Number.isFinite(second.score)) - Number(Number.isFinite(first.score)) ||
			second.score - first.score ||
			first.placeId.localeCompare(second.placeId)
	);
	return { gate, scores };
}
