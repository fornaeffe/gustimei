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
});
