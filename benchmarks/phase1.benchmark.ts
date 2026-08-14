import { describe, expect, it } from 'vitest';
import { runCategoryBenchmark } from '../src/lib/domain/recommendations/evaluation';
import type { GeneralizedPlackettLuceOptions } from '../src/lib/domain/recommendations/models';
import { RankingSession } from '../src/lib/domain/ranking/session';
import { createRankingRevision } from '../src/lib/domain/ranking/revision';
import type { ComparisonEvidence, ComparisonOutcome } from '../src/lib/domain/ranking/contracts';

const commonGrid: readonly GeneralizedPlackettLuceOptions[] = [
	{
		dimensions: 2,
		epochs: 35,
		learningRate: 0.01,
		regularization: 0.01,
		seed: 101,
		tiePropensity: 0.5,
		maxTieSize: 2
	},
	{
		dimensions: 3,
		epochs: 35,
		learningRate: 0.01,
		regularization: 0.03,
		seed: 101,
		tiePropensity: 0.75,
		maxTieSize: 2
	},
	{
		dimensions: 3,
		epochs: 45,
		learningRate: 0.008,
		regularization: 0.05,
		seed: 101,
		tiePropensity: 1,
		maxTieSize: 2
	}
];

function measureInitial(size: number, order: 'ordered' | 'reverse' | 'tied') {
	const placeIds = Array.from(
		{ length: size },
		(_, index) => `p${index.toString().padStart(3, '0')}`
	);
	if (order === 'reverse') placeIds.reverse();
	const session = RankingSession.initial({ id: `${order}-${size}`, listId: 'list', placeIds });
	while (session.nextComparison()) {
		const request = session.nextComparison();
		if (!request) break;
		const left = Number(request.leftPlaceId.slice(1));
		const right = Number(request.rightPlaceId.slice(1));
		const outcome: ComparisonOutcome =
			order === 'tied' && Math.floor(left / 2) === Math.floor(right / 2)
				? 'tie'
				: left < right
					? 'left'
					: 'right';
		session.submit(outcome);
	}
	return session.evidence.length;
}

function measureInsertion(size: number) {
	const placeIds = Array.from(
		{ length: size },
		(_, index) => `p${index.toString().padStart(3, '0')}`
	);
	const evidence: ComparisonEvidence[] = placeIds.slice(0, -1).map((placeId, index) => ({
		id: `e-${index}`,
		logicalPair: [placeId, placeIds[index + 1]].sort() as [string, string],
		sequence: index + 1,
		leftPlaceId: placeId,
		rightPlaceId: placeIds[index + 1],
		outcome: 'left',
		reason: 'initial-order',
		active: true
	}));
	const baseRevision = createRankingRevision({
		id: `revision-${size}`,
		listId: 'list',
		category: 'restaurant',
		revision: 1,
		activePlaceIds: placeIds,
		evidence,
		provenance: 'synthetic',
		publishedAt: '2026-08-14T00:00:00.000Z'
	});
	const target = Math.floor(size / 2) - 0.5;
	const session = RankingSession.insertion({
		id: `insertion-${size}`,
		listId: 'list',
		baseRevision,
		newPlaceId: 'new'
	});
	while (session.nextComparison()) {
		const request = session.nextComparison();
		if (!request) break;
		const other = Number(request.rightPlaceId.slice(1));
		session.submit(target < other ? 'left' : 'right');
	}
	return session.evidence.length;
}

describe('Phase 1 deterministic recommendation benchmark', () => {
	it('compares independently tuned restaurant and hotel models', () => {
		const restaurant = runCategoryBenchmark(
			{
				category: 'restaurant',
				seed: 20260814,
				userCount: 48,
				placeCount: 32,
				minimumVisited: 4,
				maximumVisited: 16,
				factorDimensions: 3,
				tieThreshold: 0.12,
				noise: 0.15
			},
			commonGrid.map((options, index) => ({ ...options, seed: options.seed + index }))
		);
		const hotel = runCategoryBenchmark(
			{
				category: 'hotel',
				seed: 20260815,
				userCount: 40,
				placeCount: 28,
				minimumVisited: 4,
				maximumVisited: 14,
				factorDimensions: 2,
				tieThreshold: 0.15,
				noise: 0.18
			},
			commonGrid.map((options, index) => ({
				...options,
				dimensions: Math.min(options.dimensions, 2),
				seed: options.seed + 100 + index
			}))
		);

		expect(restaurant.models.map((model) => model.family)).toEqual([
			'generalized-plackett-luce',
			'bradley-terry',
			'nearest-neighbor',
			'global-prior',
			'random'
		]);
		expect(hotel.models).toHaveLength(5);
		expect(restaurant.holdoutStrategy).toBe('whole-tier-groups-before-observation-derivation');
		expect(hotel.holdoutStrategy).toBe('whole-tier-groups-before-observation-derivation');
		const ranking = {
			initial: [2, 3, 10, 25, 64].map((size) => ({
				size,
				ordered: measureInitial(size, 'ordered'),
				reverse: measureInitial(size, 'reverse'),
				tied: measureInitial(size, 'tied')
			})),
			insertion: [10, 25, 128].map((size) => ({ size, questions: measureInsertion(size) }))
		};
		expect(ranking.insertion.at(-1)?.questions).toBeLessThanOrEqual(8);
		console.log(`PHASE1_BENCHMARK=${JSON.stringify({ ranking, restaurant, hotel })}`);
	});
});
