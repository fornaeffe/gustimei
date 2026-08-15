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

export const catalogueRoleEnum = pgEnum('catalogue_role', ['admin', 'catalogue_curator']);
export const catalogueRoleGrantSourceEnum = pgEnum('catalogue_role_grant_source', [
	'bootstrap',
	'admin-grant',
	'rotation',
	'break-glass'
]);
export const catalogueAuditActorRoleEnum = pgEnum('catalogue_audit_actor_role', [
	'user',
	'catalogue_curator',
	'admin',
	'operator',
	'system'
]);
export const catalogueIssueTypeEnum = pgEnum('catalogue_issue_type', [
	'wrong-name',
	'wrong-location',
	'wrong-category',
	'duplicate',
	'closed-or-missing',
	'unsafe-content',
	'other'
]);
export const catalogueIssueStatusEnum = pgEnum('catalogue_issue_status', [
	'submitted',
	'triaged',
	'resolved',
	'rejected'
]);
export const catalogueOverrideReviewStatusEnum = pgEnum('catalogue_override_review_status', [
	'approved',
	'review-required',
	'upstream-match',
	'conflict',
	'retired'
]);
export const catalogueChangeActionEnum = pgEnum('catalogue_change_action', [
	'issue-submitted',
	'issue-triaged',
	'issue-resolved',
	'issue-rejected',
	'override-applied',
	'override-retired',
	'place-quarantined',
	'place-unquarantined',
	'merge-applied',
	'merge-reversed',
	'exceptional-removal',
	'exceptional-removal-reversed',
	'category-migrated',
	'role-granted',
	'role-revoked',
	'role-rotated',
	'role-break-glass',
	'import-conflict'
]);
export const catalogueRepairStatusEnum = pgEnum('catalogue_repair_status', [
	'pending',
	'completed',
	'cancelled'
]);
