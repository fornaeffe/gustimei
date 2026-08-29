import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	date,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { user } from './auth.schema';
import { place } from './catalogue.schema';
import { cataloguePlaceRedirect } from './governance.schema';
import {
	applicationEnvironmentEnum,
	ownerAssertionStateEnum,
	publicProfileLifecycleEnum,
	reviewCasePartyRoleEnum,
	reviewCatalogueConflictStatusEnum,
	reviewChangeKindEnum,
	reviewDecisionOutcomeEnum,
	reviewEvidenceScanStateEnum,
	reviewModerationActorTypeEnum,
	reviewModeratorRoleEnum,
	reviewNoticeKindEnum,
	reviewNoticeStatusEnum,
	reviewNotificationStateEnum,
	reviewPublicationLifecycleEnum,
	reviewRedressStatusEnum
} from './enums';

const eventTimestamp = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const reviewModeratorAssignment = pgTable(
	'review_moderator_assignment',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: reviewModeratorRoleEnum('role').notNull(),
		environment: applicationEnvironmentEnum('environment').notNull(),
		grantedByUserId: text('granted_by_user_id').references(() => user.id, {
			onDelete: 'restrict'
		}),
		operatorReference: text('operator_reference'),
		grantReason: text('grant_reason').notNull(),
		grantedAt: eventTimestamp('granted_at').notNull(),
		revokedByUserId: text('revoked_by_user_id').references(() => user.id, {
			onDelete: 'restrict'
		}),
		revocationReason: text('revocation_reason'),
		revokedAt: eventTimestamp('revoked_at')
	},
	(table) => [
		uniqueIndex('review_moderator_assignment_active_uq')
			.on(table.userId, table.role, table.environment)
			.where(sql`${table.revokedAt} is null`),
		index('review_moderator_assignment_lookup_idx').on(
			table.userId,
			table.environment,
			table.role,
			table.revokedAt
		),
		check(
			'review_moderator_assignment_grant_ck',
			sql`(${table.grantedByUserId} is not null and ${table.operatorReference} is null) or (${table.grantedByUserId} is null and ${table.operatorReference} is not null)`
		),
		check(
			'review_moderator_assignment_revoke_ck',
			sql`(${table.revokedAt} is null and ${table.revokedByUserId} is null and ${table.revocationReason} is null) or (${table.revokedAt} is not null and ${table.revocationReason} is not null)`
		)
	]
);

export const reviewRoleEvent = pgTable(
	'review_role_event',
	{
		id: text('id').primaryKey(),
		assignmentId: text('assignment_id')
			.notNull()
			.references(() => reviewModeratorAssignment.id, { onDelete: 'restrict' }),
		targetUserId: text('target_user_id').notNull(),
		role: reviewModeratorRoleEnum('role').notNull(),
		action: text('action').notNull(),
		actorUserId: text('actor_user_id'),
		operatorReference: text('operator_reference'),
		reason: text('reason').notNull(),
		createdAt: eventTimestamp('created_at').notNull()
	},
	(table) => [
		index('review_role_event_assignment_idx').on(table.assignmentId, table.createdAt),
		check(
			'review_role_event_actor_ck',
			sql`(${table.actorUserId} is not null and ${table.operatorReference} is null) or (${table.actorUserId} is null and ${table.operatorReference} is not null)`
		),
		check('review_role_event_action_ck', sql`${table.action} in ('granted', 'revoked')`)
	]
);

export const publicProfile = pgTable(
	'public_profile',
	{
		userId: text('user_id')
			.primaryKey()
			.references(() => user.id, { onDelete: 'cascade' }),
		pseudonym: text('pseudonym').notNull(),
		normalizedPseudonym: text('normalized_pseudonym').notNull(),
		lifecycle: publicProfileLifecycleEnum('lifecycle').notNull().default('active'),
		createdAt: eventTimestamp('created_at').notNull(),
		updatedAt: eventTimestamp('updated_at').notNull(),
		lastChangedAt: eventTimestamp('last_changed_at').notNull()
	},
	(table) => [
		uniqueIndex('public_profile_pseudonym_uq').on(table.normalizedPseudonym),
		check(
			'public_profile_pseudonym_length_ck',
			sql`char_length(${table.pseudonym}) between 3 and 40`
		)
	]
);

