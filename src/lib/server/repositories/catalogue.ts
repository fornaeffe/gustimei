import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type {
	CatalogueSearchQuery,
	CatalogueSearchResult,
	NormalizedLocalityBoundary,
	NormalizedPlaceInput
} from '$lib/domain/catalogue/contracts';
import { boundaryKey } from '$lib/domain/catalogue/contracts';
import {
	applyCatalogueOverride,
	classifyOverrideReconciliation,
	type EffectivePlaceValues
} from '$lib/domain/catalogue/governance';
import { normalizeSearchText } from '$lib/domain/catalogue/normalization';
import type { AppEnvironment } from '$lib/server/config/environment';
import type { Database } from '$lib/server/db';
import {
	catalogueBasePlace,
	catalogueCategoryMigration,
	catalogueChange,
	catalogueImport,
	catalogueImportElement,
	cataloguePlaceOverride,
	cataloguePlaceRedirect,
	cataloguePlaceTombstone,
	catalogueSourceMapping,
	catalogueSourceSnapshot,
	effectivePlace,
	localityBoundary,
	place
} from '$lib/server/db/schema';
import { ConflictError, NotFoundError } from '$lib/server/domain/errors';

const BATCH_SIZE = 500;

function batches<T>(items: readonly T[], size = BATCH_SIZE) {
	const result: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		result.push(items.slice(index, index + size));
	}
	return result;
}

type BaseProjectionRow = typeof catalogueBasePlace.$inferInsert;

function inputToBaseRow(
	input: NormalizedPlaceInput,
	importId: string,
	now: Date
): BaseProjectionRow {
	return {
		placeId: placeIdForOsm(input),
		sourceSnapshotId: snapshotIdForOsm(input),
		importId,
		status: input.quarantineReason ? 'quarantined' : 'active',
		quarantineReason: input.quarantineReason,
		name: input.name,
		normalizedName: input.normalizedName,
		category: input.category,
		countryCode: input.locality.countryCode,
		latitude: input.latitude,
		longitude: input.longitude,
		addressLabel: input.addressLabel,
		postalCode: input.locality.postalCode,
		settlementName: input.locality.settlementName,
		regionBoundaryKey: boundaryKey(input.locality.region),
		regionName: input.locality.region?.name,
		provinceBoundaryKey: boundaryKey(input.locality.province),
		provinceName: input.locality.province?.name,
		municipalityBoundaryKey: boundaryKey(input.locality.municipality),
		municipalityName: input.locality.municipality?.name,
		displayLocality: input.locality.displayLabel,
		searchText: `${input.normalizedName} ${input.locality.searchText}`.trim(),
		localityIndexVersion: input.locality.indexVersion,
		updatedAt: now
	};
}

export function projectionValues(row: BaseProjectionRow): EffectivePlaceValues {
	return {
		name: row.name,
		addressLabel: row.addressLabel ?? null,
		latitude: row.latitude,
		longitude: row.longitude,
		locality: {
			countryCode: row.countryCode ?? 'IT',
			postalCode: row.postalCode ?? null,
			settlementName: row.settlementName ?? null,
			regionBoundaryKey: row.regionBoundaryKey ?? null,
			regionName: row.regionName ?? null,
			provinceBoundaryKey: row.provinceBoundaryKey ?? null,
			provinceName: row.provinceName ?? null,
			municipalityBoundaryKey: row.municipalityBoundaryKey ?? null,
			municipalityName: row.municipalityName ?? null,
			displayLocality: row.displayLocality
		},
		visibility: { status: row.status ?? 'active', reason: row.quarantineReason ?? null }
	};
}

