import { describe, expect, it, vi } from 'vitest';
import type { ComparisonEvidence } from '$lib/domain/ranking/contracts';
import { createRankingRevision } from '$lib/domain/ranking/revision';
import { RankingSession } from '$lib/domain/ranking/session';
import type { ParticipationRepository } from '$lib/server/repositories/participation';
import type { RankingRepository } from '$lib/server/repositories/rankings';
import { RankingService } from './rankings';

const now = new Date('2026-08-25T10:00:00.000Z');
const oldEvidence: ComparisonEvidence = {
	id: 'old-comparison',
	logicalPair: ['a', 'b'],
	sequence: 1,
	leftPlaceId: 'a',
	rightPlaceId: 'b',
	outcome: 'left',
	reason: 'initial-order',
	active: true
};
const baseRevision = createRankingRevision({
	id: 'revision-1',
	listId: 'list-1',
	category: 'restaurant',
	revision: 1,
	activePlaceIds: ['a', 'b'],
	evidence: [oldEvidence],
	provenance: 'internal-testing',
	publishedAt: '2026-08-24T10:00:00.000Z'
});

function participation() {
	return {
		effectiveAssignment: vi.fn().mockResolvedValue({
			assignment: { id: 'assignment-1' },
			cohort: { environment: 'development', provenance: 'internal-testing' }
		})
	} as unknown as ParticipationRepository;
}

