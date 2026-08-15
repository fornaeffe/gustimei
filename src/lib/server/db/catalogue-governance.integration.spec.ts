import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { normalizeOsmPlace } from '$lib/domain/catalogue/normalization';
import { createDatabase } from '$lib/server/db/connection';
import {
	catalogueChange,
	catalogueIssueReport,
	cataloguePlaceOverride,
	catalogueRankingRepair,
	catalogueRoleAssignment,
	effectivePlace,
	rankingList,
	rankingListPlace,
	session,
	user
} from '$lib/server/db/schema';
import { CatalogueRepository } from '$lib/server/repositories/catalogue';
import { RankingRepository } from '$lib/server/repositories/rankings';
import { CatalogueGovernanceService } from '$lib/server/services/catalogue-governance';

const now = new Date('2026-08-15T10:00:00.000Z');
const connection = createDatabase(process.env.DATABASE_URL!);
const { db } = connection;

function fixturePlace(id: number, name: string, sourceVersion = 1) {
	return normalizeOsmPlace({
		provider: 'openstreetmap',
		elementType: 'node',
		elementId: id,
		category: 'restaurant',
		dataClass: 'synthetic',
		sourceVersion,
		sourceTimestamp: now,
		tags: { amenity: 'restaurant', name, 'addr:city': 'Torino' },
		latitude: 45.07 + id / 10_000,
		longitude: 7.68 + id / 10_000
	});
}

async function importPlaces(importId: string, items: ReturnType<typeof fixturePlace>[]) {
	const catalogue = new CatalogueRepository(db, 'test');
	await catalogue.startImport({
		id: importId,
		category: 'restaurant',
		dataClass: 'synthetic',
		sourceUri: `fixture://${importId}`,
		sourceChecksum: `checksum-${importId}`,
		normalizerVersion: 'test-v1',
		localityIndexVersion: 'test-v1',
		startedAt: now
	});
	await catalogue.stagePlaces(importId, items);
	await catalogue.promote(importId, items, [], { normalized: items.length }, now);
	return catalogue;
}

beforeEach(async () => {
	await db.execute(sql`truncate table "user", "catalogue_import", "place" cascade`);
	await db.insert(user).values([
		{ id: 'admin-1', name: 'Admin one', email: 'admin1@example.test', emailVerified: true },
		{ id: 'admin-2', name: 'Admin two', email: 'admin2@example.test', emailVerified: true },
		{ id: 'curator-1', name: 'Curator', email: 'curator@example.test', emailVerified: true },
		{ id: 'user-1', name: 'User', email: 'user@example.test', emailVerified: true },
		{
			id: 'unverified',
			name: 'Unverified',
			email: 'unverified@example.test',
			emailVerified: false
		}
	]);
});

afterAll(async () => {
	await connection.close();
});

describe('catalogue role operations', () => {
	it('guards bootstrap by environment and verification, protects the last admin, and rotates sessions', async () => {
		const service = new CatalogueGovernanceService(db, 'test', () => now);
		await expect(
			service.bootstrapRole({
				targetUserId: 'unverified',
				role: 'admin',
				environment: 'test',
				operatorReference: 'local-shell',
				reason: 'initial setup'
			})
		).rejects.toThrow('verified');
		await expect(
			service.bootstrapRole({
				targetUserId: 'admin-1',
				role: 'admin',
				environment: 'production',
				operatorReference: 'local-shell',
				reason: 'wrong environment'
			})
		).rejects.toThrow('does not match');

		await service.bootstrapRole({
			targetUserId: 'admin-1',
			role: 'admin',
			environment: 'test',
			operatorReference: 'local-shell',
			reason: 'initial setup'
		});
		await expect(service.revokeRole('admin-1', 'admin-1', 'admin', 'rotate')).rejects.toThrow(
			'last active administrator'
		);
		await db.insert(session).values({
			id: 'session-admin-1',
			token: 'token-admin-1',
			userId: 'admin-1',
			expiresAt: new Date('2026-08-16T10:00:00Z'),
			createdAt: now,
			updatedAt: now
		});
		const rotation = await service.rotateRole({
			actorUserId: 'admin-1',
			predecessorUserId: 'admin-1',
			successorUserId: 'admin-2',
			role: 'admin',
			reason: 'operator rotation'
		});
		expect(rotation.revokedSessions).toBe(1);
		expect(await db.select().from(session)).toEqual([]);
		const assignments = await db.select().from(catalogueRoleAssignment);
		expect(assignments).toHaveLength(2);
		expect(assignments.find((item) => item.userId === 'admin-1')?.revokedAt).toEqual(now);
		expect(assignments.find((item) => item.userId === 'admin-2')?.revokedAt).toBeNull();
		expect((await db.select().from(catalogueChange)).map((item) => item.action)).toEqual([
			'role-granted',
			'role-granted',
			'role-rotated'
		]);
	});
});

