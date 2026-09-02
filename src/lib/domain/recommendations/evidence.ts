import type { RankingRevision } from '../ranking/contracts';
import type { TieredRanking } from './models';
import type {
	ArtifactInvalidationInput,
	ContributionPolicyDecision,
	ContributionPolicyResolver,
	ContributionPurpose,
	EvidenceCandidate,
	RecommendationEvidenceDataset,
	RecommendationEvidenceSource,
	ResolvedRankingObservation
} from './contracts';
import { RECOMMENDATION_ENGINE_VERSION_BY_CATEGORY } from './contracts';

function stableFingerprint(rankings: readonly ResolvedRankingObservation[]) {
	return rankings
		.map((ranking) => `${ranking.id}:${ranking.tiers.map((tier) => tier.join(',')).join('>')}`)
		.sort()
		.join('|');
}

export class PolicyEnforcedRecommendationEvidenceSource implements RecommendationEvidenceSource {
	readonly #candidates: readonly EvidenceCandidate[];
	readonly #policy: ContributionPolicyResolver;

	constructor(candidates: readonly EvidenceCandidate[], policy: ContributionPolicyResolver) {
		this.#candidates = candidates;
		this.#policy = policy;
	}

	read(purpose: ContributionPurpose): RecommendationEvidenceDataset {
		const rankings: ResolvedRankingObservation[] = [];
		const decisions: ContributionPolicyDecision[] = [];
		const invalidationInputs: ArtifactInvalidationInput[] = [];
		const exclusionCounts: Record<string, number> = {};

		for (const candidate of this.#candidates) {
			const context = {
				...candidate.policyContext,
				userId: candidate.userId,
				category: candidate.revision.category,
				revisionId: candidate.revision.id,
				provenance: candidate.revision.provenance
			};
			let decision = this.#policy.resolve(purpose, context);
			const quarantined = new Set(candidate.quarantinedPlaceIds ?? []);
			const tiered = deriveTieredRankingFromCurrentRevision(candidate.userId, candidate.revision);
			const tiers = tiered.tiers
				.map((tier) => tier.filter((placeId) => !quarantined.has(placeId)))
				.filter((tier) => tier.length > 0);
			const placeCount = tiers.reduce((count, tier) => count + tier.length, 0);
			const hasResolvedRelation = placeCount >= 2 && (tiers.length > 1 || tiers[0]?.length > 1);
			const candidateRankings: ResolvedRankingObservation[] = hasResolvedRelation
				? [
						{
							id: candidate.revision.id,
							userId: candidate.userId,
							category: candidate.revision.category,
							revisionId: candidate.revision.id,
							tiers
						}
					]
				: [];
			if (decision.decision === 'include' && candidateRankings.length === 0) {
				decision = { ...decision, decision: 'exclude', reason: 'no-resolved-evidence' };
			}
			decisions.push(decision);
			if (decision.decision === 'include') rankings.push(...candidateRankings);
			else exclusionCounts[decision.reason] = (exclusionCounts[decision.reason] ?? 0) + 1;
			invalidationInputs.push({
				userId: candidate.userId,
				category: candidate.revision.category,
				revisionId: candidate.revision.id,
				provenance: candidate.revision.provenance,
				purpose,
				policyVersion: decision.policyVersion,
				recommendationEngineVersion:
					RECOMMENDATION_ENGINE_VERSION_BY_CATEGORY[candidate.revision.category],
				decision: decision.decision,
				reason: decision.reason,
				evidenceFingerprint:
					decision.decision === 'include' ? stableFingerprint(candidateRankings) : ''
			});
		}

		return {
			purpose,
			rankings,
			decisions,
			exclusionCounts,
			invalidationInputs
		};
	}
}

export function deriveTieredRankingFromCurrentRevision(
	userId: string,
	revision: RankingRevision
): TieredRanking {
	const unresolvedPlaces = new Set(
		revision.unresolvedRelations.flatMap((relation) => [
			relation.firstPlaceId,
			relation.secondPlaceId
		])
	);
	return {
		userId,
		category: revision.category,
		tiers: revision.orderedTiers
			.map((tier) => tier.placeIds.filter((placeId) => !unresolvedPlaces.has(placeId)))
			.filter((tier) => tier.length > 0)
	};
}