export function resolvedProjectionRow(
	base: BaseProjectionRow,
	values: EffectivePlaceValues,
	category: 'restaurant' | 'hotel'
): typeof effectivePlace.$inferInsert {
	const searchText = normalizeSearchText(
		[
			values.name,
			values.addressLabel,
			values.locality.displayLocality,
			values.locality.settlementName,
			values.locality.postalCode,
			values.locality.regionName,
			values.locality.provinceName,
			values.locality.municipalityName
		]
			.filter(Boolean)
			.join(' ')
	);
	return {
		...base,
		category,
		status: values.visibility.status,
		quarantineReason: values.visibility.reason,
		name: values.name,
		normalizedName: normalizeSearchText(values.name),
		latitude: values.latitude,
		longitude: values.longitude,
		addressLabel: values.addressLabel,
		countryCode: values.locality.countryCode,
		postalCode: values.locality.postalCode,
		settlementName: values.locality.settlementName,
		regionBoundaryKey: values.locality.regionBoundaryKey,
		regionName: values.locality.regionName,
		provinceBoundaryKey: values.locality.provinceBoundaryKey,
		provinceName: values.locality.provinceName,
		municipalityBoundaryKey: values.locality.municipalityBoundaryKey,
		municipalityName: values.locality.municipalityName,
		displayLocality: values.locality.displayLocality,
		searchText
	};
}

export function placeIdForOsm(input: Pick<NormalizedPlaceInput, 'elementType' | 'elementId'>) {
	return `osm:${input.elementType}:${input.elementId}`;
}

export function snapshotIdForOsm(
	input: Pick<NormalizedPlaceInput, 'elementType' | 'elementId' | 'sourceVersion' | 'contentHash'>
) {
	return `osm:${input.elementType}:${input.elementId}:v${input.sourceVersion}:${input.contentHash.slice(0, 16)}`;
}

function boundarySnapshotId(input: NormalizedLocalityBoundary) {
	return `osm-boundary:${input.elementType}:${input.elementId}:v${input.sourceVersion}:${input.contentHash.slice(0, 16)}`;
}

export interface CatalogueImportStart {
	id: string;
	category: 'restaurant' | 'hotel';
	dataClass: 'real' | 'synthetic';
	sourceUri: string;
	sourceChecksum: string;
	sourceTimestamp?: Date;
	normalizerVersion: string;
	localityIndexVersion: string;
	startedAt: Date;
}

export class CatalogueRepository {
	constructor(
		private readonly database: Database,
		private readonly environment: AppEnvironment = 'development'
	) {}

	async startImport(input: CatalogueImportStart) {
		const inserted = await this.database
			.insert(catalogueImport)
			.values(input)
			.onConflictDoNothing()
			.returning();
		if (inserted[0]) return { record: inserted[0], reused: false };
		const [existing] = await this.database
			.select()
			.from(catalogueImport)
			.where(
				and(
					eq(catalogueImport.category, input.category),
					eq(catalogueImport.dataClass, input.dataClass),
					eq(catalogueImport.sourceChecksum, input.sourceChecksum),
					eq(catalogueImport.normalizerVersion, input.normalizerVersion),
					eq(catalogueImport.localityIndexVersion, input.localityIndexVersion)
				)
			)
			.limit(1);
		if (!existing) throw new ConflictError('The catalogue import could not be created');
		return { record: existing, reused: true };
	}

	async resumeImport(importId: string, now: Date) {
		const [record] = await this.database
			.update(catalogueImport)
			.set({ status: 'staging', failureMessage: null, completedAt: null, startedAt: now })
			.where(
				and(
					eq(catalogueImport.id, importId),
					inArray(catalogueImport.status, ['staging', 'staged', 'failed'])
				)
			)
			.returning();
		if (!record) throw new ConflictError('Only incomplete imports can be resumed');
		return record;
	}

