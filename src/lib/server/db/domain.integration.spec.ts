import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import type { NormalizedLocalityBoundary } from '$lib/domain/catalogue/contracts';
import { normalizeOsmPlace } from '$lib/domain/catalogue/normalization';
import { createRankingRevision } from '$lib/domain/ranking/revision';
import { RankingSession } from '$lib/domain/ranking/session';
import { createDatabase } from '$lib/server/db/connection';
import {
	catalogueSourceSnapshot,
	comparisonEvidence,
	localityBoundary,
	personalPlaceComment,
	productAnalyticsEvent,
	recommendationAttribution,
	rankingList,
	rankingRevision,
	rankingRevisionEvidence,
	rankingSession,
	user
} from '$lib/server/db/schema';
import { CatalogueRepository } from '$lib/server/repositories/catalogue';
import {
	ParticipationRepository,
	ProcessingRestrictionRepository
} from '$lib/server/repositories/participation';
import { PersonalCommentRepository } from '$lib/server/repositories/personal-comments';
import { RankingRepository, type CaptureContext } from '$lib/server/repositories/rankings';
import { DatabaseRecommendationEvidenceSource } from '$lib/server/repositories/recommendation-evidence';
import { PersonalCommentService } from '$lib/server/services/personal-comments';
import { ProductAnalyticsService } from '$lib/server/services/product-analytics';
import { RecommendationAttributionService } from '$lib/server/services/recommendation-attribution';

const now = new Date('2026-08-14T12:00:00.000Z');
const connection = createDatabase(process.env.DATABASE_URL!);
const { db } = connection;
const capture: CaptureContext = {
	cohortAssignmentId: 'assignment-1',
	provenance: 'synthetic',
	environment: 'test'
};

async function seedUsers() {
	await db.insert(user).values([
		{ id: 'user-1', name: 'One', email: 'one@example.test', emailVerified: true },
		{ id: 'user-2', name: 'Two', email: 'two@example.test', emailVerified: true }
	]);
}

function fixturePlace(id: number, name: string, dataClass: 'real' | 'synthetic' = 'synthetic') {
	return normalizeOsmPlace({
		provider: 'openstreetmap',
		elementType: 'node',
		elementId: id,
		category: 'restaurant',
		dataClass,
		sourceVersion: 1,
		sourceTimestamp: now,
		tags: { amenity: 'restaurant', name, 'addr:city': 'Torino' },
		latitude: 45.07 + id / 10_000,
		longitude: 7.68 + id / 10_000
	});
}

async function seedCatalogue(
	dataClass: 'real' | 'synthetic',
	items = [fixturePlace(1, 'Èlite')],
	boundaries: readonly NormalizedLocalityBoundary[] = []
) {
	const catalogue = new CatalogueRepository(db);
	const importId = `import-${dataClass}-${items[0]?.elementId ?? 'empty'}`;
	await catalogue.startImport({
		id: importId,
		category: 'restaurant',
		dataClass,
		sourceUri: `fixture://${importId}`,
		sourceChecksum: `checksum-${importId}`,
		normalizerVersion: 'test-v1',
		localityIndexVersion: 'test-v1',
		startedAt: now
	});
	await catalogue.stagePlaces(importId, items, boundaries);
	await catalogue.promote(importId, items, boundaries, { normalized: items.length }, now);
	return catalogue;
}

async function seedParticipation() {
	const participation = new ParticipationRepository(db);
	await participation.defineCohort({
		id: 'cohort-1',
		slug: 'synthetic-test',
		provenance: 'synthetic',
		environment: 'test',
		description: 'Automated database fixtures'
	});
	await participation.assign({
		id: capture.cohortAssignmentId,
		userId: 'user-1',
		cohortId: 'cohort-1',
		effectiveFrom: now
	});
}

beforeEach(async () => {
	await db.execute(
		sql`truncate table "user", "catalogue_import", "place", "participation_cohort" cascade`
	);
	await seedUsers();
});

afterAll(async () => {
	await connection.close();
});

