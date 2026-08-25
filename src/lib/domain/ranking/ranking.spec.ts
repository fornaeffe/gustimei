import { describe, expect, it } from 'vitest';
import type { ComparisonEvidence, ComparisonOutcome, RankingRevision } from './contracts';
import { createRankingRevision, deriveRankingProjection } from './revision';
import { RankingSession } from './session';

const publishedAt = '2026-08-14T00:00:00.000Z';

function revision(
	placeIds: readonly string[],
	evidence: readonly ComparisonEvidence[],
	overrides: Partial<Pick<RankingRevision, 'id' | 'revision' | 'category'>> = {}
) {
	return createRankingRevision({
		id: overrides.id ?? 'revision-1',
		listId: 'list-1',
		category: overrides.category ?? 'restaurant',
		revision: overrides.revision ?? 1,
		activePlaceIds: placeIds,
		evidence,
		provenance: 'synthetic',
		publishedAt
	});
}

function evidence(
	id: string,
	sequence: number,
	leftPlaceId: string,
	rightPlaceId: string,
	outcome: ComparisonOutcome
): ComparisonEvidence {
	return {
		id,
		logicalPair: [leftPlaceId, rightPlaceId].sort() as [string, string],
		sequence,
		leftPlaceId,
		rightPlaceId,
		outcome,
		reason: 'initial-order',
		active: true
	};
}

function numericPreference(left: string, right: string): ComparisonOutcome {
	const leftValue = Number(left.slice(1));
	const rightValue = Number(right.slice(1));
	return leftValue < rightValue ? 'left' : 'right';
}

function preferPlace(
	request: NonNullable<ReturnType<RankingSession['nextComparison']>>,
	placeId: string
): ComparisonOutcome {
	return request.leftPlaceId === placeId ? 'left' : 'right';
}

function complete(
	placeIds: readonly string[],
	preference: (left: string, right: string) => ComparisonOutcome = numericPreference
) {
	const session = RankingSession.initial({
		id: `session-${placeIds.length}`,
		listId: 'list-1',
		placeIds
	});
	while (session.nextComparison()) {
		const request = session.nextComparison();
		if (!request) break;
		session.submit(preference(request.leftPlaceId, request.rightPlaceId));
	}
	return session;
}

function permutations(items: readonly string[]): string[][] {
	if (items.length <= 1) return [[...items]];
	return items.flatMap((item, index) =>
		permutations(items.filter((_candidate, candidateIndex) => candidateIndex !== index)).map(
			(rest) => [item, ...rest]
		)
	);
}

