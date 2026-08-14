import type { RankingCategory } from '../ranking/contracts';
import type { TieredRanking } from './models';

export interface SyntheticDatasetOptions {
	category: RankingCategory;
	seed: number;
	userCount: number;
	placeCount: number;
	minimumVisited: number;
	maximumVisited: number;
	factorDimensions: number;
	tieThreshold: number;
	noise: number;
}

export interface SyntheticDataset {
	options: SyntheticDatasetOptions;
	rankings: readonly TieredRanking[];
}

function seededRandom(seed: number) {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
}

function normal(random: () => number) {
	const first = Math.max(Number.EPSILON, random());
	const second = random();
	return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function dot(first: readonly number[], second: readonly number[]) {
	return first.reduce((sum, value, index) => sum + value * second[index], 0);
}

export function generateSyntheticDataset(options: SyntheticDatasetOptions): SyntheticDataset {
	const random = seededRandom(options.seed);
	const prefix = options.category === 'restaurant' ? 'restaurant' : 'hotel';
	const places = Array.from({ length: options.placeCount }, (_, index) => ({
		id: `${prefix}-${index.toString().padStart(3, '0')}`,
		factors: Array.from({ length: options.factorDimensions }, () => normal(random)),
		bias: normal(random) * 0.35
	}));
	const rankings: TieredRanking[] = [];
	for (let userIndex = 0; userIndex < options.userCount; userIndex += 1) {
		const userFactors = Array.from({ length: options.factorDimensions }, () => normal(random));
		const visitCount = Math.min(
			options.placeCount,
			options.minimumVisited +
				Math.floor(random() * (options.maximumVisited - options.minimumVisited + 1))
		);
		const shuffled = places
			.map((place) => ({ place, order: random() }))
			.sort((first, second) => first.order - second.order)
			.slice(0, visitCount)
			.map(({ place }) => ({
				placeId: place.id,
				utility: dot(userFactors, place.factors) + place.bias + normal(random) * options.noise
			}))
			.sort(
				(first, second) =>
					second.utility - first.utility || first.placeId.localeCompare(second.placeId)
			);
		const tiers: string[][] = [];
		for (const item of shuffled) {
			const previousItem = shuffled[shuffled.indexOf(item) - 1];
			const currentTier = tiers.at(-1);
			if (
				currentTier &&
				currentTier.length < 2 &&
				previousItem &&
				Math.abs(previousItem.utility - item.utility) <= options.tieThreshold
			) {
				currentTier.push(item.placeId);
			} else tiers.push([item.placeId]);
		}
		rankings.push({
			userId: `${prefix}-user-${userIndex.toString().padStart(3, '0')}`,
			category: options.category,
			tiers
		});
	}
	return { options, rankings };
}
