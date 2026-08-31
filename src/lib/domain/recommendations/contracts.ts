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
	provenance: RankingRevision['provenance'];
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

export const RECOMMENDATION_ARTIFACT_SCHEMA_VERSION = 1 as const;
export const RECOMMENDATION_PAGE_SIZE = 24 as const;
export const RECOMMENDATION_MAX_BROWSABLE_DEPTH = 1_000 as const;
export const PERSONALIZATION_GATE = {
	rankedPlaces: 5,
	resolvedTiers: 3,
	supportedRankedPlaces: 4,
	minimumCommunitySupport: 4
} as const;

export interface RecommendationArtifactRanking {
	userId: string;
	tiers: string[][];
}

export interface RecommendationArtifact {
	schemaVersion: typeof RECOMMENDATION_ARTIFACT_SCHEMA_VERSION;
	id: string;
	category: RankingCategory;
	dataClass: 'real' | 'synthetic';
	engineVersion: (typeof RECOMMENDATION_ENGINE_VERSION_BY_CATEGORY)[RankingCategory];
	contributionPolicyVersion: string;
	evidenceFingerprint: string;
	catalogueFingerprint: string;
	generatedAt: string;
	observationCount: number;
	contributorCount: number;
	rankings: RecommendationArtifactRanking[];
	placeSupport: Record<string, number>;
}

export type RecommendationMode = 'personalized' | 'community-prior' | 'insufficient-evidence';

export interface RecommendationServingGate {
	mode: RecommendationMode;
	rankedPlaces: number;
	resolvedTiers: number;
	supportedRankedPlaces: number;
	required: typeof PERSONALIZATION_GATE;
}