describe('tier-aware stable merge ranking session', () => {
	it('varies left/right presentation without changing the recorded preference', () => {
		const presentedLeft = new Set<string>();
		for (let index = 0; index < 20; index += 1) {
			const session = RankingSession.initial({
				id: `presentation-${index}`,
				listId: 'list-1',
				placeIds: ['a', 'b']
			});
			const request = session.nextComparison();
			if (!request) throw new Error('Expected a comparison');
			presentedLeft.add(request.leftPlaceId);
			session.submit(preferPlace(request, 'a'));
			expect(revision(['a', 'b'], session.evidence).orderedTiers).toEqual([
				{ placeIds: ['a'] },
				{ placeIds: ['b'] }
			]);
		}
		expect(presentedLeft).toEqual(new Set(['a', 'b']));
	});

	it('orders every permutation of two through five places', () => {
		for (let size = 2; size <= 5; size += 1) {
			const expected = Array.from({ length: size }, (_, index) => `p${index}`);
			for (const input of permutations(expected)) {
				const result = revision(input, complete(input).evidence);
				expect(result.orderedTiers.flatMap((tier) => tier.placeIds)).toEqual(expected);
				expect(result.unresolvedRelations).toEqual([]);
			}
		}
	});

	for (const size of [2, 3, 10, 25, 64]) {
		it(`produces a reproducible total order for ${size} items`, () => {
			const placeIds = Array.from({ length: size }, (_, index) => `p${size - index - 1}`);
			const session = complete(placeIds);
			const result = revision(placeIds, session.evidence);

			expect(session.lifecycle).toBe('completed');
			expect(result.unresolvedRelations).toEqual([]);
			expect(result.orderedTiers.map((tier) => tier.placeIds[0])).toEqual(
				Array.from({ length: size }, (_, index) => `p${index}`)
			);
			expect(deriveRankingProjection(result).orderCoverage).toBe('total');
			expect(session.evidence.length).toBeLessThanOrEqual(size * Math.ceil(Math.log2(size)));
		});
	}

	it('handles already ordered and balanced inputs without changing the preference order', () => {
		const ordered = Array.from({ length: 10 }, (_, index) => `p${index}`);
		const balanced = ['p5', 'p2', 'p8', 'p1', 'p4', 'p7', 'p9', 'p0', 'p3', 'p6'];

		for (const input of [ordered, balanced]) {
			const result = revision(input, complete(input).evidence);
			expect(result.orderedTiers.flatMap((tier) => tier.placeIds)).toEqual(ordered);
		}
	});

	it('forms explicit equivalence tiers', () => {
		const placeIds = Array.from({ length: 10 }, (_, index) => `p${9 - index}`);
		const session = complete(placeIds, (left, right) => {
			const leftTier = Math.floor(Number(left.slice(1)) / 2);
			const rightTier = Math.floor(Number(right.slice(1)) / 2);
			return leftTier === rightTier ? 'tie' : leftTier < rightTier ? 'left' : 'right';
		});
		const result = revision(placeIds, session.evidence);

		expect(result.orderedTiers.map((tier) => tier.placeIds)).toEqual([
			['p0', 'p1'],
			['p2', 'p3'],
			['p4', 'p5'],
			['p6', 'p7'],
			['p8', 'p9']
		]);
		expect(deriveRankingProjection(result).orderCoverage).toBe('total');
	});

	it('rebuilds from a captured revision without carrying its old ordering evidence forward', () => {
		const base = revision(['a', 'b'], [evidence('old', 1, 'a', 'b', 'left')]);
		const session = RankingSession.rebuild({
			id: 'rebuild',
			listId: 'list-1',
			baseRevision: base,
			placeIds: ['a', 'b']
		});
		const request = session.nextComparison();
		if (!request) throw new Error('Expected a rebuild comparison');
		session.submit(preferPlace(request, 'b'));

		expect(session.summary()).toMatchObject({
			baseRevisionId: base.id,
			purpose: 'rebuild',
			lifecycle: 'completed'
		});
		expect(session.evidenceForNextRevision(base)).toEqual(session.evidence);
		expect(revision(['a', 'b'], session.evidenceForNextRevision(base)).orderedTiers).toEqual([
			{ placeIds: ['b'] },
			{ placeIds: ['a'] }
		]);
	});

	it('preserves a skipped pair as unresolved instead of inventing a strict order', () => {
		let skipped = false;
		const placeIds = ['p2', 'p1', 'p0'];
		const session = complete(placeIds, (left, right) => {
			if (!skipped) {
				skipped = true;
				return 'skip';
			}
			return numericPreference(left, right);
		});
		const result = revision(placeIds, session.evidence);

		expect(result.unresolvedRelations.some((item) => item.reason === 'skipped')).toBe(true);
		expect(deriveRankingProjection(result).orderCoverage).toBe('partial');
	});

	it('supports undo and byte-for-byte resumable session state', () => {
		const session = RankingSession.initial({
			id: 'resumable',
			listId: 'list-1',
			placeIds: ['p2', 'p0', 'p1']
		});
		const first = session.nextComparison();
		expect(first).toBeDefined();
		if (!first) return;
		session.submit(numericPreference(first.leftPlaceId, first.rightPlaceId));
		const serialized = session.serialize();
		const resumed = RankingSession.resume(serialized);

		expect(resumed.serialize()).toBe(serialized);
		expect(resumed.placeIdsSnapshot).toEqual(['p2', 'p0', 'p1']);
		expect(resumed.undo()).toBe(true);
		expect(resumed.evidence.at(-1)?.active).toBe(false);
		expect(resumed.nextComparison()?.leftPlaceId).toBe(first.leftPlaceId);
		const retried = resumed.nextComparison();
		if (retried) resumed.submit(numericPreference(retried.leftPlaceId, retried.rightPlaceId));
		expect(new Set(resumed.evidence.map((item) => item.id)).size).toBe(resumed.evidence.length);
	});

	it('keeps progress bounded and labels it as an estimate', () => {
		const session = RankingSession.initial({
			id: 'progress',
			listId: 'list-1',
			placeIds: ['p3', 'p2', 'p1', 'p0']
		});
		expect(session.progress()).toMatchObject({ answered: 0, fraction: 0, isEstimate: true });
		while (session.nextComparison()) {
			const request = session.nextComparison();
			if (request) session.submit(numericPreference(request.leftPlaceId, request.rightPlaceId));
			expect(session.progress().fraction).toBeGreaterThanOrEqual(0);
			expect(session.progress().fraction).toBeLessThanOrEqual(1);
		}
		expect(session.progress()).toMatchObject({ estimatedRemaining: 0, fraction: 1 });
	});
});

