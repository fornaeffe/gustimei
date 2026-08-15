import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type {
	CatalogueOverridePatch,
	EffectivePlaceValues
} from '$lib/domain/catalogue/governance';
import { user } from './auth.schema';
import { place } from './catalogue.schema';
import { rankingList } from './domain.schema';
import {
	applicationEnvironmentEnum,
	catalogueAuditActorRoleEnum,
	catalogueChangeActionEnum,
	catalogueIssueStatusEnum,
	catalogueIssueTypeEnum,
	catalogueOverrideReviewStatusEnum,
	catalogueRepairStatusEnum,
	catalogueRoleEnum,
	catalogueRoleGrantSourceEnum,
	rankingCategoryEnum
} from './enums';

export const catalogueRoleAssignment = pgTable(
	'catalogue_role_assignment',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: catalogueRoleEnum('role').notNull(),
		environment: applicationEnvironmentEnum('environment').notNull(),
		grantSource: catalogueRoleGrantSourceEnum('grant_source').notNull(),
		grantedByUserId: text('granted_by_user_id'),
		operatorReference: text('operator_reference'),
		grantReason: text('grant_reason').notNull(),
		grantedAt: timestamp('granted_at', { withTimezone: true, mode: 'date' }).notNull(),
		revokedByUserId: text('revoked_by_user_id'),
		revocationReason: text('revocation_reason'),
		revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [
		uniqueIndex('catalogue_role_assignment_active_uq')
			.on(table.userId, table.role, table.environment)
			.where(sql`${table.revokedAt} is null`),
		index('catalogue_role_assignment_lookup_idx').on(
			table.userId,
			table.environment,
			table.role,
			table.revokedAt
		),
		check(
			'catalogue_role_assignment_operator_ck',
			sql`(${table.grantSource} in ('bootstrap', 'break-glass') and ${table.operatorReference} is not null and ${table.grantedByUserId} is null)
				or (${table.grantSource} in ('admin-grant', 'rotation') and ${table.grantedByUserId} is not null)`
		),
		check(
			'catalogue_role_assignment_revocation_ck',
			sql`(${table.revokedAt} is null and ${table.revokedByUserId} is null and ${table.revocationReason} is null)
				or (${table.revokedAt} is not null and ${table.revocationReason} is not null)`
		)
	]
);

