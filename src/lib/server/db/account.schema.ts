import { relations, sql } from 'drizzle-orm';
import {
	check,
	index,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

export const documentTypeEnum = pgEnum('document_type', [
	'terms',
	'privacy-notice',
	'contribution-disclosure',
	'age-declaration',
	'review-rules',
	'moderation-explanation'
]);

export const privacyRequestTypeEnum = pgEnum('privacy_request_type', [
	'access-export',
	'processing-restriction',
	'review-withdrawal-redaction',
	'evidence-deletion',
	'ranking-category-deletion',
	'account-erasure'
]);

export const privacyRequestStatusEnum = pgEnum('privacy_request_status', [
	'received',
	'in-progress',
	'completed',
	'rejected'
]);

export const documentVersion = pgTable(
	'document_version',
	{
		id: text('id').primaryKey(),
		type: documentTypeEnum('type').notNull(),
		version: text('version').notNull(),
		locale: text('locale').notNull(),
		contentHash: text('content_hash').notNull(),
		effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
		retiredAt: timestamp('retired_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull()
	},
	(table) => [
		uniqueIndex('document_version_type_version_locale_uq').on(
			table.type,
			table.version,
			table.locale
		),
		index('document_version_effective_idx').on(table.type, table.locale, table.effectiveFrom),
		check('document_version_locale_ck', sql`${table.locale} in ('en', 'it')`)
	]
);

export const registrationAttestation = pgTable(
	'registration_attestation',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.unique()
			.references(() => user.id, { onDelete: 'cascade' }),
		locale: text('locale').notNull(),
		termsVersion: text('terms_version').notNull(),
		ageDeclarationVersion: text('age_declaration_version').notNull(),
		privacyNoticeVersion: text('privacy_notice_version').notNull(),
		contributionDisclosureVersion: text('contribution_disclosure_version').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull()
	},
	(table) => [check('registration_attestation_locale_ck', sql`${table.locale} in ('en', 'it')`)]
);

export const accountPreference = pgTable(
	'account_preference',
	{
		userId: text('user_id')
			.primaryKey()
			.references(() => user.id, { onDelete: 'cascade' }),
		locale: text('locale').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
	},
	(table) => [check('account_preference_locale_ck', sql`${table.locale} in ('en', 'it')`)]
);

export const pseudonymReservation = pgTable(
	'pseudonym_reservation',
	{
		normalizedPseudonym: text('normalized_pseudonym').notNull(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		reservedUntil: timestamp('reserved_until', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull()
	},
	(table) => [
		primaryKey({ columns: [table.normalizedPseudonym, table.ownerId] }),
		index('pseudonym_reservation_lookup_idx').on(table.normalizedPseudonym, table.reservedUntil)
	]
);

export const pseudonymChange = pgTable(
	'pseudonym_change',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		previousNormalizedPseudonym: text('previous_normalized_pseudonym'),
		newNormalizedPseudonym: text('new_normalized_pseudonym').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull()
	},
	(table) => [index('pseudonym_change_user_idx').on(table.userId, table.createdAt)]
);

export const privacyRequest = pgTable(
	'privacy_request',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		requesterReference: text('requester_reference').notNull(),
		type: privacyRequestTypeEnum('type').notNull(),
		status: privacyRequestStatusEnum('status').notNull().default('received'),
		scope: text('scope').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
		completedAt: timestamp('completed_at', { withTimezone: true }),
		operatorReference: text('operator_reference').notNull()
	},
	(table) => [index('privacy_request_user_idx').on(table.userId, table.createdAt)]
);

export const documentVersionRelations = relations(documentVersion, () => ({}));
export const registrationAttestationRelations = relations(registrationAttestation, ({ one }) => ({
	user: one(user, { fields: [registrationAttestation.userId], references: [user.id] })
}));