describe('ranking service rebuild sessions', () => {
	it('starts the smallest useful insertion instead of rebuilding a stable ranking', async () => {
		const repository = {
			findOpenSession: vi.fn().mockResolvedValue(undefined),
			listVisitedPlaceIds: vi.fn().mockResolvedValue(['a', 'b', 'c']),
			loadCurrentRevision: vi.fn().mockResolvedValue(baseRevision),
			saveSession: vi.fn().mockResolvedValue(undefined)
		};
		const service = new RankingService(
			repository as unknown as RankingRepository,
			participation(),
			'development',
			() => now,
			() => 'insertion-session'
		);

		const session = await service.startUsefulSession('user-1', 'list-1');

		expect(session.summary()).toMatchObject({
			id: 'insertion-session',
			purpose: 'insertion',
			baseRevisionId: 'revision-1'
		});
		expect(session.nextComparison()).toEqual(expect.objectContaining({ rightPlaceId: 'c' }));
		expect(repository.saveSession).toHaveBeenCalledOnce();
	});

	it('resumes existing ranking work before creating another operation', async () => {
		const open = RankingSession.insertion({
			id: 'open-session',
			listId: 'list-1',
			baseRevision,
			newPlaceId: 'c'
		});
		const repository = {
			findOpenSession: vi.fn().mockResolvedValue(open),
			listVisitedPlaceIds: vi.fn(),
			loadCurrentRevision: vi.fn()
		};
		const service = new RankingService(
			repository as unknown as RankingRepository,
			participation(),
			'development'
		);

		expect(await service.startUsefulSession('user-1', 'list-1')).toBe(open);
		expect(repository.listVisitedPlaceIds).not.toHaveBeenCalled();
	});

	it('starts another insertion while visited places remain unplaced', async () => {
		const repository = {
			findOpenSession: vi.fn().mockResolvedValue(undefined),
			listVisitedPlaceIds: vi.fn().mockResolvedValue(['a', 'b', 'c', 'd']),
			loadCurrentRevision: vi.fn().mockResolvedValue(
				createRankingRevision({
					id: 'revision-2',
					listId: 'list-1',
					category: 'restaurant',
					revision: 2,
					activePlaceIds: ['a', 'b', 'c'],
					evidence: [
						oldEvidence,
						{
							id: 'comparison-b-c',
							logicalPair: ['b', 'c'],
							sequence: 2,
							leftPlaceId: 'b',
							rightPlaceId: 'c',
							outcome: 'left',
							reason: 'initial-order',
							active: true
						}
					],
					provenance: 'internal-testing',
					publishedAt: '2026-08-25T09:00:00.000Z'
				})
			),
			saveSession: vi.fn().mockResolvedValue(undefined)
		};
		const service = new RankingService(
			repository as unknown as RankingRepository,
			participation(),
			'development',
			() => now,
			() => 'next-insertion-session'
		);

		const session = await service.startNextUnplacedSession('user-1', 'list-1');

		expect(session?.summary()).toMatchObject({
			id: 'next-insertion-session',
			purpose: 'insertion',
			lifecycle: 'open'
		});
		expect(session?.nextComparison()).toEqual(expect.objectContaining({ rightPlaceId: 'd' }));
	});

	it('does not start another session once every visited place is ranked', async () => {
		const repository = {
			findOpenSession: vi.fn().mockResolvedValue(undefined),
			listVisitedPlaceIds: vi.fn().mockResolvedValue(['a', 'b']),
			loadCurrentRevision: vi.fn().mockResolvedValue(baseRevision)
		};
		const service = new RankingService(
			repository as unknown as RankingRepository,
			participation(),
			'development'
		);

		expect(await service.startNextUnplacedSession('user-1', 'list-1')).toBeUndefined();
	});

	it('captures the current revision when starting a full-list re-sort', async () => {
		const repository = {
			findOpenSession: vi.fn().mockResolvedValue(undefined),
			listVisitedPlaceIds: vi.fn().mockResolvedValue(['a', 'b']),
			loadCurrentRevision: vi.fn().mockResolvedValue(baseRevision),
			saveSession: vi.fn().mockResolvedValue(undefined)
		};
		const service = new RankingService(
			repository as unknown as RankingRepository,
			participation(),
			'development',
			() => now,
			() => 'rebuild-session'
		);

		const session = await service.startInitialSession('user-1', 'list-1');

		expect(session.summary()).toMatchObject({
			id: 'rebuild-session',
			baseRevisionId: 'revision-1',
			purpose: 'rebuild',
			lifecycle: 'open'
		});
		expect(repository.saveSession).toHaveBeenCalledOnce();
	});

	it('publishes an affected legacy session when its place snapshot is still current', async () => {
		const session = RankingSession.initial({
			id: 'legacy-session',
			listId: 'list-1',
			placeIds: ['a', 'b']
		});
		const comparison = session.nextComparison();
		if (!comparison) throw new Error('Expected a comparison');
		session.submit('tie');
		const repository = {
			loadSession: vi.fn().mockResolvedValue(session),
			loadCurrentRevision: vi.fn().mockResolvedValue(baseRevision),
			listVisitedPlaceIds: vi.fn().mockResolvedValue(['a', 'b']),
			publishRevision: vi.fn().mockImplementation(async (_ownerId, revision) => revision)
		};
		const service = new RankingService(
			repository as unknown as RankingRepository,
			participation(),
			'development',
			() => now,
			() => 'revision-2'
		);

		const published = await service.publishCompletedSession(
			'user-1',
			'legacy-session',
			'restaurant'
		);

		expect(published.id).toBe('revision-2');
		expect(published.revision).toBe(2);
		expect(published.activeEvidence.map((item) => item.id)).toEqual(
			session.evidence.map((item) => item.id)
		);
		expect(published.activeEvidence).not.toContainEqual(oldEvidence);
	});

	it('publishes an adjacent whole-tier equality assertion as one comparison', async () => {
		let savedSession: RankingSession | undefined;
		let id = 0;
		const repository = {
			findOpenSession: vi.fn().mockResolvedValue(undefined),
			loadCurrentRevision: vi.fn().mockResolvedValue(baseRevision),
			saveSession: vi.fn().mockImplementation(async (_ownerId, session) => {
				savedSession = session;
			}),
			loadSession: vi.fn().mockImplementation(async () => savedSession),
			publishRevision: vi.fn().mockImplementation(async (_ownerId, revision) => revision)
		};
		const service = new RankingService(
			repository as unknown as RankingRepository,
			participation(),
			'development',
			() => now,
			() => `generated-${++id}`
		);

		const published = await service.adjustAdjacentPlace(
			'user-1',
			'list-1',
			'b',
			'up',
			'revision-1'
		);

		expect(savedSession?.summary()).toMatchObject({
			purpose: 'adjustment',
			lifecycle: 'completed'
		});
		expect(savedSession?.evidence).toHaveLength(1);
		expect(published.orderedTiers).toEqual([{ placeIds: ['a', 'b'] }]);
		expect(published.activeEvidence).toEqual([
			expect.objectContaining({ outcome: 'tie', reason: 'adjacent-adjustment' })
		]);
	});

	it('starts a dedicated reposition session only from a total current ranking', async () => {
		const repository = {
			findOpenSession: vi.fn().mockResolvedValue(undefined),
			loadCurrentRevision: vi.fn().mockResolvedValue(baseRevision),
			saveSession: vi.fn().mockResolvedValue(undefined)
		};
		const service = new RankingService(
			repository as unknown as RankingRepository,
			participation(),
			'development',
			() => now,
			() => 'reposition-session'
		);

		const session = await service.startRepositionSession('user-1', 'list-1', 'b');

		expect(session.summary()).toMatchObject({
			id: 'reposition-session',
			purpose: 'reposition',
			baseRevisionId: 'revision-1',
			lifecycle: 'open'
		});
		expect(session.nextComparison()?.logicalPair).toEqual(['a', 'b']);
	});
});