export const reviewPolicyVersion = pgTable(
	'review_policy_version',
	{
		id: text('id').primaryKey(),
		version: text('version').notNull().unique(),
		bodyHash: text('body_hash').notNull(),
		configuration: jsonb('configuration')
			.$type<Record<string, number | string | boolean>>()
			.notNull(),
		effectiveFrom: eventTimestamp('effective_from').notNull(),
		effectiveTo: eventTimestamp('effective_to'),
		legalReviewStatus: text('legal_review_status').notNull(),
		createdAt: eventTimestamp('created_at').notNull()
	},
	(table) => [
		uniqueIndex('review_policy_version_current_uq')
			.on(table.legalReviewStatus)
			.where(sql`${table.effectiveTo} is null and ${table.legalReviewStatus} = 'approved'`),
		check(
			'review_policy_version_period_ck',
			sql`${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom}`
		)
	]
);

export const reviewDeclarationPolicy = pgTable(
	'review_declaration_policy',
	{
		id: text('id').primaryKey(),
		policyVersionId: text('policy_version_id')
			.notNull()
			.references(() => reviewPolicyVersion.id, { onDelete: 'restrict' }),
		locale: text('locale').notNull(),
		content: jsonb('content').$type<Record<string, string>>().notNull(),
		contentHash: text('content_hash').notNull(),
		createdAt: eventTimestamp('created_at').notNull()
	},
	(table) => [
		unique('review_declaration_policy_version_locale_uq').on(table.policyVersionId, table.locale)
	]
);