	async stagePlaces(
		importId: string,
		inputs: readonly NormalizedPlaceInput[],
		boundaries: readonly NormalizedLocalityBoundary[] = []
	) {
		for (const batch of batches(inputs)) {
			await this.database.transaction(async (transaction) => {
				await transaction
					.insert(place)
					.values(
						batch.map((input) => ({
							id: placeIdForOsm(input),
							category: input.category,
							dataClass: input.dataClass
						}))
					)
					.onConflictDoNothing();

				await transaction
					.insert(catalogueSourceSnapshot)
					.values(
						batch.map((input) => ({
							id: snapshotIdForOsm(input),
							importId,
							provider: input.provider,
							elementType: input.elementType,
							elementId: input.elementId,
							sourceVersion: input.sourceVersion,
							sourceTimestamp: input.sourceTimestamp,
							contentHash: input.contentHash,
							tags: { ...input.tags },
							latitude: input.latitude,
							longitude: input.longitude
						}))
					)
					.onConflictDoNothing();

				await transaction
					.insert(catalogueImportElement)
					.values(
						batch.map((input) => ({
							importId,
							snapshotId: snapshotIdForOsm(input)
						}))
					)
					.onConflictDoNothing();
			});
		}
		for (const batch of batches(boundaries)) {
			await this.database.transaction(async (transaction) => {
				await transaction
					.insert(catalogueSourceSnapshot)
					.values(
						batch.map((input) => ({
							id: boundarySnapshotId(input),
							importId,
							provider: input.provider,
							elementType: input.elementType,
							elementId: input.elementId,
							sourceVersion: input.sourceVersion,
							sourceTimestamp: input.sourceTimestamp,
							contentHash: input.contentHash,
							tags: { ...input.tags },
							latitude: input.latitude,
							longitude: input.longitude
						}))
					)
					.onConflictDoNothing();
				await transaction
					.insert(catalogueImportElement)
					.values(
						batch.map((input) => ({
							importId,
							snapshotId: boundarySnapshotId(input)
						}))
					)
					.onConflictDoNothing();
			});
		}
		await this.database
			.update(catalogueImport)
			.set({ status: 'staged' })
			.where(and(eq(catalogueImport.id, importId), eq(catalogueImport.status, 'staging')));
	}

