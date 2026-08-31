import type { ComparisonEvidence } from '../ranking/contracts';
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
	ResolvedPreferenceObservation
} from './contracts';
import { RECOMMENDATION_ENGINE_VERSION_BY_CATEGORY } from './contracts';

function stableFingerprint(observations: readonly ResolvedPreferenceObservation[]) {
	return observations
		.map((observation) => observation.id)
		.sort()
		.join('|');
}

function observationFromEvidence(
	userId: string,
	category: ResolvedPreferenceObservation['category'],
	revisionId: string,
	evidence: ComparisonEvidence
): ResolvedPreferenceObservation | undefined {
	if (evidence.outcome === 'skip') return undefined;
	const [firstPlaceId, secondPlaceId] = evidence.logicalPair;
	const preferredPlaceId =
		evidence.outcome === 'right' ? evidence.rightPlaceId : evidence.leftPlaceId;
	return {
		id: `${revisionId}:${evidence.id}`,
		userId,
		category,
		revisionId,
		firstPlaceId,
		secondPlaceId,
		relation:
			evidence.outcome === 'tie'
				? 'tie'
				: preferredPlaceId === firstPlaceId
					? 'first-preferred'
					: 'second-preferred',
		weight: 1
	};
}

export class PolicyEnforcedRecommendationEvidenceSource implements RecommendationEvidenceSource {
	readonly #candidates: readonly EvidenceCandidate[];
	readonly #policy: ContributionPolicyResolver;

	constructor(candidates: readonly EvidenceCandidate[], policy: ContributionPolicyResolver) {
		this.#candidates = candidates;
		this.#policy = policy;
	}

	read(purpose: ContributionPurpose): RecommendationEvidenceDataset {
		const observations: ResolvedPreferenceObservation[] = [];
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
			const candidateObservations = candidate.revision.activeEvidence
				.filter(
					(evidence) =>
						!quarantined.has(evidence.leftPlaceId) && !quarantined.has(evidence.rightPlaceId)
				)
				.map((evidence) =>
					observationFromEvidence(
						candidate.userId,
						candidate.revision.category,
						candidate.revision.id,
						evidence
					)
				)
				.filter((observation) => observation !== undefined);
			if (decision.decision === 'include' && candidateObservations.length === 0) {
				decision = { ...decision, decision: 'exclude', reason: 'no-resolved-evidence' };
			}
			decisions.push(decision);
			if (decision.decision === 'include') observations.push(...candidateObservations);
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
					decision.decision === 'include' ? stableFingerprint(candidateObservations) : ''
			});
		}

		return {
			purpose,
			observations,
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