describe('recommendation exposure attribution', () => {
	it('records rendered real exposures and attributes at most one 90-day conversion', async () => {
		await seedCatalogue('synthetic', [fixturePlace(1, 'Supported place')]);
		await seedParticipation();
		const analytics = new ProductAnalyticsService(
			db,
			() => now,
			() => crypto.randomUUID()
		);
		const attribution = new RecommendationAttributionService(db, analytics, () => now);

		expect(
			await attribution.recordRenderedExposures({
				userId: 'user-1',
				category: 'restaurant',
				cohortAssignmentId: capture.cohortAssignmentId,
				provenance: 'internal-testing',
				artifactId: 'artifact-1',
				rankingRevisionId: 'revision-1',
				eligibleUnvisitedPlaceIds: ['osm:node:1', 'osm:node:1']
			})
		).toBe(1);
		expect(
			await attribution.attributeVisitedConversion({
				userId: 'user-1',
				category: 'restaurant',
				placeId: 'osm:node:1',
				cohortAssignmentId: capture.cohortAssignmentId,
				provenance: 'internal-testing'
			})
		).toBe(true);
		expect(
			await attribution.attributeVisitedConversion({
				userId: 'user-1',
				category: 'restaurant',
				placeId: 'osm:node:1',
				cohortAssignmentId: capture.cohortAssignmentId,
				provenance: 'internal-testing'
			})
		).toBe(false);
		expect(await db.select().from(recommendationAttribution)).toHaveLength(1);
		expect(
			(await db.select().from(productAnalyticsEvent)).map((event) => event.name).sort()
		).toEqual(['recommendation-converted', 'recommendation-exposed']);
	});

	it('does not record synthetic exposures or conversions', async () => {
		await seedCatalogue('synthetic', [fixturePlace(1, 'Synthetic place')]);
		await seedParticipation();
		const attribution = new RecommendationAttributionService(
			db,
			new ProductAnalyticsService(db, () => now),
			() => now
		);

		expect(
			await attribution.recordRenderedExposures({
				userId: 'user-1',
				category: 'restaurant',
				cohortAssignmentId: capture.cohortAssignmentId,
				provenance: 'synthetic',
				artifactId: 'synthetic-artifact',
				eligibleUnvisitedPlaceIds: ['osm:node:1']
			})
		).toBe(0);
		expect(await db.select().from(recommendationAttribution)).toHaveLength(0);
	});
});

