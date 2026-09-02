export const RANKING_ENGINE_VERSION = 'ranking-v2-tier-adjustments' as const;

export type PlaceId = string;
export type RankingCategory = 'restaurant' | 'hotel';
export type ComparisonOutcome = 'left' | 'right' | 'tie' | 'skip';
export type ComparisonReason =
	| 'initial-order'
	| 'binary-insertion'
	| 'tie-confirmation'
	| 'contradiction-repair'
	| 'adjacent-adjustment';
export type RankingDirection = 'up' | 'down';

export interface ComparisonRequest {
	id: string;
	logicalPair: readonly [PlaceId, PlaceId];
	leftPlaceId: PlaceId;
	rightPlaceId: PlaceId;
	reason: ComparisonReason;
}

export interface ComparisonEvidence extends ComparisonRequest {
	sequence: number;
	outcome: ComparisonOutcome;
	active: boolean;
	supersedesEvidenceId?: string;
}

export type ExclusionReason = 'undone' | 'superseded' | 'cycle' | 'tie-conflict' | 'invalidated';

export interface ExcludedEvidence {
	evidence: ComparisonEvidence;
	reason: ExclusionReason;
	conflictingEvidenceIds: readonly string[];
}

export interface EquivalenceTier {
	readonly placeIds: readonly PlaceId[];
}

export interface UnresolvedRelation {
	readonly firstPlaceId: PlaceId;
	readonly secondPlaceId: PlaceId;
	reason: 'missing-evidence' | 'skipped' | 'contradiction';
}

export interface RepairRequirement {
	placeIds: readonly PlaceId[];
	evidenceIds: readonly string[];
	reason: 'cycle' | 'tie-conflict';
	scope: 'local' | 'rebuild';
}

export interface RankingRevision {
	id: string;
	listId: string;
	category: RankingCategory;
	revision: number;
	activePlaceIds: readonly PlaceId[];
	orderedTiers: readonly EquivalenceTier[];
	unresolvedRelations: readonly UnresolvedRelation[];
	activeEvidence: readonly ComparisonEvidence[];
	excludedEvidence: readonly ExcludedEvidence[];
	rankingEngineVersion: typeof RANKING_ENGINE_VERSION;
	provenance: 'synthetic' | 'internal-testing' | 'private-beta' | 'general-release';
	publishedAt: string;
}

export type OrderCoverage = 'none' | 'partial' | 'total';

export interface RankingProgress {
	answered: number;
	estimatedTotal: number;
	estimatedRemaining: number;
	fraction: number;
	isEstimate: true;
}

export type RankingSessionPurpose =
	'initial-order' | 'insertion' | 'repair' | 'rebuild' | 'adjustment' | 'reposition';
export type RankingSessionLifecycle = 'open' | 'completed' | 'superseded';

export interface RankingSessionSummary {
	id: string;
	listId: string;
	baseRevisionId?: string;
	purpose: RankingSessionPurpose;
	lifecycle: RankingSessionLifecycle;
	progress: RankingProgress;
}

export type RankingNextAction =
	| { type: 'select-places'; minimumAdditionalPlaces: number }
	| { type: 'resume-session'; sessionId: string; purpose: RankingSessionPurpose }
	| { type: 'repair'; requirement: RepairRequirement }
	| { type: 'continue-ranking' }
	| { type: 'view-ranking' };

export interface RankingProjection {
	orderCoverage: OrderCoverage;
	repairRequirement?: RepairRequirement;
	nextAction: RankingNextAction;
}