describe('binary tier insertion', () => {
	const baseEvidence = [
		evidence('e1', 1, 'a', 'b', 'tie'),
		evidence('e2', 2, 'a', 'c', 'left'),
		evidence('e3', 3, 'c', 'd', 'left')
	];
	const base = revision(['a', 'b', 'c', 'd'], baseEvidence);

	it('confirms a merge with a second deterministic member of a multi-place tier', () => {
		const session = RankingSession.insertion({
			id: 'insert-tie',
			listId: 'list-1',
			baseRevision: base,
			newPlaceId: 'new'
		});
		while (session.nextComparison()) {
			const request = session.nextComparison();
			if (!request) break;
			const outcome = request.logicalPair.includes('c') ? preferPlace(request, 'new') : 'tie';
			session.submit(outcome);
		}

		expect(session.evidence.filter((item) => item.outcome === 'tie')).toHaveLength(2);
		expect(session.insertionResult()).toEqual({ type: 'tied', tierIndex: 0 });
		expect(session.evidence.at(-1)?.reason).toBe('tie-confirmation');
	});

	it('opens a local repair result after skip or conflicting tie confirmation', () => {
		const skipped = RankingSession.insertion({
			id: 'insert-skip',
			listId: 'list-1',
			baseRevision: base,
			newPlaceId: 'new'
		});
		skipped.submit('skip');
		expect(skipped.insertionResult()?.type).toBe('repair');

		const conflicting = RankingSession.insertion({
			id: 'insert-conflict',
			listId: 'list-1',
			baseRevision: base,
			newPlaceId: 'new'
		});
		const first = conflicting.nextComparison();
		if (!first) throw new Error('Expected an insertion comparison');
		conflicting.submit(preferPlace(first, 'new'));
		conflicting.submit('tie');
		const confirmation = conflicting.nextComparison();
		if (!confirmation) throw new Error('Expected a tie confirmation');
		conflicting.submit(preferPlace(confirmation, 'b'));
		expect(conflicting.insertionResult()?.type).toBe('repair');
	});

	it('uses logarithmic questions for strict insertion with no list-size cap', () => {
		const placeIds = Array.from(
			{ length: 128 },
			(_, index) => `p${index.toString().padStart(3, '0')}`
		);
		const strictBase = revision(placeIds, complete(placeIds).evidence);
		const session = RankingSession.insertion({
			id: 'large-insertion',
			listId: 'list-1',
			baseRevision: strictBase,
			newPlaceId: 'p064.5'
		});
		while (session.nextComparison()) {
			const request = session.nextComparison();
			if (request) session.submit(request.rightPlaceId < 'p064.5' ? 'right' : 'left');
		}
		expect(session.evidence.length).toBeLessThanOrEqual(8);
	});
});

