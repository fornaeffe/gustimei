import { pgEnum } from 'drizzle-orm/pg-core';

export const rankingCategoryEnum = pgEnum('ranking_category', ['restaurant', 'hotel']);
export const captureProvenanceEnum = pgEnum('capture_provenance', [
	'synthetic',
	'internal-testing',
	'private-beta',
	'general-release'
]);
export const applicationEnvironmentEnum = pgEnum('application_environment', [
	'development',
	'test',
	'preview',
	'production'
]);
export const dataClassEnum = pgEnum('data_class', ['real', 'synthetic']);
export const osmElementTypeEnum = pgEnum('osm_element_type', ['node', 'way', 'relation']);
export const catalogueImportStatusEnum = pgEnum('catalogue_import_status', [
	'staging',
	'staged',
	'promoted',
	'failed'
]);
export const catalogueRecordStatusEnum = pgEnum('catalogue_record_status', [
	'active',
	'quarantined',
	'hidden'
]);
export const rankingSessionPurposeEnum = pgEnum('ranking_session_purpose', [
	'initial-order',
	'insertion',
	'repair',
	'rebuild'
]);
export const rankingSessionLifecycleEnum = pgEnum('ranking_session_lifecycle', [
	'open',
	'completed',
	'superseded'
]);
export const comparisonOutcomeEnum = pgEnum('comparison_outcome', ['left', 'right', 'tie', 'skip']);
export const comparisonReasonEnum = pgEnum('comparison_reason', [
	'initial-order',
	'binary-insertion',
	'tie-confirmation',
	'contradiction-repair'
]);
export const revisionEvidenceDispositionEnum = pgEnum('revision_evidence_disposition', [
	'active',
	'excluded'
]);
export const evidenceExclusionReasonEnum = pgEnum('evidence_exclusion_reason', [
	'undone',
	'superseded',
	'cycle',
	'tie-conflict',
	'invalidated'
]);
export const unresolvedRelationReasonEnum = pgEnum('unresolved_relation_reason', [
	'missing-evidence',
	'skipped',
	'contradiction'
]);
export const contributionPurposeEnum = pgEnum('contribution_purpose', [
	'community-model-training',
	'current-user-personalization'
]);