describe('catalogue issue, overlay, and source reconciliation', () => {
	it('rate-limits private intake and keeps a reviewed correction effective across an upstream match', async () => {
		const catalogue = await importPlaces('import-v1', [
			fixturePlace(1, 'Source name'),
			fixturePlace(2, 'Other place')
		]);
		const service = new CatalogueGovernanceService(db, 'test', () => now);
		await service.bootstrapRole({
			targetUserId: 'curator-1',
			role: 'catalogue_curator',
			environment: 'test',
			operatorReference: 'local-shell',
			reason: 'catalogue operations'
		});

		let firstReportId = '';
		for (let index = 0; index < 5; index += 1) {
			const report = await service.submitIssue('user-1', {
				placeId: 'osm:node:1',
				type: 'wrong-name',
				details: `Correction ${index}`
			});
			if (index === 0) firstReportId = report.id;
		}
		await expect(
			service.submitIssue('user-1', { placeId: 'osm:node:1', type: 'wrong-name' })
		).rejects.toThrow('Too many');
		await service.triageIssue('curator-1', firstReportId);
		await service.applyOverride('curator-1', {
			placeId: 'osm:node:1',
			patch: { name: 'Correct name' },
			reasonCategory: 'verified-name-correction',
			evidenceReference: 'https://example.test/evidence/1',
			linkedReportId: firstReportId,
			reviewAt: new Date('2027-08-15T10:00:00Z')
		});
		await service.resolveIssue(
			'curator-1',
			firstReportId,
			'resolved',
			'Applied verified name correction'
		);
		expect(
			await catalogue.search({ category: 'restaurant', dataClass: 'synthetic', text: 'correct' })
		).toHaveLength(1);

		await importPlaces('import-v2', [
			fixturePlace(1, 'Correct name', 2),
			fixturePlace(2, 'Other place', 2)
		]);
		const [override] = await db.select().from(cataloguePlaceOverride);
		expect(override.reviewStatus).toBe('upstream-match');
		expect(
			(await db.select().from(effectivePlace)).find((item) => item.placeId === 'osm:node:1')?.name
		).toBe('Correct name');
		await importPlaces('import-v3', [fixturePlace(2, 'Other place', 3)]);
		expect((await db.select().from(cataloguePlaceOverride))[0].reviewStatus).toBe('conflict');
		expect(
			(await db.select().from(effectivePlace)).find((item) => item.placeId === 'osm:node:1')
		).toMatchObject({ name: 'Correct name', status: 'active' });
		expect(
			(await db.select().from(catalogueChange)).some((item) => item.action === 'import-conflict')
		).toBe(true);
		const [firstAudit] = await db.select({ id: catalogueChange.id }).from(catalogueChange).limit(1);
		await expect(
			db
				.update(catalogueChange)
				.set({ reasonCategory: 'tampered' })
				.where(eq(catalogueChange.id, firstAudit.id))
		).rejects.toThrow();
		await service.retireOverride('curator-1', override.id, 'source record is no longer current');
		expect(
			(await db.select().from(effectivePlace)).find((item) => item.placeId === 'osm:node:1')
		).toMatchObject({ status: 'quarantined', quarantineReason: 'missing-from-latest-source' });
		await db.delete(user).where(eq(user.id, 'user-1'));
		expect(await db.select().from(catalogueIssueReport)).toEqual([]);
		expect((await db.select().from(cataloguePlaceOverride))[0].linkedReportId).toBeNull();
	});
});