export const placeReview = pgTable(
	'place_review',
	{
		id: text('id').primaryKey(),
		authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
		placeId: text('place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'restrict' }),
		currentPublicationId: text('current_publication_id'),
		collisionRestrictedAt: eventTimestamp('collision_restricted_at'),
		createdAt: eventTimestamp('created_at').notNull(),
		updatedAt: eventTimestamp('updated_at').notNull()
	},
	(table) => [
		unique('place_review_author_place_uq').on(table.authorId, table.placeId),
		index('place_review_author_management_idx').on(table.authorId, table.updatedAt)
	]
);

export const reviewPublication = pgTable(
	'review_publication',
	{
		id: text('id').primaryKey(),
		reviewId: text('review_id')
			.notNull()
			.references(() => placeReview.id, { onDelete: 'cascade' }),
		generation: integer('generation').notNull(),
		serviceDate: date('service_date', { mode: 'string' }).notNull(),
		lifecycle: reviewPublicationLifecycleEnum('lifecycle').notNull(),
		publishedAt: eventTimestamp('published_at').notNull(),
		expiresAt: eventTimestamp('expires_at').notNull(),
		currentVersionId: text('current_version_id'),
		policyVersionId: text('policy_version_id')
			.notNull()
			.references(() => reviewPolicyVersion.id, { onDelete: 'restrict' }),
		editedAt: eventTimestamp('edited_at'),
		withdrawnAt: eventTimestamp('withdrawn_at'),
		expiredAt: eventTimestamp('expired_at'),
		removedAt: eventTimestamp('removed_at'),
		supersededAt: eventTimestamp('superseded_at'),
		interimRestrictedAt: eventTimestamp('interim_restricted_at'),
		visibilityReason: text('visibility_reason'),
		createdAt: eventTimestamp('created_at').notNull()
	},
	(table) => [
		unique('review_publication_generation_uq').on(table.reviewId, table.generation),
		uniqueIndex('review_publication_one_effective_uq')
			.on(table.reviewId)
			.where(sql`${table.lifecycle} = 'published'`),
		index('review_publication_expiry_idx').on(table.lifecycle, table.expiresAt),
		index('review_publication_public_idx').on(
			table.lifecycle,
			table.expiresAt,
			table.publishedAt,
			table.id
		),
		check('review_publication_generation_ck', sql`${table.generation} > 0`),
		check('review_publication_expiry_ck', sql`${table.expiresAt} > ${table.publishedAt}`)
	]
);

export const reviewDeclarationAcceptance = pgTable(
	'review_declaration_acceptance',
	{
		id: text('id').primaryKey(),
		declarationPolicyId: text('declaration_policy_id')
			.notNull()
			.references(() => reviewDeclarationPolicy.id, { onDelete: 'restrict' }),
		authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
		serviceDate: date('service_date', { mode: 'string' }).notNull(),
		personallyUsedService: boolean('personally_used_service').notNull(),
		contentConcernsExperience: boolean('content_concerns_experience').notNull(),
		noIncentive: boolean('no_incentive').notNull(),
		locale: text('locale').notNull(),
		acceptedAt: eventTimestamp('accepted_at').notNull()
	},
	(table) => [
		check(
			'review_declaration_acceptance_all_ck',
			sql`${table.personallyUsedService} and ${table.contentConcernsExperience} and ${table.noIncentive}`
		)
	]
);

export const reviewVersion = pgTable(
	'review_version',
	{
		id: text('id').primaryKey(),
		publicationId: text('publication_id')
			.notNull()
			.references(() => reviewPublication.id, { onDelete: 'cascade' }),
		version: integer('version').notNull(),
		body: text('body').notNull(),
		pseudonymSnapshot: text('pseudonym_snapshot').notNull(),
		declarationAcceptanceId: text('declaration_acceptance_id')
			.notNull()
			.references(() => reviewDeclarationAcceptance.id, { onDelete: 'restrict' }),
		changeKind: reviewChangeKindEnum('change_kind').notNull(),
		createdAt: eventTimestamp('created_at').notNull()
	},
	(table) => [
		unique('review_version_number_uq').on(table.publicationId, table.version),
		unique('review_version_acceptance_uq').on(table.declarationAcceptanceId),
		index('review_version_history_idx').on(table.publicationId, table.version),
		check('review_version_number_ck', sql`${table.version} > 0`),
		check('review_version_body_ck', sql`char_length(${table.body}) between 1 and 2000`)
	]
);

export const reviewMutationReceipt = pgTable(
	'review_mutation_receipt',
	{
		id: text('id').primaryKey(),
		authorId: text('author_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		idempotencyKey: text('idempotency_key').notNull(),
		operation: text('operation').notNull(),
		reviewId: text('review_id')
			.notNull()
			.references(() => placeReview.id, { onDelete: 'cascade' }),
		publicationId: text('publication_id').references(() => reviewPublication.id, {
			onDelete: 'cascade'
		}),
		versionId: text('version_id').references(() => reviewVersion.id, { onDelete: 'cascade' }),
		createdAt: eventTimestamp('created_at').notNull()
	},
	(table) => [
		unique('review_mutation_receipt_author_key_uq').on(table.authorId, table.idempotencyKey),
		index('review_mutation_receipt_review_idx').on(table.reviewId, table.createdAt)
	]
);

export const reviewNotice = pgTable(
	'review_notice',
	{
		id: text('id').primaryKey(),
		publicationId: text('publication_id')
			.notNull()
			.references(() => reviewPublication.id, { onDelete: 'restrict' }),
		versionId: text('version_id')
			.notNull()
			.references(() => reviewVersion.id, { onDelete: 'restrict' }),
		exactPublicUrl: text('exact_public_url').notNull(),
		kind: reviewNoticeKindEnum('kind').notNull(),
		allegedGround: text('alleged_ground').notNull(),
		explanation: text('explanation').notNull(),
		notifierName: text('notifier_name').notNull(),
		notifierEmail: text('notifier_email').notNull(),
		notifierEmailHash: text('notifier_email_hash').notNull(),
		ownerAssertion: ownerAssertionStateEnum('owner_assertion').notNull().default('none'),
		goodFaithAccepted: boolean('good_faith_accepted').notNull(),
		status: reviewNoticeStatusEnum('status').notNull().default('received'),
		priority: integer('priority').notNull().default(0),
		idempotencyKey: text('idempotency_key').notNull(),
		deduplicationKey: text('deduplication_key').notNull(),
		acknowledgedAt: eventTimestamp('acknowledged_at'),
		submissionDeadline: eventTimestamp('submission_deadline'),
		assignedModeratorId: text('assigned_moderator_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		decisionDueAt: eventTimestamp('decision_due_at'),
		decidedAt: eventTimestamp('decided_at'),
		closedAt: eventTimestamp('closed_at'),
		createdAt: eventTimestamp('created_at').notNull(),
		updatedAt: eventTimestamp('updated_at').notNull()
	},
	(table) => [
		unique('review_notice_idempotency_uq').on(table.idempotencyKey),
		index('review_notice_duplicate_idx').on(table.deduplicationKey, table.createdAt),
		index('review_notice_queue_idx').on(table.status, table.priority, table.createdAt),
		index('review_notice_version_idx').on(table.versionId, table.createdAt),
		check('review_notice_good_faith_ck', sql`${table.goodFaithAccepted}`),
		check(
			'review_notice_explanation_ck',
			sql`char_length(${table.explanation}) between 20 and 5000`
		)
	]
);

export const reviewCaseAccessToken = pgTable(
	'review_case_access_token',
	{
		id: text('id').primaryKey(),
		noticeId: text('notice_id')
			.notNull()
			.references(() => reviewNotice.id, { onDelete: 'cascade' }),
		partyRole: reviewCasePartyRoleEnum('party_role').notNull(),
		tokenHash: text('token_hash').notNull().unique(),
		expiresAt: eventTimestamp('expires_at').notNull(),
		consumedAt: eventTimestamp('consumed_at'),
		createdAt: eventTimestamp('created_at').notNull()
	},
	(table) => [index('review_case_access_token_lookup_idx').on(table.tokenHash, table.expiresAt)]
);

export const reviewCasePartySubmission = pgTable(
	'review_case_party_submission',
	{
		id: text('id').primaryKey(),
		noticeId: text('notice_id')
			.notNull()
			.references(() => reviewNotice.id, { onDelete: 'cascade' }),
		partyRole: reviewCasePartyRoleEnum('party_role').notNull(),
		submitterUserId: text('submitter_user_id').references(() => user.id, { onDelete: 'set null' }),
		statement: text('statement').notNull(),
		idempotencyKey: text('idempotency_key').notNull().unique(),
		submissionWindowEndsAt: eventTimestamp('submission_window_ends_at').notNull(),
		createdAt: eventTimestamp('created_at').notNull()
	},
	(table) => [
		index('review_case_party_submission_access_idx').on(
			table.noticeId,
			table.partyRole,
			table.createdAt
		),
		check(
			'review_case_party_submission_text_ck',
			sql`char_length(${table.statement}) between 1 and 5000`
		)
	]
);

export const reviewEvidenceObject = pgTable(
	'review_evidence_object',
	{
		id: text('id').primaryKey(),
		noticeId: text('notice_id')
			.notNull()
			.references(() => reviewNotice.id, { onDelete: 'cascade' }),
		uploaderRole: reviewCasePartyRoleEnum('uploader_role').notNull(),
		blobHandle: text('blob_handle').notNull().unique(),
		originalFilename: text('original_filename'),
		mediaType: text('media_type').notNull(),
		sizeBytes: integer('size_bytes').notNull(),
		checksum: text('checksum').notNull(),
		scanState: reviewEvidenceScanStateEnum('scan_state').notNull(),
		purpose: text('purpose').notNull(),
		accessClassification: text('access_classification').notNull(),
		expiresAt: eventTimestamp('expires_at'),
		deletedAt: eventTimestamp('deleted_at'),
		createdAt: eventTimestamp('created_at').notNull()
	},
	(table) => [
		index('review_evidence_deletion_idx').on(table.deletedAt, table.expiresAt),
		index('review_evidence_case_idx').on(table.noticeId, table.uploaderRole),
		check('review_evidence_size_ck', sql`${table.sizeBytes} > 0`)
	]
);

export const reviewEvidenceAccess = pgTable(
	'review_evidence_access',
	{
		id: text('id').primaryKey(),
		evidenceId: text('evidence_id')
			.notNull()
			.references(() => reviewEvidenceObject.id, { onDelete: 'restrict' }),
		actorType: reviewModerationActorTypeEnum('actor_type').notNull(),
		actorReference: text('actor_reference').notNull(),
		purpose: text('purpose').notNull(),
		accessedAt: eventTimestamp('accessed_at').notNull()
	},
	(table) => [index('review_evidence_access_object_idx').on(table.evidenceId, table.accessedAt)]
);

export const reviewModerationDecision = pgTable(
	'review_moderation_decision',
	{
		id: text('id').primaryKey(),
		noticeId: text('notice_id')
			.notNull()
			.references(() => reviewNotice.id, { onDelete: 'restrict' }),
		decisionVersion: integer('decision_version').notNull(),
		outcome: reviewDecisionOutcomeEnum('outcome').notNull(),
		scope: text('scope').notNull(),
		duration: text('duration'),
		ground: text('ground').notNull(),
		policyVersionId: text('policy_version_id')
			.notNull()
			.references(() => reviewPolicyVersion.id, { onDelete: 'restrict' }),
		reasonedExplanation: text('reasoned_explanation').notNull(),
		factsReliedOn: text('facts_relied_on').notNull(),
		automationDisclosure: text('automation_disclosure').notNull(),
		decidedByUserId: text('decided_by_user_id').references(() => user.id, { onDelete: 'set null' }),
		reviewedByUserId: text('reviewed_by_user_id').references(() => user.id, {
			onDelete: 'restrict'
		}),
		supersedesDecisionId: text('supersedes_decision_id'),
		decidedAt: eventTimestamp('decided_at').notNull(),
		redressSubmissionDeadline: eventTimestamp('redress_submission_deadline').notNull(),
		notifiedAt: eventTimestamp('notified_at')
	},
	(table) => [
		unique('review_moderation_decision_version_uq').on(table.noticeId, table.decisionVersion),
		index('review_moderation_decision_notice_idx').on(table.noticeId, table.decidedAt),
		check(
			'review_moderation_decision_reason_ck',
			sql`char_length(${table.reasonedExplanation}) >= 20`
		)
	]
);

export const reviewRedressRequest = pgTable(
	'review_redress_request',
	{
		id: text('id').primaryKey(),
		noticeId: text('notice_id')
			.notNull()
			.references(() => reviewNotice.id, { onDelete: 'restrict' }),
		decisionId: text('decision_id')
			.notNull()
			.references(() => reviewModerationDecision.id, { onDelete: 'restrict' }),
		partyRole: reviewCasePartyRoleEnum('party_role').notNull(),
		statement: text('statement').notNull(),
		status: reviewRedressStatusEnum('status').notNull().default('submitted'),
		idempotencyKey: text('idempotency_key').notNull().unique(),
		duplicateOfId: text('duplicate_of_id'),
		createdAt: eventTimestamp('created_at').notNull(),
		decisionDueAt: eventTimestamp('decision_due_at').notNull(),
		decidedAt: eventTimestamp('decided_at')
	},
	(table) => [
		uniqueIndex('review_redress_decision_party_uq')
			.on(table.decisionId, table.partyRole)
			.where(sql`${table.duplicateOfId} is null`),
		index('review_redress_queue_idx').on(table.status, table.decisionDueAt)
	]
);

export const transactionalOutbox = pgTable(
	'transactional_outbox',
	{
		id: text('id').primaryKey(),
		purpose: text('purpose').notNull(),
		recipientReference: text('recipient_reference').notNull(),
		payload: jsonb('payload').$type<Record<string, string>>().notNull(),
		idempotencyKey: text('idempotency_key').notNull().unique(),
		availableAt: eventTimestamp('available_at').notNull(),
		attemptCount: integer('attempt_count').notNull().default(0),
		deliveredAt: eventTimestamp('delivered_at'),
		lastErrorCode: text('last_error_code'),
		createdAt: eventTimestamp('created_at').notNull()
	},
	(table) => [index('transactional_outbox_pending_idx').on(table.deliveredAt, table.availableAt)]
);

export const reviewNotification = pgTable(
	'review_notification',
	{
		id: text('id').primaryKey(),
		noticeId: text('notice_id').references(() => reviewNotice.id, { onDelete: 'restrict' }),
		reviewId: text('review_id').references(() => placeReview.id, { onDelete: 'restrict' }),
		recipientRole: text('recipient_role').notNull(),
		purpose: text('purpose').notNull(),
		deliveryKey: text('delivery_key').notNull().default(''),
		templateVersion: text('template_version').notNull(),
		outboxJobId: text('outbox_job_id')
			.notNull()
			.references(() => transactionalOutbox.id, { onDelete: 'restrict' }),
		state: reviewNotificationStateEnum('state').notNull().default('pending'),
		createdAt: eventTimestamp('created_at').notNull(),
		deliveredAt: eventTimestamp('delivered_at')
	},
	(table) => [
		unique('review_notification_delivery_uq').on(
			table.noticeId,
			table.recipientRole,
			table.purpose,
			table.deliveryKey
		)
	]
);

export const reviewModerationEvent = pgTable(
	'review_moderation_event',
	{
		id: text('id').primaryKey(),
		noticeId: text('notice_id').references(() => reviewNotice.id, { onDelete: 'restrict' }),
		reviewId: text('review_id').references(() => placeReview.id, { onDelete: 'restrict' }),
		publicationId: text('publication_id').references(() => reviewPublication.id, {
			onDelete: 'restrict'
		}),
		versionId: text('version_id').references(() => reviewVersion.id, { onDelete: 'restrict' }),
		actorType: reviewModerationActorTypeEnum('actor_type').notNull(),
		actorReference: text('actor_reference'),
		action: text('action').notNull(),
		reasonCode: text('reason_code').notNull(),
		before: jsonb('before').$type<Record<string, unknown> | null>(),
		after: jsonb('after').$type<Record<string, unknown> | null>(),
		sourceDecisionId: text('source_decision_id'),
		createdAt: eventTimestamp('created_at').notNull()
	},
	(table) => [
		index('review_moderation_event_notice_idx').on(table.noticeId, table.createdAt),
		index('review_moderation_event_review_idx').on(table.reviewId, table.createdAt),
		check(
			'review_moderation_event_actor_ck',
			sql`(${table.actorType} = 'system' and ${table.actorReference} is null) or (${table.actorType} <> 'system' and ${table.actorReference} is not null)`
		)
	]
);

export const reviewCatalogueConflict = pgTable(
	'review_catalogue_conflict',
	{
		id: text('id').primaryKey(),
		redirectId: text('redirect_id')
			.notNull()
			.references(() => cataloguePlaceRedirect.id, { onDelete: 'restrict' }),
		authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
		sourceReviewId: text('source_review_id')
			.notNull()
			.references(() => placeReview.id, { onDelete: 'cascade' }),
		canonicalReviewId: text('canonical_review_id')
			.notNull()
			.references(() => placeReview.id, { onDelete: 'cascade' }),
		status: reviewCatalogueConflictStatusEnum('status').notNull().default('open'),
		resolution: text('resolution'),
		createdAt: eventTimestamp('created_at').notNull(),
		resolvedAt: eventTimestamp('resolved_at')
	},
	(table) => [
		unique('review_catalogue_conflict_pair_uq').on(table.redirectId, table.authorId),
		index('review_catalogue_conflict_status_idx').on(table.status, table.createdAt),
		check(
			'review_catalogue_conflict_distinct_ck',
			sql`${table.sourceReviewId} <> ${table.canonicalReviewId}`
		)
	]
);

export const reviewRetentionHold = pgTable(
	'review_retention_hold',
	{
		id: text('id').primaryKey(),
		reviewId: text('review_id')
			.notNull()
			.references(() => placeReview.id, { onDelete: 'cascade' }),
		noticeId: text('notice_id').references(() => reviewNotice.id, { onDelete: 'set null' }),
		reasonCode: text('reason_code').notNull(),
		placedAt: eventTimestamp('placed_at').notNull(),
		expiresAt: eventTimestamp('expires_at').notNull(),
		releasedAt: eventTimestamp('released_at')
	},
	(table) => [
		uniqueIndex('review_retention_hold_active_uq')
			.on(table.reviewId, table.noticeId)
			.where(sql`${table.releasedAt} is null`),
		index('review_retention_hold_expiry_idx').on(table.releasedAt, table.expiresAt)
	]
);