export const catalogueIssueReport = pgTable(
	'catalogue_issue_report',
	{
		id: text('id').primaryKey(),
		reporterUserId: text('reporter_user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		placeId: text('place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'restrict' }),
		type: catalogueIssueTypeEnum('type').notNull(),
		status: catalogueIssueStatusEnum('status').notNull().default('submitted'),
		details: text('details'),
		evidenceReference: text('evidence_reference'),
		assignedToUserId: text('assigned_to_user_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		resolutionReason: text('resolution_reason'),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
		resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [
		index('catalogue_issue_report_rate_limit_idx').on(table.reporterUserId, table.createdAt),
		index('catalogue_issue_report_queue_idx').on(table.status, table.createdAt),
		index('catalogue_issue_report_place_idx').on(table.placeId, table.status),
		check(
			'catalogue_issue_report_details_length_ck',
			sql`${table.details} is null or char_length(${table.details}) <= 1000`
		),
		check(
			'catalogue_issue_report_evidence_length_ck',
			sql`${table.evidenceReference} is null or char_length(${table.evidenceReference}) <= 500`
		),
		check(
			'catalogue_issue_report_resolution_ck',
			sql`(${table.status} in ('resolved', 'rejected') and ${table.resolutionReason} is not null and ${table.resolvedAt} is not null)
				or (${table.status} in ('submitted', 'triaged') and ${table.resolutionReason} is null and ${table.resolvedAt} is null)`
		)
	]
);

export const cataloguePlaceOverride = pgTable(
	'catalogue_place_override',
	{
		id: text('id').primaryKey(),
		placeId: text('place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'restrict' }),
		patch: jsonb('patch').$type<CatalogueOverridePatch>().notNull(),
		baseValues: jsonb('base_values').$type<Partial<EffectivePlaceValues>>().notNull(),
		reasonCategory: text('reason_category').notNull(),
		evidenceReference: text('evidence_reference').notNull(),
		actorUserId: text('actor_user_id').notNull(),
		linkedReportId: text('linked_report_id').references(() => catalogueIssueReport.id, {
			onDelete: 'set null'
		}),
		reviewStatus: catalogueOverrideReviewStatusEnum('review_status').notNull(),
		reviewAt: timestamp('review_at', { withTimezone: true, mode: 'date' }).notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
		retiredAt: timestamp('retired_at', { withTimezone: true, mode: 'date' }),
		retiredByUserId: text('retired_by_user_id'),
		retirementReason: text('retirement_reason')
	},
	(table) => [
		uniqueIndex('catalogue_place_override_active_uq')
			.on(table.placeId)
			.where(sql`${table.retiredAt} is null`),
		index('catalogue_place_override_review_idx').on(table.reviewStatus, table.reviewAt),
		check(
			'catalogue_place_override_reason_ck',
			sql`char_length(trim(${table.reasonCategory})) > 0`
		),
		check(
			'catalogue_place_override_evidence_ck',
			sql`char_length(trim(${table.evidenceReference})) > 0`
		),
		check(
			'catalogue_place_override_retired_ck',
			sql`(${table.retiredAt} is null and ${table.retiredByUserId} is null and ${table.retirementReason} is null)
				or (${table.retiredAt} is not null and ${table.retiredByUserId} is not null and ${table.retirementReason} is not null and ${table.reviewStatus} = 'retired')`
		)
	]
);

export const cataloguePlaceRedirect = pgTable(
	'catalogue_place_redirect',
	{
		id: text('id').primaryKey(),
		sourcePlaceId: text('source_place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'restrict' }),
		canonicalPlaceId: text('canonical_place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'restrict' }),
		actionId: text('action_id').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
		reversedAt: timestamp('reversed_at', { withTimezone: true, mode: 'date' }),
		reversalActionId: text('reversal_action_id')
	},
	(table) => [
		uniqueIndex('catalogue_place_redirect_active_source_uq')
			.on(table.sourcePlaceId)
			.where(sql`${table.reversedAt} is null`),
		index('catalogue_place_redirect_canonical_idx').on(table.canonicalPlaceId, table.reversedAt),
		check(
			'catalogue_place_redirect_distinct_ck',
			sql`${table.sourcePlaceId} <> ${table.canonicalPlaceId}`
		),
		check(
			'catalogue_place_redirect_reversal_ck',
			sql`(${table.reversedAt} is null and ${table.reversalActionId} is null)
				or (${table.reversedAt} is not null and ${table.reversalActionId} is not null)`
		)
	]
);

export const catalogueCategoryMigration = pgTable(
	'catalogue_category_migration',
	{
		id: text('id').primaryKey(),
		placeId: text('place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'restrict' }),
		fromCategory: rankingCategoryEnum('from_category').notNull(),
		toCategory: rankingCategoryEnum('to_category').notNull(),
		actionId: text('action_id').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
		reversedAt: timestamp('reversed_at', { withTimezone: true, mode: 'date' }),
		reversalActionId: text('reversal_action_id')
	},
	(table) => [
		uniqueIndex('catalogue_category_migration_active_uq')
			.on(table.placeId)
			.where(sql`${table.reversedAt} is null`),
		check(
			'catalogue_category_migration_distinct_ck',
			sql`${table.fromCategory} <> ${table.toCategory}`
		),
		check(
			'catalogue_category_migration_reversal_ck',
			sql`(${table.reversedAt} is null and ${table.reversalActionId} is null)
				or (${table.reversedAt} is not null and ${table.reversalActionId} is not null)`
		)
	]
);

export const cataloguePlaceTombstone = pgTable(
	'catalogue_place_tombstone',
	{
		id: text('id').primaryKey(),
		placeId: text('place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'restrict' }),
		actionId: text('action_id').notNull(),
		reason: text('reason').notNull(),
		evidenceReference: text('evidence_reference').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
		reversedAt: timestamp('reversed_at', { withTimezone: true, mode: 'date' }),
		reversalActionId: text('reversal_action_id')
	},
	(table) => [
		uniqueIndex('catalogue_place_tombstone_active_uq')
			.on(table.placeId)
			.where(sql`${table.reversedAt} is null`),
		check('catalogue_place_tombstone_reason_ck', sql`char_length(trim(${table.reason})) > 0`),
		check(
			'catalogue_place_tombstone_reversal_ck',
			sql`(${table.reversedAt} is null and ${table.reversalActionId} is null)
				or (${table.reversedAt} is not null and ${table.reversalActionId} is not null)`
		)
	]
);

export const catalogueListPlaceSupersession = pgTable(
	'catalogue_list_place_supersession',
	{
		id: text('id').primaryKey(),
		listId: text('list_id')
			.notNull()
			.references(() => rankingList.id, { onDelete: 'cascade' }),
		sourcePlaceId: text('source_place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'restrict' }),
		canonicalPlaceId: text('canonical_place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'restrict' }),
		redirectId: text('redirect_id')
			.notNull()
			.references(() => cataloguePlaceRedirect.id, { onDelete: 'restrict' }),
		canonicalMembershipCreated: timestamp('canonical_membership_created', {
			withTimezone: true,
			mode: 'date'
		}),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
		reversedAt: timestamp('reversed_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [
		uniqueIndex('catalogue_list_place_supersession_active_uq')
			.on(table.listId, table.sourcePlaceId)
			.where(sql`${table.reversedAt} is null`),
		index('catalogue_list_place_supersession_redirect_idx').on(table.redirectId),
		check(
			'catalogue_list_place_supersession_distinct_ck',
			sql`${table.sourcePlaceId} <> ${table.canonicalPlaceId}`
		)
	]
);

export const catalogueRankingRepair = pgTable(
	'catalogue_ranking_repair',
	{
		id: text('id').primaryKey(),
		listId: text('list_id')
			.notNull()
			.references(() => rankingList.id, { onDelete: 'cascade' }),
		sourcePlaceId: text('source_place_id').references(() => place.id, { onDelete: 'restrict' }),
		canonicalPlaceId: text('canonical_place_id').references(() => place.id, {
			onDelete: 'restrict'
		}),
		reason: text('reason').notNull(),
		actionId: text('action_id').notNull(),
		status: catalogueRepairStatusEnum('status').notNull().default('pending'),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
		completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [
		uniqueIndex('catalogue_ranking_repair_action_list_uq').on(table.actionId, table.listId),
		index('catalogue_ranking_repair_pending_idx').on(table.listId, table.status)
	]
);

export const catalogueArtifactInvalidation = pgTable(
	'catalogue_artifact_invalidation',
	{
		id: text('id').primaryKey(),
		category: rankingCategoryEnum('category').notNull(),
		actionId: text('action_id').notNull(),
		reason: text('reason').notNull(),
		requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'date' }).notNull(),
		processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [
		uniqueIndex('catalogue_artifact_invalidation_action_category_uq').on(
			table.actionId,
			table.category
		),
		index('catalogue_artifact_invalidation_pending_idx').on(table.category, table.processedAt)
	]
);

export const catalogueChange = pgTable(
	'catalogue_change',
	{
		id: text('id').primaryKey(),
		action: catalogueChangeActionEnum('action').notNull(),
		actorRole: catalogueAuditActorRoleEnum('actor_role').notNull(),
		actorUserId: text('actor_user_id'),
		operatorReference: text('operator_reference'),
		environment: applicationEnvironmentEnum('environment').notNull(),
		targetPlaceId: text('target_place_id'),
		canonicalPlaceId: text('canonical_place_id'),
		sourceIdentities: jsonb('source_identities').$type<unknown[]>().notNull().default([]),
		before: jsonb('before').$type<Record<string, unknown> | null>(),
		after: jsonb('after').$type<Record<string, unknown> | null>(),
		reasonCategory: text('reason_category').notNull(),
		evidenceReferences: jsonb('evidence_references').$type<string[]>().notNull().default([]),
		linkedReportId: text('linked_report_id'),
		upstreamChangesetId: text('upstream_changeset_id'),
		importId: text('import_id'),
		impact: jsonb('impact').$type<Record<string, number | boolean>>().notNull().default({}),
		reversalOfActionId: text('reversal_of_action_id'),
		supersedesActionId: text('supersedes_action_id'),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull()
	},
	(table) => [
		index('catalogue_change_target_idx').on(table.targetPlaceId, table.createdAt),
		index('catalogue_change_report_idx').on(table.linkedReportId, table.createdAt),
		index('catalogue_change_action_idx').on(table.action, table.createdAt),
		check(
			'catalogue_change_actor_ck',
			sql`(${table.actorRole} in ('user', 'catalogue_curator', 'admin') and ${table.actorUserId} is not null and ${table.operatorReference} is null)
				or (${table.actorRole} = 'operator' and ${table.actorUserId} is null and ${table.operatorReference} is not null)
				or (${table.actorRole} = 'system' and ${table.actorUserId} is null)`
		),
		check('catalogue_change_reason_ck', sql`char_length(trim(${table.reasonCategory})) > 0`)
	]
);
