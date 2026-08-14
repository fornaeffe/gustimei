import type { RankingCategory, RankingRevision } from '../ranking/contracts';

export const RECOMMENDATION_ENGINE_VERSION_BY_CATEGORY = {
	restaurant: 'recommendation-restaurant-nearest-neighbor-v1',
	hotel: 'recommendation-hotel-bradley-terry-v1'
} as const;
export const MANDATORY_CONTRIBUTION_POLICY_VERSION = 'contribution-mandatory-v1' as const;
export const OPTIONAL_FIXTURE_POLICY_VERSION = 'contribution-optional-fixture-v1' as const;

export type ContributionPurpose = 'community-model-training' | 'current-user-personalization';
export type ContributionDecisionReason =
	| 'eligible'
	| 'account-deleted'
	| 'category-deleted'
	| 'processing-restricted'
	| 'revision-not-current'
	| 'evidence-invalid'
	| 'synthetic-isolation'
	| 'optional-policy-disabled'
	| 'no-resolved-evidence';

export interface ContributionPolicyContext {
	userId: string;
	category: RankingCategory;
	revisionId: string;
	environment: 'development' | 'test' | 'preview' | 'production';
	provenance: RankingRevision['provenance'];
	accountDeleted: boolean;
	categoryDeleted: boolean;
	currentRevision: boolean;
	evidenceValid: boolean;
	restrictedPurposes: readonly ContributionPurpose[];
	optionalContribution?: Readonly<Partial<Record<ContributionPurpose, boolean>>>;
}

export interface ContributionPolicyDecision {
	decision: 'include' | 'exclude';
	reason: ContributionDecisionReason;
	policyVersion: string;
	purpose: ContributionPurpose;
}

export interface ContributionPolicyResolver {
	resolve(
		purpose: ContributionPurpose,
		context: ContributionPolicyContext
	): ContributionPolicyDecision;
}

export interface ResolvedPreferenceObservation {
	id: string;
	userId: string;
	category: RankingCategory;
	revisionId: string;
	firstPlaceId: string;
	secondPlaceId: string;
	relation: 'first-preferred' | 'second-preferred' | 'tie';
	weight: number;
}

export interface EvidenceCandidate {
	userId: string;
	revision: RankingRevision;
	policyContext: Omit<
		ContributionPolicyContext,
		'userId' | 'category' | 'revisionId' | 'provenance'
	>;
	quarantinedPlaceIds?: readonly string[];
}

export interface ArtifactInvalidationInput {
	userId: string;
	category: RankingCategory;
	revisionId: string;
	purpose: ContributionPurpose;
	policyVersion: string;
	recommendationEngineVersion: (typeof RECOMMENDATION_ENGINE_VERSION_BY_CATEGORY)[RankingCategory];
	decision: ContributionPolicyDecision['decision'];
	reason: ContributionDecisionReason;
	evidenceFingerprint: string;
}

export interface RecommendationEvidenceDataset {
	purpose: ContributionPurpose;
	observations: readonly ResolvedPreferenceObservation[];
	decisions: readonly ContributionPolicyDecision[];
	exclusionCounts: Readonly<Partial<Record<ContributionDecisionReason, number>>>;
	invalidationInputs: readonly ArtifactInvalidationInput[];
}

export interface RecommendationEvidenceSource {
	read(purpose: ContributionPurpose): RecommendationEvidenceDataset;
}

export interface RecommendationScore {
	placeId: string;
	score: number;
	visited: boolean;
	supported: boolean;
}
