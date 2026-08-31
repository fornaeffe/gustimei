import { sql } from 'drizzle-orm';
import {
	check,
	foreignKey,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { user } from './auth.schema';
import { place } from './catalogue.schema';
import {
	applicationEnvironmentEnum,
	captureProvenanceEnum,
	comparisonOutcomeEnum,
	comparisonReasonEnum,
	contributionPurposeEnum,
	evidenceExclusionReasonEnum,
	productEventNameEnum,
	rankingCategoryEnum,
	rankingSessionLifecycleEnum,
	rankingSessionPurposeEnum,
	revisionEvidenceDispositionEnum,
	unresolvedRelationReasonEnum
} from './enums';

export const participationCohort = pgTable(
	'participation_cohort',
	{
		id: text('id').primaryKey(),
		slug: text('slug').notNull().unique(),
		provenance: captureProvenanceEnum('provenance').notNull(),
		environment: applicationEnvironmentEnum('environment').notNull(),
		description: text('description').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [
		check(
			'participation_cohort_synthetic_environment_ck',
			sql`${table.provenance} <> 'synthetic' or ${table.environment} in ('development', 'test')`
		)
	]
);

export const participationAssignment = pgTable(
	'participation_assignment',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		cohortId: text('cohort_id')
			.notNull()
			.references(() => participationCohort.id, { onDelete: 'restrict' }),
		effectiveFrom: timestamp('effective_from', { withTimezone: true, mode: 'date' }).notNull(),
		effectiveTo: timestamp('effective_to', { withTimezone: true, mode: 'date' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('participation_assignment_one_current_uq')
			.on(table.userId)
			.where(sql`${table.effectiveTo} is null`),
		index('participation_assignment_effective_idx').on(
			table.userId,
			table.effectiveFrom,
			table.effectiveTo
		),
		check(
			'participation_assignment_period_ck',
			sql`${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom}`
		)
	]
);

export const productAnalyticsEvent = pgTable(
	'product_analytics_event',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		cohortAssignmentId: text('cohort_assignment_id').references(() => participationAssignment.id, {
			onDelete: 'set null'
		}),
		name: productEventNameEnum('name').notNull(),
		category: rankingCategoryEnum('category').notNull(),
		metadata: jsonb('metadata')
			.$type<Record<string, number | boolean | string>>()
			.notNull()
			.default({}),
		occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull()
	},
	(table) => [index('product_analytics_event_name_time_idx').on(table.name, table.occurredAt)]
);

export const recommendationAttribution = pgTable(
	'recommendation_attribution',
	{
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		category: rankingCategoryEnum('category').notNull(),
		placeId: text('place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'restrict' }),
		cohortAssignmentId: text('cohort_assignment_id')
			.notNull()
			.references(() => participationAssignment.id, { onDelete: 'restrict' }),
		artifactId: text('artifact_id').notNull(),
		rankingRevisionId: text('ranking_revision_id'),
		firstExposedAt: timestamp('first_exposed_at', { withTimezone: true, mode: 'date' }).notNull(),
		mostRecentExposedAt: timestamp('most_recent_exposed_at', {
			withTimezone: true,
			mode: 'date'
		}).notNull(),
		convertedAt: timestamp('converted_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.category, table.placeId] }),
		index('recommendation_attribution_conversion_idx').on(
			table.category,
			table.convertedAt,
			table.mostRecentExposedAt
		),
		check(
			'recommendation_attribution_period_ck',
			sql`${table.mostRecentExposedAt} >= ${table.firstExposedAt} and (${table.convertedAt} is null or ${table.convertedAt} >= ${table.mostRecentExposedAt})`
		)
	]
);

export const rankingList = pgTable(
	'ranking_list',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		category: rankingCategoryEnum('category').notNull(),
		currentRevisionId: text('current_revision_id'),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('ranking_list_owner_category_uq').on(table.ownerId, table.category),
		unique('ranking_list_id_owner_uq').on(table.id, table.ownerId)
	]
);

export const rankingListPlace = pgTable(
	'ranking_list_place',
	{
		listId: text('list_id')
			.notNull()
			.references(() => rankingList.id, { onDelete: 'cascade' }),
		ownerId: text('owner_id').notNull(),
		placeId: text('place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'restrict' }),
		addedAt: timestamp('added_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [
		primaryKey({ columns: [table.listId, table.placeId] }),
		unique('ranking_list_place_owner_place_uq').on(table.ownerId, table.placeId),
		foreignKey({
			name: 'ranking_list_place_list_owner_fk',
			columns: [table.listId, table.ownerId],
			foreignColumns: [rankingList.id, rankingList.ownerId]
		}).onDelete('cascade'),
		index('ranking_list_place_owner_idx').on(table.ownerId)
	]
);

export const personalPlaceComment = pgTable(
	'personal_place_comment',
	{
		ownerId: text('owner_id').notNull(),
		placeId: text('place_id').notNull(),
		listId: text('list_id').notNull(),
		body: text('body').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [
		primaryKey({ columns: [table.ownerId, table.placeId] }),
		foreignKey({
			name: 'personal_comment_visited_place_fk',
			columns: [table.listId, table.placeId],
			foreignColumns: [rankingListPlace.listId, rankingListPlace.placeId]
		}).onDelete('cascade'),
		foreignKey({
			name: 'personal_comment_list_owner_fk',
			columns: [table.listId, table.ownerId],
			foreignColumns: [rankingList.id, rankingList.ownerId]
		}).onDelete('cascade'),
		check('personal_comment_length_ck', sql`char_length(${table.body}) <= 2000`)
	]
);

export const rankingRevision = pgTable(
	'ranking_revision',
	{
		id: text('id').primaryKey(),
		listId: text('list_id')
			.notNull()
			.references(() => rankingList.id, { onDelete: 'cascade' }),
		revisionNumber: integer('revision_number').notNull(),
		category: rankingCategoryEnum('category').notNull(),
		rankingEngineVersion: text('ranking_engine_version').notNull(),
		provenance: captureProvenanceEnum('provenance').notNull(),
		cohortAssignmentId: text('cohort_assignment_id').references(() => participationAssignment.id, {
			onDelete: 'restrict'
		}),
		publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }).notNull()
	},
	(table) => [
		uniqueIndex('ranking_revision_list_number_uq').on(table.listId, table.revisionNumber),
		unique('ranking_revision_id_list_uq').on(table.id, table.listId),
		check('ranking_revision_number_ck', sql`${table.revisionNumber} > 0`)
	]
);

export const rankingRevisionPlace = pgTable(
	'ranking_revision_place',
	{
		revisionId: text('revision_id')
			.notNull()
			.references(() => rankingRevision.id, { onDelete: 'cascade' }),
		placeId: text('place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'restrict' }),
		membershipOrder: integer('membership_order').notNull(),
		tierIndex: integer('tier_index').notNull(),
		tierPosition: integer('tier_position').notNull()
	},
	(table) => [
		primaryKey({ columns: [table.revisionId, table.placeId] }),
		uniqueIndex('ranking_revision_place_membership_order_uq').on(
			table.revisionId,
			table.membershipOrder
		),
		uniqueIndex('ranking_revision_place_tier_position_uq').on(
			table.revisionId,
			table.tierIndex,
			table.tierPosition
		),
		check('ranking_revision_place_order_ck', sql`${table.membershipOrder} >= 0`),
		check(
			'ranking_revision_place_tier_ck',
			sql`${table.tierIndex} >= 0 and ${table.tierPosition} >= 0`
		)
	]
);

export const rankingUnresolvedRelation = pgTable(
	'ranking_unresolved_relation',
	{
		revisionId: text('revision_id')
			.notNull()
			.references(() => rankingRevision.id, { onDelete: 'cascade' }),
		firstPlaceId: text('first_place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'restrict' }),
		secondPlaceId: text('second_place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'restrict' }),
		reason: unresolvedRelationReasonEnum('reason').notNull()
	},
	(table) => [
		primaryKey({ columns: [table.revisionId, table.firstPlaceId, table.secondPlaceId] }),
		check('ranking_unresolved_pair_ck', sql`${table.firstPlaceId} < ${table.secondPlaceId}`)
	]
);

export const rankingSession = pgTable(
	'ranking_session',
	{
		id: text('id').primaryKey(),
		listId: text('list_id')
			.notNull()
			.references(() => rankingList.id, { onDelete: 'cascade' }),
		baseRevisionId: text('base_revision_id').references(() => rankingRevision.id, {
			onDelete: 'restrict'
		}),
		purpose: rankingSessionPurposeEnum('purpose').notNull(),
		lifecycle: rankingSessionLifecycleEnum('lifecycle').notNull(),
		serializedState: text('serialized_state').notNull(),
		cohortAssignmentId: text('cohort_assignment_id').references(() => participationAssignment.id, {
			onDelete: 'restrict'
		}),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
		completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [
		uniqueIndex('ranking_session_one_open_uq')
			.on(table.listId, sql`coalesce(${table.baseRevisionId}, '')`)
			.where(sql`${table.lifecycle} = 'open'`),
		index('ranking_session_list_lifecycle_idx').on(table.listId, table.lifecycle)
	]
);

export const comparisonEvidence = pgTable(
	'comparison_evidence',
	{
		id: text('id').primaryKey(),
		sessionId: text('session_id')
			.notNull()
			.references(() => rankingSession.id, { onDelete: 'cascade' }),
		sequence: integer('sequence').notNull(),
		logicalFirstPlaceId: text('logical_first_place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'restrict' }),
		logicalSecondPlaceId: text('logical_second_place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'restrict' }),
		leftPlaceId: text('left_place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'restrict' }),
		rightPlaceId: text('right_place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'restrict' }),
		outcome: comparisonOutcomeEnum('outcome').notNull(),
		reason: comparisonReasonEnum('reason').notNull(),
		active: integer('active').notNull().default(1),
		supersedesEvidenceId: text('supersedes_evidence_id'),
		capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		uniqueIndex('comparison_evidence_session_sequence_uq').on(table.sessionId, table.sequence),
		foreignKey({
			name: 'comparison_evidence_supersedes_fk',
			columns: [table.supersedesEvidenceId],
			foreignColumns: [table.id]
		}).onDelete('restrict'),
		check('comparison_evidence_sequence_ck', sql`${table.sequence} > 0`),
		check('comparison_evidence_active_ck', sql`${table.active} in (0, 1)`),
		check(
			'comparison_evidence_logical_pair_ck',
			sql`${table.logicalFirstPlaceId} < ${table.logicalSecondPlaceId}`
		),
		check(
			'comparison_evidence_presentation_pair_ck',
			sql`(${table.leftPlaceId} = ${table.logicalFirstPlaceId} and ${table.rightPlaceId} = ${table.logicalSecondPlaceId}) or (${table.leftPlaceId} = ${table.logicalSecondPlaceId} and ${table.rightPlaceId} = ${table.logicalFirstPlaceId})`
		),
		check(
			'comparison_evidence_supersedes_self_ck',
			sql`${table.supersedesEvidenceId} is null or ${table.supersedesEvidenceId} <> ${table.id}`
		)
	]
);

export const rankingRevisionEvidence = pgTable(
	'ranking_revision_evidence',
	{
		revisionId: text('revision_id')
			.notNull()
			.references(() => rankingRevision.id, { onDelete: 'cascade' }),
		comparisonId: text('comparison_id')
			.notNull()
			.references(() => comparisonEvidence.id, { onDelete: 'restrict' }),
		revisionSequence: integer('revision_sequence').notNull(),
		disposition: revisionEvidenceDispositionEnum('disposition').notNull(),
		exclusionReason: evidenceExclusionReasonEnum('exclusion_reason'),
		conflictingEvidenceIds: jsonb('conflicting_evidence_ids')
			.$type<string[]>()
			.notNull()
			.default([])
	},
	(table) => [
		primaryKey({ columns: [table.revisionId, table.comparisonId] }),
		uniqueIndex('ranking_revision_evidence_sequence_uq').on(
			table.revisionId,
			table.revisionSequence
		),
		check('ranking_revision_evidence_sequence_ck', sql`${table.revisionSequence} > 0`),
		check(
			'ranking_revision_evidence_reason_ck',
			sql`(${table.disposition} = 'active' and ${table.exclusionReason} is null) or (${table.disposition} = 'excluded' and ${table.exclusionReason} is not null)`
		)
	]
);

export const processingRestriction = pgTable(
	'processing_restriction',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		category: rankingCategoryEnum('category').notNull(),
		purpose: contributionPurposeEnum('purpose').notNull(),
		reason: text('reason').notNull(),
		restrictedAt: timestamp('restricted_at', { withTimezone: true, mode: 'date' }).notNull(),
		liftedAt: timestamp('lifted_at', { withTimezone: true, mode: 'date' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('processing_restriction_one_active_uq')
			.on(table.userId, table.category, table.purpose)
			.where(sql`${table.liftedAt} is null`),
		index('processing_restriction_lookup_idx').on(
			table.userId,
			table.category,
			table.purpose,
			table.liftedAt
		),
		check(
			'processing_restriction_period_ck',
			sql`${table.liftedAt} is null or ${table.liftedAt} > ${table.restrictedAt}`
		)
	]
);
