import { describe, expect, it } from 'vitest';
import {
	generalizedPlackettLuceChoice,
	trainGeneralizedPlackettLuce,
	type TieredRanking
} from './models';
import { splitWholeTierGroups } from './evaluation';

describe('generalized Plackett–Luce prototype', () => {
	it('matches finite-difference gradients for a tied choice', () => {
		const scores = new Map([
			['a', 0.4],
			['b', 0.1],
			['c', -0.2]
		]);
		const choice = generalizedPlackettLuceChoice(scores, ['a', 'b'], 0.75, 2);
		const epsilon = 1e-6;
		for (const placeId of scores.keys()) {
			const plus = new Map(scores);
			const minus = new Map(scores);
			plus.set(placeId, (plus.get(placeId) ?? 0) + epsilon);
			minus.set(placeId, (minus.get(placeId) ?? 0) - epsilon);
			const numerical =
				(generalizedPlackettLuceChoice(plus, ['a', 'b'], 0.75, 2).logLikelihood -
					generalizedPlackettLuceChoice(minus, ['a', 'b'], 0.75, 2).logLikelihood) /
				(2 * epsilon);
			expect(choice.gradients.get(placeId)).toBeCloseTo(numerical, 5);
		}
	});

	it('trains reproducibly and never shares category state', () => {
		const restaurant: TieredRanking[] = [
			{ userId: 'u1', category: 'restaurant', tiers: [['a'], ['b', 'c']] },
			{ userId: 'u2', category: 'restaurant', tiers: [['b'], ['a'], ['c']] }
		];
		const hotel: TieredRanking[] = [{ userId: 'u1', category: 'hotel', tiers: [['h1'], ['h2']] }];
		const options = {
			dimensions: 2,
			epochs: 4,
			learningRate: 0.01,
			regularization: 0.02,
			seed: 7,
			tiePropensity: 0.75,
			maxTieSize: 2 as const
		};
		const first = trainGeneralizedPlackettLuce(restaurant, options);
		const second = trainGeneralizedPlackettLuce(restaurant, options);
		const hotels = trainGeneralizedPlackettLuce(hotel, options);
		const personalized = first.personalize?.(restaurant[0], 3);

		expect(first.score('u1', 'a')).toBe(second.score('u1', 'a'));
		expect(hotels.score('u1', 'a')).toBe(Number.NEGATIVE_INFINITY);
		expect(first.score('u1', 'h1')).toBe(Number.NEGATIVE_INFINITY);
		expect(personalized?.('a')).toBeTypeOf('number');
	});
});

describe('leakage-safe held-out split', () => {
	it('removes whole tier groups before training observations can be derived', () => {
		const ranking: TieredRanking = {
			userId: 'u1',
			category: 'restaurant',
			tiers: [['a'], ['b', 'c'], ['d'], ['e'], ['f'], ['g']]
		};
		const fold = splitWholeTierGroups([ranking])[0];
		const trainingPlaces = new Set(fold.training.tiers.flatMap((tier) => tier));

		expect(fold.heldOutPlaceIds.length).toBeGreaterThanOrEqual(2);
		for (const placeId of fold.heldOutPlaceIds) expect(trainingPlaces.has(placeId)).toBe(false);
		for (const originalTier of ranking.tiers) {
			const heldMembers = originalTier.filter((placeId) => fold.heldOutPlaceIds.includes(placeId));
			expect(heldMembers.length === 0 || heldMembers.length === originalTier.length).toBe(true);
		}
	});
});