describe('catalogue persistence and local search', () => {
	it('reuses only imports with the same source and processing versions', async () => {
		const catalogue = new CatalogueRepository(db);
		const base = {
			category: 'restaurant' as const,
			dataClass: 'real' as const,
			sourceUri: 'fixture://versioned-import',
			sourceChecksum: 'same-source-checksum',
			localityIndexVersion: 'locality-v1',
			startedAt: now
		};
		const first = await catalogue.startImport({
			...base,
			id: 'versioned-import-v1',
			normalizerVersion: 'normalizer-v1'
		});
		const repeated = await catalogue.startImport({
			...base,
			id: 'versioned-import-v1-repeat',
			normalizerVersion: 'normalizer-v1'
		});
		const upgraded = await catalogue.startImport({
			...base,
			id: 'versioned-import-v2',
			normalizerVersion: 'normalizer-v2'
		});

		expect(first.reused).toBe(false);
		expect(repeated).toMatchObject({ reused: true, record: { id: 'versioned-import-v1' } });
		expect(upgraded).toMatchObject({ reused: false, record: { id: 'versioned-import-v2' } });
	});

	it('promotes an effective snapshot atomically and excludes quarantined records from search', async () => {
		const active = fixturePlace(1, 'Ristorante Èlite', 'real');
		const quarantined = normalizeOsmPlace({
			...fixturePlace(2, 'Temporary', 'real'),
			tags: { amenity: 'restaurant' }
		});
		const boundary: NormalizedLocalityBoundary = {
			provider: 'openstreetmap',
			elementType: 'relation',
			elementId: 300,
			adminLevel: 8,
			name: 'Torino',
			countryCode: 'IT',
			sourceVersion: 1,
			sourceTimestamp: now,
			tags: { boundary: 'administrative', admin_level: '8', name: 'Torino' },
			latitude: 45.07,
			longitude: 7.68,
			contentHash: 'boundary-content-hash'
		};
		const catalogue = await seedCatalogue('real', [active, quarantined], [boundary]);

		const results = await catalogue.search({ category: 'restaurant', text: 'elit tori' });
		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({ name: 'Ristorante Èlite', source: { elementId: 1 } });
		const audit = await catalogue.auditLatest('restaurant');
		expect(audit).toMatchObject({ total: 2, active: 1, quarantined: 1 });
		expect((await db.select().from(localityBoundary))[0].sourceSnapshotId).toContain(
			'osm-boundary:relation:300'
		);

		await expect(
			db
				.update(catalogueSourceSnapshot)
				.set({ latitude: 0 })
				.where(eq(catalogueSourceSnapshot.elementId, 1))
		).rejects.toThrow('Failed query');
		const [snapshot] = await db
			.select({ latitude: catalogueSourceSnapshot.latitude })
			.from(catalogueSourceSnapshot)
			.where(eq(catalogueSourceSnapshot.elementId, 1));
		expect(snapshot.latitude).toBe(active.latitude);
	});

	it('keeps synthetic and real promotions isolated', async () => {
		const catalogue = await seedCatalogue('real', [fixturePlace(1, 'Real', 'real')]);
		await seedCatalogue('synthetic', [fixturePlace(2, 'Synthetic')]);
		const results = await catalogue.search({ category: 'restaurant', text: '' });
		expect(results.map((item) => item.name)).toEqual(['Real']);
		expect(
			(await catalogue.search({ category: 'restaurant', dataClass: 'synthetic', text: '' })).map(
				(item) => item.name
			)
		).toEqual(['Synthetic']);
	});
});