describe('contradiction recovery and projections', () => {
	it('replaces edited evidence explicitly and retains supersession provenance', () => {
		const original = evidence('original', 1, 'a', 'b', 'left');
		const edited = {
			...evidence('edited', 2, 'a', 'b', 'right'),
			supersedesEvidenceId: 'original'
		};
		const result = revision(['a', 'b'], [original, edited]);

		expect(result.activeEvidence).toEqual([edited]);
		expect(result.excludedEvidence).toContainEqual({
			evidence: original,
			reason: 'superseded',
			conflictingEvidenceIds: ['edited']
		});
		expect(result.orderedTiers.flatMap((tier) => tier.placeIds)).toEqual(['b', 'a']);
	});

	it('retains newest answers, excludes the oldest cycle edge, and asks for targeted repair', () => {
		const result = revision(
			['a', 'b', 'c'],
			[
				evidence('oldest', 1, 'a', 'b', 'left'),
				evidence('middle', 2, 'b', 'c', 'left'),
				evidence('newest', 3, 'c', 'a', 'left')
			]
		);
		const projection = deriveRankingProjection(result);

		expect(result.activeEvidence.map((item) => item.id)).toEqual(['middle', 'newest']);
		expect(result.excludedEvidence.map((item) => item.evidence.id)).toEqual(['oldest']);
		expect(projection.repairRequirement).toMatchObject({ reason: 'cycle', scope: 'local' });
		expect(projection.nextAction.type).toBe('repair');
	});

	it('supersedes the conflicting edge through a focused repair session', () => {
		const conflicted = revision(
			['a', 'b', 'c'],
			[
				evidence('oldest', 1, 'a', 'b', 'left'),
				evidence('middle', 2, 'b', 'c', 'left'),
				evidence('newest', 3, 'c', 'a', 'left')
			]
		);
		const repair = RankingSession.repair({
			id: 'repair-session',
			listId: 'list-1',
			baseRevision: conflicted
		});
		expect(repair.nextComparison()?.reason).toBe('contradiction-repair');
		const request = repair.nextComparison();
		if (!request) throw new Error('Expected a repair comparison');
		repair.submit(preferPlace(request, 'b'));
		const repaired = createRankingRevision({
			id: 'revision-2',
			listId: 'list-1',
			category: 'restaurant',
			revision: 2,
			activePlaceIds: ['a', 'b', 'c'],
			evidence: repair.evidenceForNextRevision(conflicted),
			provenance: 'synthetic',
			publishedAt
		});

		expect(repair.evidence[0].supersedesEvidenceId).toBe('oldest');
		expect(deriveRankingProjection(repaired).repairRequirement).toBeUndefined();
		expect(repaired.orderedTiers.flatMap((tier) => tier.placeIds)).toEqual(['b', 'c', 'a']);
	});

	it('does not silently split an explicit tie after later transitive evidence conflicts with it', () => {
		const result = revision(
			['a', 'b', 'c'],
			[
				evidence('explicit-tie', 1, 'a', 'b', 'tie'),
				evidence('b-over-c', 2, 'b', 'c', 'left'),
				evidence('c-over-a', 3, 'c', 'a', 'left')
			]
		);

		expect(result.excludedEvidence[0]).toMatchObject({
			reason: 'tie-conflict',
			evidence: { id: 'explicit-tie' }
		});
		expect(deriveRankingProjection(result).repairRequirement?.reason).toBe('tie-conflict');
	});

	it('prioritizes selection, then an effective open session, before other calls to action', () => {
		const onePlace = revision(['a'], []);
		expect(deriveRankingProjection(onePlace).nextAction).toEqual({
			type: 'select-places',
			minimumAdditionalPlaces: 1
		});

		const partial = revision(['a', 'b'], [evidence('skip', 1, 'a', 'b', 'skip')]);
		const open = RankingSession.initial({ id: 'open', listId: 'list-1', placeIds: ['a', 'b'] });
		expect(deriveRankingProjection(partial, open.summary()).nextAction).toMatchObject({
			type: 'resume-session',
			sessionId: 'open'
		});
	});
});
