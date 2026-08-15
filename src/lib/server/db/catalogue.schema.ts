import { sql } from 'drizzle-orm';
import {
	bigint,
	check,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import {
	catalogueImportStatusEnum,
	catalogueRecordStatusEnum,
	dataClassEnum,
	osmElementTypeEnum,
	rankingCategoryEnum
} from './enums';

export const catalogueImport = pgTable(
	'catalogue_import',
	{
		id: text('id').primaryKey(),
		provider: text('provider').notNull().default('openstreetmap'),
		category: rankingCategoryEnum('category').notNull(),
		dataClass: dataClassEnum('data_class').notNull().default('real'),
		sourceUri: text('source_uri').notNull(),
		sourceChecksum: text('source_checksum').notNull(),
		sourceTimestamp: timestamp('source_timestamp', { withTimezone: true, mode: 'date' }),
		normalizerVersion: text('normalizer_version').notNull(),
		localityIndexVersion: text('locality_index_version').notNull(),
		status: catalogueImportStatusEnum('status').notNull().default('staging'),
		statistics: jsonb('statistics').$type<Record<string, number>>().notNull().default({}),
		failureMessage: text('failure_message'),
		startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
		completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
		promotedAt: timestamp('promoted_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [
		uniqueIndex('catalogue_import_source_checksum_uq').on(
			table.provider,
			table.category,
			table.dataClass,
			table.sourceChecksum,
			table.normalizerVersion,
			table.localityIndexVersion
		),
		index('catalogue_import_status_idx').on(table.category, table.status)
	]
);

export const place = pgTable(
	'place',
	{
		id: text('id').primaryKey(),
		category: rankingCategoryEnum('category').notNull(),
		dataClass: dataClassEnum('data_class').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [index('place_category_data_class_idx').on(table.category, table.dataClass)]
);

export const catalogueSourceSnapshot = pgTable(
	'catalogue_source_snapshot',
	{
		id: text('id').primaryKey(),
		importId: text('import_id')
			.notNull()
			.references(() => catalogueImport.id, { onDelete: 'restrict' }),
		provider: text('provider').notNull().default('openstreetmap'),
		elementType: osmElementTypeEnum('element_type').notNull(),
		elementId: bigint('element_id', { mode: 'number' }).notNull(),
		sourceVersion: integer('source_version').notNull(),
		sourceTimestamp: timestamp('source_timestamp', { withTimezone: true, mode: 'date' }),
		contentHash: text('content_hash').notNull(),
		tags: jsonb('tags').$type<Record<string, string>>().notNull(),
		latitude: doublePrecision('latitude').notNull(),
		longitude: doublePrecision('longitude').notNull(),
		capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		uniqueIndex('catalogue_snapshot_source_version_uq').on(
			table.provider,
			table.elementType,
			table.elementId,
			table.sourceVersion,
			table.contentHash
		),
		index('catalogue_snapshot_import_idx').on(table.importId),
		check('catalogue_snapshot_latitude_ck', sql`${table.latitude} between -90 and 90`),
		check('catalogue_snapshot_longitude_ck', sql`${table.longitude} between -180 and 180`),
		check('catalogue_snapshot_version_ck', sql`${table.sourceVersion} > 0`)
	]
);

export const catalogueSourceMapping = pgTable(
	'catalogue_source_mapping',
	{
		provider: text('provider').notNull().default('openstreetmap'),
		elementType: osmElementTypeEnum('element_type').notNull(),
		elementId: bigint('element_id', { mode: 'number' }).notNull(),
		placeId: text('place_id')
			.notNull()
			.references(() => place.id, { onDelete: 'restrict' }),
		currentSnapshotId: text('current_snapshot_id')
			.notNull()
			.references(() => catalogueSourceSnapshot.id, { onDelete: 'restrict' }),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [
		primaryKey({ columns: [table.provider, table.elementType, table.elementId] }),
		uniqueIndex('catalogue_source_mapping_place_uq').on(table.placeId)
	]
);

export const localityBoundary = pgTable(
	'locality_boundary',
	{
		provider: text('provider').notNull().default('openstreetmap'),
		elementType: osmElementTypeEnum('element_type').notNull(),
		elementId: bigint('element_id', { mode: 'number' }).notNull(),
		adminLevel: integer('admin_level').notNull(),
		name: text('name').notNull(),
		normalizedName: text('normalized_name').notNull(),
		countryCode: text('country_code').notNull(),
		sourceSnapshotId: text('source_snapshot_id').references(() => catalogueSourceSnapshot.id, {
			onDelete: 'restrict'
		})
	},
	(table) => [
		primaryKey({ columns: [table.provider, table.elementType, table.elementId] }),
		index('locality_boundary_name_idx').on(table.adminLevel, table.normalizedName),
		check('locality_boundary_admin_level_ck', sql`${table.adminLevel} in (4, 6, 8)`)
	]
);

export const effectivePlace = pgTable(
	'effective_place',
	{
		placeId: text('place_id')
			.primaryKey()
			.references(() => place.id, { onDelete: 'cascade' }),
		sourceSnapshotId: text('source_snapshot_id')
			.notNull()
			.references(() => catalogueSourceSnapshot.id, { onDelete: 'restrict' }),
		importId: text('import_id')
			.notNull()
			.references(() => catalogueImport.id, { onDelete: 'restrict' }),
		status: catalogueRecordStatusEnum('status').notNull().default('active'),
		quarantineReason: text('quarantine_reason'),
		name: text('name').notNull(),
		normalizedName: text('normalized_name').notNull(),
		category: rankingCategoryEnum('category').notNull(),
		countryCode: text('country_code').notNull().default('IT'),
		latitude: doublePrecision('latitude').notNull(),
		longitude: doublePrecision('longitude').notNull(),
		addressLabel: text('address_label'),
		postalCode: text('postal_code'),
		settlementName: text('settlement_name'),
		regionBoundaryKey: text('region_boundary_key'),
		regionName: text('region_name'),
		provinceBoundaryKey: text('province_boundary_key'),
		provinceName: text('province_name'),
		municipalityBoundaryKey: text('municipality_boundary_key'),
		municipalityName: text('municipality_name'),
		displayLocality: text('display_locality').notNull(),
		searchText: text('search_text').notNull(),
		localityIndexVersion: text('locality_index_version').notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
	},
	(table) => [
		index('effective_place_category_status_idx').on(table.category, table.status),
		index('effective_place_municipality_idx').on(table.municipalityBoundaryKey, table.category),
		index('effective_place_coordinates_idx').on(table.latitude, table.longitude),
		index('effective_place_normalized_name_idx').on(table.normalizedName),
		check(
			'effective_place_name_ck',
			sql`${table.status} = 'quarantined' or char_length(trim(${table.name})) > 0`
		),
		check('effective_place_search_text_ck', sql`char_length(trim(${table.searchText})) > 0`),
		check('effective_place_latitude_ck', sql`${table.latitude} between -90 and 90`),
		check('effective_place_longitude_ck', sql`${table.longitude} between -180 and 180`),
		check(
			'effective_place_quarantine_reason_ck',
			sql`(${table.status} = 'quarantined' and ${table.quarantineReason} is not null) or (${table.status} <> 'quarantined')`
		)
	]
);

export const catalogueImportElement = pgTable(
	'catalogue_import_element',
	{
		importId: text('import_id')
			.notNull()
			.references(() => catalogueImport.id, { onDelete: 'cascade' }),
		snapshotId: text('snapshot_id')
			.notNull()
			.references(() => catalogueSourceSnapshot.id, { onDelete: 'restrict' })
	},
	(table) => [primaryKey({ columns: [table.importId, table.snapshotId] })]
);