describe('ranking, comments, provenance, and policy-enforced evidence', () => {
	it('creates the list with its first place atomically and cascades a pre-ranking removal', async () => {
		await seedCatalogue('synthetic', [fixturePlace(1, 'One')]);
		await seedParticipation();
		const rankings = new RankingRepository(db);
		const selected = await rankings.createListWithFirstPlace({
			id: 'list-atomic',
			ownerId: 'user-1',
			category: 'restaurant',
			placeId: 'osm:node:1',
			capture,
			now
		});
		expect(selected.added).toBe(true);
		expect((await rankings.listVisitedPlaces('user-1', 'restaurant'))[0]).toMatchObject({
			placeId: 'osm:node:1',
			name: 'One'
		});

		const comments = new PersonalCommentService(new PersonalCommentRepository(db), () => now);
		await comments.save('user-1', 'osm:node:1', 'Only the owner sees this');
		expect(await rankings.removeUnrankedVisitedPlace('user-1', 'restaurant', 'osm:node:1')).toBe(
			true
		);
		expect(await comments.get('user-1', 'osm:node:1')).toBeUndefined();
		expect(await db.select().from(rankingList)).toEqual([]);
	});

	it('stores only allowlisted coarse Phase 4 analytics metadata', async () => {
		await seedParticipation();
		const analytics = new ProductAnalyticsService(
			db,
			() => now,
			() => 'event-1'
		);
		await analytics.record({
			userId: 'user-1',
			cohortAssignmentId: capture.cohortAssignmentId,
			name: 'catalogue-search',
			category: 'restaurant',
			metadata: { resultCount: 4, localityFiltered: true, searchText: 'forbidden' }
		});
		const [event] = await db.select().from(productAnalyticsEvent);
		expect(event.metadata).toEqual({ resultCount: 4, localityFiltered: true });
	});

	it('persists and reconstructs an immutable current revision without comment coupling', async () => {
		await seedCatalogue('synthetic', [fixturePlace(1, 'One'), fixturePlace(2, 'Two')]);
		await seedParticipation();
		const rankings = new RankingRepository(db);
		await rankings.getOrCreateList({
			id: 'list-1',
			ownerId: 'user-1',
			category: 'restaurant',
			now
		});
		for (const placeId of ['osm:node:1', 'osm:node:2']) {
			await rankings.addVisitedPlace({
				ownerId: 'user-1',
				listId: 'list-1',
				placeId,
				capture,
				now
			});
		}
		const session = RankingSession.initial({
			id: 'session-1',
			listId: 'list-1',
			placeIds: ['osm:node:1', 'osm:node:2']
		});
		session.submit('left');
		await rankings.saveSession('user-1', session, capture, now);
		const revision = createRankingRevision({
			id: 'revision-1',
			listId: 'list-1',
			category: 'restaurant',
			revision: 1,
			activePlaceIds: ['osm:node:1', 'osm:node:2'],
			evidence: session.evidence,
			provenance: 'synthetic',
			publishedAt: now.toISOString()
		});
		await rankings.publishRevision('user-1', revision, capture);
		expect(await rankings.loadCurrentRevision('user-1', 'list-1')).toEqual(revision);
		expect(await rankings.findCompletedSessionForRevision('user-1', 'list-1', revision.id)).toEqual(
			{ id: 'session-1' }
		);
		const skippedRevisionNumber = createRankingRevision({
			...revision,
			id: 'revision-3',
			revision: 3,
			evidence: session.evidence
		});
		await expect(
			rankings.publishRevision('user-1', skippedRevisionNumber, capture)
		).rejects.toThrow('monotonically consecutive');

		const evidence = new DatabaseRecommendationEvidenceSource(db, rankings, 'test');
		const beforeComment = await evidence.read('community-model-training');
		const comments = new PersonalCommentService(new PersonalCommentRepository(db), () => now);
		await comments.save('user-1', 'osm:node:1', 'Private\r\nmemory');
		expect((await comments.get('user-1', 'osm:node:1'))?.body).toBe('Private\nmemory');
		expect(await comments.get('user-2', 'osm:node:1')).toBeUndefined();
		await expect(comments.save('user-2', 'osm:node:1', 'IDOR')).rejects.toThrow('not found');
		expect(await evidence.read('community-model-training')).toEqual(beforeComment);

		await expect(
			db
				.update(rankingRevision)
				.set({ rankingEngineVersion: 'changed' })
				.where(eq(rankingRevision.id, revision.id))
		).rejects.toThrow('Failed query');
		const [unchangedRevision] = await db
			.select({ version: rankingRevision.rankingEngineVersion })
			.from(rankingRevision)
			.where(eq(rankingRevision.id, revision.id));
		expect(unchangedRevision.version).toBe(revision.rankingEngineVersion);

		const restrictions = new ProcessingRestrictionRepository(db);
		await restrictions.restrict({
			id: 'restriction-1',
			userId: 'user-1',
			category: 'restaurant',
			purpose: 'community-model-training',
			reason: 'test restriction',
			restrictedAt: now
		});
		const restricted = await evidence.read('community-model-training');
		expect(restricted.observations).toEqual([]);
		expect(restricted.decisions[0]).toMatchObject({
			decision: 'exclude',
			reason: 'processing-restricted',
			policyVersion: 'contribution-mandatory-v1'
		});

		expect(await rankings.deleteCategory('user-1', 'restaurant')).toBe(true);
		const remainingComments = await db.select().from(personalPlaceComment);
		expect(remainingComments).toEqual([]);
	});

	it('preserves unique revision ordering across successive persisted insertion sessions', async () => {
		await seedCatalogue('synthetic', [
			fixturePlace(1, 'One'),
			fixturePlace(2, 'Two'),
			fixturePlace(3, 'Three'),
			fixturePlace(4, 'Four')
		]);
		await seedParticipation();
		const rankings = new RankingRepository(db);
		await rankings.getOrCreateList({
			id: 'list-1',
			ownerId: 'user-1',
			category: 'restaurant',
			now
		});
		for (const placeId of ['osm:node:1', 'osm:node:2']) {
			await rankings.addVisitedPlace({
				ownerId: 'user-1',
				listId: 'list-1',
				placeId,
				capture,
				now
			});
		}

		const initialSession = RankingSession.initial({
			id: 'session-initial',
			listId: 'list-1',
			placeIds: ['osm:node:1', 'osm:node:2']
		});
		initialSession.submit('left');
		await rankings.saveSession('user-1', initialSession, capture, now);
		const initialRevision = createRankingRevision({
			id: 'revision-1',
			listId: 'list-1',
			category: 'restaurant',
			revision: 1,
			activePlaceIds: initialSession.placeIdsSnapshot,
			evidence: initialSession.evidence,
			provenance: 'synthetic',
			publishedAt: now.toISOString()
		});
		await rankings.publishRevision('user-1', initialRevision, capture);

		for (const [index, placeId] of ['osm:node:3', 'osm:node:4'].entries()) {
			await rankings.addVisitedPlace({
				ownerId: 'user-1',
				listId: 'list-1',
				placeId,
				capture,
				now
			});
			const base = await rankings.loadCurrentRevision('user-1', 'list-1');
			if (!base) throw new Error('Expected a persisted base revision');
			const session = RankingSession.insertion({
				id: `session-insertion-${index + 1}`,
				listId: 'list-1',
				baseRevision: base,
				newPlaceId: placeId
			});
			while (session.nextComparison()) session.submit('left');
			await rankings.saveSession('user-1', session, capture, now);
			const revision = createRankingRevision({
				id: `revision-${index + 2}`,
				listId: 'list-1',
				category: 'restaurant',
				revision: index + 2,
				activePlaceIds: session.placeIdsSnapshot,
				evidence: session.evidenceForNextRevision(base),
				provenance: 'synthetic',
				publishedAt: new Date(now.getTime() + index + 1).toISOString()
			});
			await rankings.publishRevision('user-1', revision, capture);
			const reloaded = await rankings.loadCurrentRevision('user-1', 'list-1');
			expect(reloaded).toEqual(revision);
			const sequences = [
				...(reloaded?.activeEvidence.map((item) => item.sequence) ?? []),
				...(reloaded?.excludedEvidence.map((item) => item.evidence.sequence) ?? [])
			];
			expect(new Set(sequences).size).toBe(sequences.length);
		}

		const links = await db
			.select({ sequence: rankingRevisionEvidence.revisionSequence })
			.from(rankingRevisionEvidence)
			.where(eq(rankingRevisionEvidence.revisionId, 'revision-3'));
		expect(new Set(links.map((item) => item.sequence)).size).toBe(links.length);
	});

	it('enforces the database comment limit even when the service boundary is bypassed', async () => {
		await seedCatalogue('synthetic', [fixturePlace(1, 'One')]);
		await seedParticipation();
		const rankings = new RankingRepository(db);
		await rankings.getOrCreateList({
			id: 'list-1',
			ownerId: 'user-1',
			category: 'restaurant',
			now
		});
		await rankings.addVisitedPlace({
			ownerId: 'user-1',
			listId: 'list-1',
			placeId: 'osm:node:1',
			capture,
			now
		});
		await expect(
			db.insert(personalPlaceComment).values({
				ownerId: 'user-1',
				placeId: 'osm:node:1',
				listId: 'list-1',
				body: 'x'.repeat(2_001),
				createdAt: now,
				updatedAt: now
			})
		).rejects.toThrow();
	});

	it('supersedes a competing open session for the same list revision', async () => {
		await seedCatalogue('synthetic', [fixturePlace(1, 'One'), fixturePlace(2, 'Two')]);
		await seedParticipation();
		const rankings = new RankingRepository(db);
		await rankings.getOrCreateList({
			id: 'list-1',
			ownerId: 'user-1',
			category: 'restaurant',
			now
		});
		for (const placeId of ['osm:node:1', 'osm:node:2']) {
			await rankings.addVisitedPlace({
				ownerId: 'user-1',
				listId: 'list-1',
				placeId,
				capture,
				now
			});
		}
		const first = RankingSession.initial({
			id: 'session-first',
			listId: 'list-1',
			placeIds: ['osm:node:1', 'osm:node:2']
		});
		const second = RankingSession.initial({
			id: 'session-second',
			listId: 'list-1',
			placeIds: ['osm:node:1', 'osm:node:2']
		});
		await rankings.saveSession('user-1', first, capture, now);
		await rankings.saveSession('user-1', second, capture, new Date(now.getTime() + 1));

		const lifecycles = await db
			.select({ id: rankingSession.id, lifecycle: rankingSession.lifecycle })
			.from(rankingSession);
		expect(lifecycles.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
			{ id: 'session-first', lifecycle: 'superseded' },
			{ id: 'session-second', lifecycle: 'open' }
		]);
		expect((await rankings.loadSession('user-1', 'session-first')).lifecycle).toBe('superseded');
	});

	it('serializes duplicate comparison writes and stale undo commands', async () => {
		await seedCatalogue('synthetic', [fixturePlace(1, 'One'), fixturePlace(2, 'Two')]);
		await seedParticipation();
		const rankings = new RankingRepository(db);
		await rankings.getOrCreateList({
			id: 'list-concurrent',
			ownerId: 'user-1',
			category: 'restaurant',
			now
		});
		for (const placeId of ['osm:node:1', 'osm:node:2']) {
			await rankings.addVisitedPlace({
				ownerId: 'user-1',
				listId: 'list-concurrent',
				placeId,
				capture,
				now
			});
		}
		const session = RankingSession.initial({
			id: 'session-concurrent',
			listId: 'list-concurrent',
			placeIds: ['osm:node:1', 'osm:node:2']
		});
		await rankings.saveSession('user-1', session, capture, now);
		const comparisonId = session.nextComparison()!.id;
		const results = await Promise.all([
			rankings.submitSessionOutcome({
				ownerId: 'user-1',
				sessionId: session.id,
				expectedComparisonId: comparisonId,
				outcome: 'tie',
				capture,
				now
			}),
			rankings.submitSessionOutcome({
				ownerId: 'user-1',
				sessionId: session.id,
				expectedComparisonId: comparisonId,
				outcome: 'tie',
				capture,
				now
			})
		]);
		expect(results.map((result) => result.captured).sort()).toEqual([false, true]);
		expect(await db.select().from(comparisonEvidence)).toHaveLength(1);
		await expect(
			rankings.submitSessionOutcome({
				ownerId: 'user-1',
				sessionId: session.id,
				expectedComparisonId: comparisonId,
				outcome: 'skip',
				capture,
				now
			})
		).rejects.toThrow('already answered differently');

		const firstUndo = await rankings.undoSessionOutcome({
			ownerId: 'user-1',
			sessionId: session.id,
			expectedEvidenceId: comparisonId,
			capture,
			now
		});
		const duplicateUndo = await rankings.undoSessionOutcome({
			ownerId: 'user-1',
			sessionId: session.id,
			expectedEvidenceId: comparisonId,
			capture,
			now
		});
		expect(firstUndo.undone).toBe(true);
		expect(duplicateUndo.undone).toBe(false);
		expect((await db.select().from(comparisonEvidence))[0].active).toBe(0);
		expect(
			(
				await rankings.loadSession(
					'user-1',
					session.id,
					new Date(now.getTime() + 31 * 24 * 60 * 60 * 1_000)
				)
			).lifecycle
		).toBe('superseded');
	});

	it('deletes personal comments with their owning account', async () => {
		await seedCatalogue('synthetic', [fixturePlace(1, 'One')]);
		await seedParticipation();
		const rankings = new RankingRepository(db);
		await rankings.getOrCreateList({
			id: 'list-1',
			ownerId: 'user-1',
			category: 'restaurant',
			now
		});
		await rankings.addVisitedPlace({
			ownerId: 'user-1',
			listId: 'list-1',
			placeId: 'osm:node:1',
			capture,
			now
		});
		await new PersonalCommentService(new PersonalCommentRepository(db), () => now).save(
			'user-1',
			'osm:node:1',
			'Private'
		);

		await db.delete(user).where(eq(user.id, 'user-1'));
		expect(await db.select().from(personalPlaceComment)).toEqual([]);
	});
});