describe('catalogue merge repair operations', () => {
	it('collapses active visited membership, requests repair, blocks cycles, and reverses the redirect', async () => {
		await importPlaces('merge-import', [
			fixturePlace(1, 'Duplicate'),
			fixturePlace(2, 'Canonical')
		]);
		const service = new CatalogueGovernanceService(db, 'test', () => now);
		await service.bootstrapRole({
			targetUserId: 'admin-1',
			role: 'admin',
			environment: 'test',
			operatorReference: 'local-shell',
			reason: 'catalogue operations'
		});
		await db.insert(rankingList).values({
			id: 'list-1',
			ownerId: 'user-1',
			category: 'restaurant',
			createdAt: now,
			updatedAt: now
		});
		await db.insert(rankingListPlace).values({
			listId: 'list-1',
			ownerId: 'user-1',
			placeId: 'osm:node:1',
			addedAt: now
		});

		await expect(
			service.mergePlaces('user-1', {
				sourcePlaceId: 'osm:node:1',
				canonicalPlaceId: 'osm:node:2',
				reasonCategory: 'duplicate',
				evidenceReference: 'local-review'
			})
		).rejects.toThrow('admin');
		const merge = await service.mergePlaces('admin-1', {
			sourcePlaceId: 'osm:node:1',
			canonicalPlaceId: 'osm:node:2',
			reasonCategory: 'duplicate',
			evidenceReference: 'local-review'
		});
		expect(await new RankingRepository(db).listVisitedPlaceIds('user-1', 'list-1')).toEqual([
			'osm:node:2'
		]);
		expect((await db.select().from(catalogueRankingRepair))[0]).toMatchObject({
			listId: 'list-1',
			reason: 'duplicate-merge',
			status: 'pending'
		});
		expect((await db.select().from(rankingListPlace)).map((item) => item.placeId).sort()).toEqual([
			'osm:node:1',
			'osm:node:2'
		]);
		await expect(
			service.mergePlaces('admin-1', {
				sourcePlaceId: 'osm:node:2',
				canonicalPlaceId: 'osm:node:1',
				reasonCategory: 'bad-cycle',
				evidenceReference: 'local-review'
			})
		).rejects.toThrow('cycle');

		await service.reverseMerge('admin-1', merge.redirectId, 'not duplicates');
		expect(await new RankingRepository(db).listVisitedPlaceIds('user-1', 'list-1')).toEqual([
			'osm:node:1'
		]);
		expect(
			(await db.select().from(effectivePlace)).find((item) => item.placeId === 'osm:node:1')
		).toMatchObject({ status: 'active', name: 'Duplicate' });
	});

	it('requires quarantine before impact-managed category migration and tombstones exceptional removals', async () => {
		await importPlaces('category-import', [
			fixturePlace(1, 'Wrong category'),
			fixturePlace(2, 'Unsafe')
		]);
		const service = new CatalogueGovernanceService(db, 'test', () => now);
		await service.bootstrapRole({
			targetUserId: 'admin-1',
			role: 'admin',
			environment: 'test',
			operatorReference: 'local-shell',
			reason: 'catalogue operations'
		});
		await expect(
			service.migrateCategory('admin-1', {
				placeId: 'osm:node:1',
				toCategory: 'hotel',
				impactPolicy: 'quarantine-and-repair',
				reasonCategory: 'wrong-category',
				evidenceReference: 'local-review'
			})
		).rejects.toThrow('quarantined');
		await service.applyOverride('admin-1', {
			placeId: 'osm:node:1',
			patch: { visibility: { status: 'quarantined', reason: 'wrong-category' } },
			reasonCategory: 'wrong-category',
			evidenceReference: 'local-review',
			reviewAt: new Date('2027-08-15T10:00:00Z')
		});
		await service.migrateCategory('admin-1', {
			placeId: 'osm:node:1',
			toCategory: 'hotel',
			impactPolicy: 'quarantine-and-repair',
			reasonCategory: 'wrong-category',
			evidenceReference: 'local-review'
		});
		expect(
			(await db.select().from(effectivePlace)).find((item) => item.placeId === 'osm:node:1')
		).toMatchObject({ category: 'hotel', status: 'quarantined' });

		const removed = await service.exceptionalRemove(
			'admin-1',
			'osm:node:2',
			'validated-security-requirement',
			'security-case-1'
		);
		expect(removed.tombstoned).toBe(true);
		await importPlaces('category-import-v2', [
			fixturePlace(1, 'Wrong category', 2),
			fixturePlace(2, 'Unsafe', 2)
		]);
		expect(
			(await db.select().from(effectivePlace)).find((item) => item.placeId === 'osm:node:2')
		).toMatchObject({ status: 'hidden' });
		await service.reverseExceptionalRemoval('admin-1', 'osm:node:2', 'security case cleared');
		expect(
			(await db.select().from(effectivePlace)).find((item) => item.placeId === 'osm:node:2')
		).toMatchObject({ status: 'active' });
	});
});