	async promote(
		importId: string,
		inputs: readonly NormalizedPlaceInput[],
		boundaries: readonly NormalizedLocalityBoundary[],
		statistics: Record<string, number>,
		now: Date
	) {
		if (inputs.length === 0)
			throw new ConflictError('An empty catalogue import cannot be promoted');
		const [record] = await this.database
			.select()
			.from(catalogueImport)
			.where(eq(catalogueImport.id, importId));
		if (!record) throw new NotFoundError('The catalogue import was not found');
		if (record.status === 'promoted') return record;
		if (record.status !== 'staged') throw new ConflictError('Only staged imports can be promoted');

		return this.database.transaction(async (transaction) => {
			for (const batch of batches(boundaries)) {
				await transaction
					.insert(localityBoundary)
					.values(
						batch.map((boundary) => ({
							provider: boundary.provider,
							elementType: boundary.elementType,
							elementId: boundary.elementId,
							adminLevel: boundary.adminLevel,
							name: boundary.name,
							normalizedName: normalizeSearchText(boundary.name),
							countryCode: boundary.countryCode,
							sourceSnapshotId: boundarySnapshotId(boundary)
						}))
					)
					.onConflictDoUpdate({
						target: [
							localityBoundary.provider,
							localityBoundary.elementType,
							localityBoundary.elementId
						],
						set: {
							name: sql`excluded.name`,
							normalizedName: sql`excluded.normalized_name`,
							countryCode: sql`excluded.country_code`,
							sourceSnapshotId: sql`excluded.source_snapshot_id`
						}
					});
			}

			for (const batch of batches(inputs)) {
				const baseRows = batch.map((input) => inputToBaseRow(input, importId, now));
				const placeIds = baseRows.map((item) => item.placeId);
				await transaction
					.insert(catalogueSourceMapping)
					.values(
						batch.map((input) => ({
							provider: input.provider,
							elementType: input.elementType,
							elementId: input.elementId,
							placeId: placeIdForOsm(input),
							currentSnapshotId: snapshotIdForOsm(input),
							updatedAt: now
						}))
					)
					.onConflictDoUpdate({
						target: [
							catalogueSourceMapping.provider,
							catalogueSourceMapping.elementType,
							catalogueSourceMapping.elementId
						],
						set: { currentSnapshotId: sql`excluded.current_snapshot_id`, updatedAt: now }
					});

				await transaction
					.insert(catalogueBasePlace)
					.values(baseRows)
					.onConflictDoUpdate({
						target: catalogueBasePlace.placeId,
						set: {
							sourceSnapshotId: sql`excluded.source_snapshot_id`,
							importId,
							status: sql`excluded.status`,
							quarantineReason: sql`excluded.quarantine_reason`,
							name: sql`excluded.name`,
							normalizedName: sql`excluded.normalized_name`,
							category: sql`excluded.category`,
							countryCode: sql`excluded.country_code`,
							latitude: sql`excluded.latitude`,
							longitude: sql`excluded.longitude`,
							addressLabel: sql`excluded.address_label`,
							postalCode: sql`excluded.postal_code`,
							settlementName: sql`excluded.settlement_name`,
							regionBoundaryKey: sql`excluded.region_boundary_key`,
							regionName: sql`excluded.region_name`,
							provinceBoundaryKey: sql`excluded.province_boundary_key`,
							provinceName: sql`excluded.province_name`,
							municipalityBoundaryKey: sql`excluded.municipality_boundary_key`,
							municipalityName: sql`excluded.municipality_name`,
							displayLocality: sql`excluded.display_locality`,
							searchText: sql`excluded.search_text`,
							localityIndexVersion: sql`excluded.locality_index_version`,
							updatedAt: now
						}
					});

				const [overrides, redirects, migrations, tombstones] = await Promise.all([
					transaction
						.select()
						.from(cataloguePlaceOverride)
						.where(
							and(
								inArray(cataloguePlaceOverride.placeId, placeIds),
								isNull(cataloguePlaceOverride.retiredAt)
							)
						),
					transaction
						.select()
						.from(cataloguePlaceRedirect)
						.where(
							and(
								inArray(cataloguePlaceRedirect.sourcePlaceId, placeIds),
								isNull(cataloguePlaceRedirect.reversedAt)
							)
						),
					transaction
						.select()
						.from(catalogueCategoryMigration)
						.where(
							and(
								inArray(catalogueCategoryMigration.placeId, placeIds),
								isNull(catalogueCategoryMigration.reversedAt)
							)
						),
					transaction
						.select()
						.from(cataloguePlaceTombstone)
						.where(
							and(
								inArray(cataloguePlaceTombstone.placeId, placeIds),
								isNull(cataloguePlaceTombstone.reversedAt)
							)
						)
				]);
				const overridesByPlace = new Map(overrides.map((item) => [item.placeId, item]));
				const redirectsByPlace = new Map(redirects.map((item) => [item.sourcePlaceId, item]));
				const migrationsByPlace = new Map(migrations.map((item) => [item.placeId, item]));
				const tombstonesByPlace = new Map(tombstones.map((item) => [item.placeId, item]));
				const effectiveRows = baseRows.map((base) => {
					const baseValues = projectionValues(base);
					const override = overridesByPlace.get(base.placeId);
					const values = override ? applyCatalogueOverride(baseValues, override.patch) : baseValues;
					const redirect = redirectsByPlace.get(base.placeId);
					if (redirect) {
						values.visibility = {
							status: 'hidden',
							reason: `merged-into:${redirect.canonicalPlaceId}`
						};
					}
					const tombstone = tombstonesByPlace.get(base.placeId);
					if (tombstone) {
						values.visibility = {
							status: 'hidden',
							reason: `exceptional-removal:${tombstone.reason}`
						};
					}
					return resolvedProjectionRow(
						base,
						values,
						migrationsByPlace.get(base.placeId)?.toCategory ?? base.category
					);
				});

				await transaction
					.insert(effectivePlace)
					.values(effectiveRows)
					.onConflictDoUpdate({
						target: effectivePlace.placeId,
						set: {
							sourceSnapshotId: sql`excluded.source_snapshot_id`,
							importId,
							status: sql`excluded.status`,
							quarantineReason: sql`excluded.quarantine_reason`,
							name: sql`excluded.name`,
							normalizedName: sql`excluded.normalized_name`,
							category: sql`excluded.category`,
							countryCode: sql`excluded.country_code`,
							latitude: sql`excluded.latitude`,
							longitude: sql`excluded.longitude`,
							addressLabel: sql`excluded.address_label`,
							postalCode: sql`excluded.postal_code`,
							settlementName: sql`excluded.settlement_name`,
							regionBoundaryKey: sql`excluded.region_boundary_key`,
							regionName: sql`excluded.region_name`,
							provinceBoundaryKey: sql`excluded.province_boundary_key`,
							provinceName: sql`excluded.province_name`,
							municipalityBoundaryKey: sql`excluded.municipality_boundary_key`,
							municipalityName: sql`excluded.municipality_name`,
							displayLocality: sql`excluded.display_locality`,
							searchText: sql`excluded.search_text`,
							localityIndexVersion: sql`excluded.locality_index_version`,
							updatedAt: now
						}
					});

				for (const override of overrides) {
					const base = baseRows.find((item) => item.placeId === override.placeId)!;
					const reviewStatus = classifyOverrideReconciliation(
						projectionValues(base),
						override.patch,
						override.baseValues,
						now,
						override.expiresAt
					);
					if (reviewStatus === override.reviewStatus) continue;
					await transaction
						.update(cataloguePlaceOverride)
						.set({ reviewStatus })
						.where(eq(cataloguePlaceOverride.id, override.id));
					await transaction.insert(catalogueChange).values({
						id: randomUUID(),
						action: 'import-conflict',
						actorRole: 'system',
						environment: this.environment,
						targetPlaceId: override.placeId,
						sourceIdentities: batch
							.filter((item) => placeIdForOsm(item) === override.placeId)
							.map((item) => ({
								placeId: override.placeId,
								provider: item.provider,
								elementType: item.elementType,
								elementId: item.elementId
							})),
						before: { reviewStatus: override.reviewStatus },
						after: { reviewStatus },
						reasonCategory: 'upstream-reconciliation',
						evidenceReferences: [override.evidenceReference],
						linkedReportId: override.linkedReportId,
						importId,
						impact: {},
						createdAt: now
					});
				}
			}

			const missingFilter = (projection: typeof effectivePlace | typeof catalogueBasePlace) =>
				and(
					eq(projection.category, record.category),
					sql`exists (
						select 1 from ${place} catalogue_place
						where catalogue_place.id = ${projection.placeId}
							and catalogue_place.data_class = ${record.dataClass}
					)`,
					sql`not exists (
						select 1
						from ${catalogueSourceMapping} source_mapping
						join ${catalogueImportElement} import_element
							on import_element.snapshot_id = source_mapping.current_snapshot_id
						where source_mapping.place_id = ${projection.placeId}
							and import_element.import_id = ${importId}
					)`
				);
			await transaction
				.update(catalogueBasePlace)
				.set({
					status: 'quarantined',
					quarantineReason: 'missing-from-latest-source',
					updatedAt: now
				})
				.where(missingFilter(catalogueBasePlace));
			const missingOverrides = await transaction
				.select({
					override: cataloguePlaceOverride,
					mapping: catalogueSourceMapping
				})
				.from(cataloguePlaceOverride)
				.innerJoin(
					catalogueBasePlace,
					eq(catalogueBasePlace.placeId, cataloguePlaceOverride.placeId)
				)
				.innerJoin(place, eq(place.id, catalogueBasePlace.placeId))
				.leftJoin(
					catalogueSourceMapping,
					eq(catalogueSourceMapping.placeId, cataloguePlaceOverride.placeId)
				)
				.where(
					and(
						eq(catalogueBasePlace.category, record.category),
						eq(place.dataClass, record.dataClass),
						eq(catalogueBasePlace.quarantineReason, 'missing-from-latest-source'),
						isNull(cataloguePlaceOverride.retiredAt),
						sql`${cataloguePlaceOverride.reviewStatus} <> 'conflict'`
					)
				);
			for (const { override, mapping } of missingOverrides) {
				await transaction
					.update(cataloguePlaceOverride)
					.set({ reviewStatus: 'conflict' })
					.where(eq(cataloguePlaceOverride.id, override.id));
				await transaction.insert(catalogueChange).values({
					id: randomUUID(),
					action: 'import-conflict',
					actorRole: 'system',
					environment: this.environment,
					targetPlaceId: override.placeId,
					sourceIdentities: mapping
						? [
								{
									placeId: mapping.placeId,
									provider: mapping.provider,
									elementType: mapping.elementType,
									elementId: mapping.elementId
								}
							]
						: [],
					before: { reviewStatus: override.reviewStatus },
					after: { reviewStatus: 'conflict', missingFromLatestSource: true },
					reasonCategory: 'upstream-reconciliation',
					evidenceReferences: [override.evidenceReference],
					linkedReportId: override.linkedReportId,
					importId,
					impact: {},
					createdAt: now
				});
			}
			await transaction
				.update(effectivePlace)
				.set({
					status: 'quarantined',
					quarantineReason: 'missing-from-latest-source',
					updatedAt: now
				})
				.where(
					and(
						missingFilter(effectivePlace),
						sql`not exists (
							select 1 from ${cataloguePlaceOverride} local_override
							where local_override.place_id = ${effectivePlace.placeId}
								and local_override.retired_at is null
						)`,
						sql`not exists (
							select 1 from ${cataloguePlaceRedirect} active_redirect
							where active_redirect.source_place_id = ${effectivePlace.placeId}
								and active_redirect.reversed_at is null
						)`,
						sql`not exists (
							select 1 from ${cataloguePlaceTombstone} active_tombstone
							where active_tombstone.place_id = ${effectivePlace.placeId}
								and active_tombstone.reversed_at is null
						)`
					)
				);

			const [promoted] = await transaction
				.update(catalogueImport)
				.set({ status: 'promoted', statistics, completedAt: now, promotedAt: now })
				.where(and(eq(catalogueImport.id, importId), eq(catalogueImport.status, 'staged')))
				.returning();
			if (!promoted) throw new ConflictError('The catalogue import was concurrently promoted');
			return promoted;
		});
	}

	async failImport(importId: string, message: string, now: Date) {
		await this.database
			.update(catalogueImport)
			.set({ status: 'failed', failureMessage: message.slice(0, 2_000), completedAt: now })
			.where(
				and(
					eq(catalogueImport.id, importId),
					inArray(catalogueImport.status, ['staging', 'staged'])
				)
			);
	}

	async search(query: CatalogueSearchQuery): Promise<CatalogueSearchResult[]> {
		const text = normalizeSearchText(query.text);
		const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
		const offset = Math.max(query.offset ?? 0, 0);
		const filters = [
			eq(effectivePlace.category, query.category),
			eq(effectivePlace.status, 'active'),
			eq(place.dataClass, query.dataClass ?? 'real')
		];
		if (text) {
			const prefixQuery = text
				.split(' ')
				.filter(Boolean)
				.map((token) => `${token}:*`)
				.join(' & ');
			filters.push(
				sql`to_tsvector('simple', ${effectivePlace.searchText}) @@ to_tsquery('simple', ${prefixQuery})`
			);
		}
		if (query.municipalityBoundaryKey) {
			filters.push(eq(effectivePlace.municipalityBoundaryKey, query.municipalityBoundaryKey));
		}
		if (query.bounds) {
			filters.push(
				gte(effectivePlace.latitude, query.bounds.south),
				lte(effectivePlace.latitude, query.bounds.north),
				gte(effectivePlace.longitude, query.bounds.west),
				lte(effectivePlace.longitude, query.bounds.east)
			);
		}
		const ordering = text
			? [
					asc(
						sql`case when ${effectivePlace.normalizedName} = ${text} then 0 when ${effectivePlace.normalizedName} like ${`${text}%`} then 1 else 2 end`
					),
					asc(effectivePlace.normalizedName),
					asc(effectivePlace.placeId)
				]
			: [asc(effectivePlace.normalizedName), asc(effectivePlace.placeId)];
		const rows = await this.database
			.select({ effective: effectivePlace, mapping: catalogueSourceMapping })
			.from(effectivePlace)
			.innerJoin(place, eq(place.id, effectivePlace.placeId))
			.innerJoin(catalogueSourceMapping, eq(catalogueSourceMapping.placeId, effectivePlace.placeId))
			.where(and(...filters))
			.orderBy(...ordering)
			.limit(limit)
			.offset(offset);

		return rows.map(({ effective, mapping }) => ({
			placeId: effective.placeId,
			name: effective.name,
			category: effective.category,
			latitude: effective.latitude,
			longitude: effective.longitude,
			displayLocality: effective.displayLocality,
			municipalityBoundaryKey: effective.municipalityBoundaryKey ?? undefined,
			addressLabel: effective.addressLabel ?? undefined,
			source: {
				provider: 'openstreetmap',
				elementType: mapping.elementType,
				elementId: mapping.elementId
			}
		}));
	}

	async auditLatest(category: 'restaurant' | 'hotel', dataClass: 'real' | 'synthetic' = 'real') {
		const filter = and(eq(effectivePlace.category, category), eq(place.dataClass, dataClass));
		const quarantineReasonGroup = sql<string>`case
			when ${effectivePlace.quarantineReason} like 'possible-duplicate-of:%'
			then 'possible-duplicate'
			else ${effectivePlace.quarantineReason}
		end`;
		const [summaryRows, regions, elementTypes, quarantineReasons] = await Promise.all([
			this.database
				.select({
					total: sql<number>`count(*)::integer`,
					active: sql<number>`count(*) filter (where ${effectivePlace.status} = 'active')::integer`,
					quarantined: sql<number>`count(*) filter (where ${effectivePlace.status} = 'quarantined')::integer`,
					missingMunicipalityIdentity: sql<number>`count(*) filter (where ${effectivePlace.municipalityBoundaryKey} is null)::integer`,
					missingSettlement: sql<number>`count(*) filter (where ${effectivePlace.settlementName} is null)::integer`,
					missingPostalCode: sql<number>`count(*) filter (where ${effectivePlace.postalCode} is null)::integer`,
					minimumLatitude: sql<number | null>`min(${effectivePlace.latitude})`,
					maximumLatitude: sql<number | null>`max(${effectivePlace.latitude})`,
					minimumLongitude: sql<number | null>`min(${effectivePlace.longitude})`,
					maximumLongitude: sql<number | null>`max(${effectivePlace.longitude})`
				})
				.from(effectivePlace)
				.innerJoin(place, eq(place.id, effectivePlace.placeId))
				.where(filter),
			this.database
				.select({ region: effectivePlace.regionName, count: sql<number>`count(*)::integer` })
				.from(effectivePlace)
				.innerJoin(place, eq(place.id, effectivePlace.placeId))
				.where(and(filter, eq(effectivePlace.status, 'active')))
				.groupBy(effectivePlace.regionName)
				.orderBy(sql`count(*) desc`, asc(effectivePlace.regionName)),
			this.database
				.select({
					elementType: catalogueSourceMapping.elementType,
					count: sql<number>`count(*)::integer`
				})
				.from(effectivePlace)
				.innerJoin(place, eq(place.id, effectivePlace.placeId))
				.innerJoin(
					catalogueSourceMapping,
					eq(catalogueSourceMapping.placeId, effectivePlace.placeId)
				)
				.where(filter)
				.groupBy(catalogueSourceMapping.elementType)
				.orderBy(asc(catalogueSourceMapping.elementType)),
			this.database
				.select({
					reason: quarantineReasonGroup,
					count: sql<number>`count(*)::integer`
				})
				.from(effectivePlace)
				.innerJoin(place, eq(place.id, effectivePlace.placeId))
				.where(and(filter, eq(effectivePlace.status, 'quarantined')))
				.groupBy(quarantineReasonGroup)
				.orderBy(sql`count(*) desc`, asc(quarantineReasonGroup))
		]);
		return { ...summaryRows[0], regions, elementTypes, quarantineReasons };
	}
}
