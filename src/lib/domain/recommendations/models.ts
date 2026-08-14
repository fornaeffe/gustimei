import type { RankingCategory } from '../ranking/contracts';

export interface TieredRanking {
	userId: string;
	category: RankingCategory;
	tiers: readonly (readonly string[])[];
}

export interface RecommendationModel {
	readonly family:
		'generalized-plackett-luce' | 'bradley-terry' | 'nearest-neighbor' | 'global-prior' | 'random';
	score(userId: string, placeId: string): number;
	support(placeId: string): number;
	personalize?(ranking: TieredRanking, epochs?: number): (placeId: string) => number;
}

export interface FactorModelOptions {
	dimensions: number;
	epochs: number;
	learningRate: number;
	regularization: number;
	seed: number;
}

export interface GeneralizedPlackettLuceOptions extends FactorModelOptions {
	tiePropensity: number;
	maxTieSize: 1 | 2;
}

interface FactorState {
	userFactors: Map<string, number[]>;
	placeFactors: Map<string, number[]>;
	placeBias: Map<string, number>;
	support: Map<string, number>;
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

function createFactorState(rankings: readonly TieredRanking[], dimensions: number, seed: number) {
	const random = seededRandom(seed);
	const users = [...new Set(rankings.map((ranking) => ranking.userId))].sort();
	const places = [
		...new Set(rankings.flatMap((ranking) => ranking.tiers.flatMap((tier) => tier)))
	].sort();
	const initialFactor = () => Array.from({ length: dimensions }, () => (random() - 0.5) * 0.04);
	const support = new Map<string, number>();
	for (const ranking of rankings) {
		for (const placeId of ranking.tiers.flatMap((tier) => tier)) {
			support.set(placeId, (support.get(placeId) ?? 0) + 1);
		}
	}
	return {
		userFactors: new Map(users.map((userId) => [userId, initialFactor()])),
		placeFactors: new Map(places.map((placeId) => [placeId, initialFactor()])),
		placeBias: new Map(places.map((placeId) => [placeId, 0])),
		support
	} satisfies FactorState;
}

function utility(state: FactorState, userId: string, placeId: string) {
	const user = state.userFactors.get(userId);
	const place = state.placeFactors.get(placeId);
	if (!place) return Number.NEGATIVE_INFINITY;
	let score = state.placeBias.get(placeId) ?? 0;
	if (!user) return score;
	for (let index = 0; index < user.length; index += 1) score += user[index] * place[index];
	return score;
}

function applyUtilityGradients(
	state: FactorState,
	userId: string,
	gradients: ReadonlyMap<string, number>,
	options: FactorModelOptions
) {
	const user = state.userFactors.get(userId);
	if (!user) return;
	const originalUser = [...user];
	const userGradient = Array.from({ length: user.length }, () => 0);
	for (const [placeId, gradient] of gradients) {
		const place = state.placeFactors.get(placeId);
		if (!place) continue;
		for (let index = 0; index < user.length; index += 1) {
			userGradient[index] += gradient * place[index];
			place[index] +=
				options.learningRate *
				(gradient * originalUser[index] - options.regularization * place[index]);
		}
		const bias = state.placeBias.get(placeId) ?? 0;
		state.placeBias.set(
			placeId,
			bias + options.learningRate * (gradient - options.regularization * bias)
		);
	}
	for (let index = 0; index < user.length; index += 1) {
		user[index] +=
			options.learningRate * (userGradient[index] - options.regularization * originalUser[index]);
	}
}

function combinations(items: readonly string[], size: 1 | 2) {
	if (size === 1) return items.map((item) => [item]);
	const result: string[][] = [];
	for (let first = 0; first < items.length; first += 1) {
		for (let second = first + 1; second < items.length; second += 1) {
			result.push([items[first], items[second]]);
		}
	}
	return result;
}

export function generalizedPlackettLuceChoice(
	scores: ReadonlyMap<string, number>,
	selectedTier: readonly string[],
	tiePropensity: number,
	maxTieSize: 1 | 2
) {
	if (selectedTier.length > maxTieSize) {
		throw new Error('Observed tie exceeds configured generalized Plackett–Luce tie size');
	}
	const remaining = [...scores.keys()];
	const alternatives = [
		...combinations(remaining, 1),
		...(maxTieSize === 2 ? combinations(remaining, 2) : [])
	];
	const logWeight = (alternative: readonly string[]) =>
		alternative.reduce((sum, placeId) => sum + (scores.get(placeId) ?? 0), 0) +
		(alternative.length === 2 ? Math.log(tiePropensity) : 0);
	const logWeights = alternatives.map(logWeight);
	const maxLogWeight = Math.max(...logWeights);
	const weights = logWeights.map((weight) => Math.exp(weight - maxLogWeight));
	const denominator = weights.reduce((sum, weight) => sum + weight, 0);
	const expected = new Map(remaining.map((placeId) => [placeId, 0]));
	for (let index = 0; index < alternatives.length; index += 1) {
		const probability = weights[index] / denominator;
		for (const placeId of alternatives[index]) {
			expected.set(placeId, (expected.get(placeId) ?? 0) + probability);
		}
	}
	const selected = new Set(selectedTier);
	return {
		logLikelihood:
			logWeight(selectedTier) - (maxLogWeight + Math.log(Math.max(Number.MIN_VALUE, denominator))),
		gradients: new Map(
			remaining.map((placeId) => [
				placeId,
				(selected.has(placeId) ? 1 : 0) - (expected.get(placeId) ?? 0)
			])
		)
	};
}

class FactorRecommendationModel implements RecommendationModel {
	readonly family: RecommendationModel['family'];
	readonly #state: FactorState;
	readonly #options: FactorModelOptions;
	readonly #gplOptions?: GeneralizedPlackettLuceOptions;

	constructor(
		family: Extract<RecommendationModel['family'], 'generalized-plackett-luce' | 'bradley-terry'>,
		state: FactorState,
		options: FactorModelOptions,
		gplOptions?: GeneralizedPlackettLuceOptions
	) {
		this.family = family;
		this.#state = state;
		this.#options = options;
		this.#gplOptions = gplOptions;
	}

	score(userId: string, placeId: string) {
		return utility(this.#state, userId, placeId);
	}

	support(placeId: string) {
		return this.#state.support.get(placeId) ?? 0;
	}

	personalize(ranking: TieredRanking, epochs = 15) {
		const factors = Array.from({ length: this.#options.dimensions }, () => 0);
		const score = (placeId: string) => {
			const place = this.#state.placeFactors.get(placeId);
			if (!place) return Number.NEGATIVE_INFINITY;
			return (
				(this.#state.placeBias.get(placeId) ?? 0) +
				factors.reduce((sum, value, index) => sum + value * place[index], 0)
			);
		};
		const applyUserGradient = (gradients: ReadonlyMap<string, number>) => {
			const update = Array.from({ length: factors.length }, () => 0);
			for (const [placeId, gradient] of gradients) {
				const place = this.#state.placeFactors.get(placeId);
				if (!place) continue;
				for (let index = 0; index < factors.length; index += 1) {
					update[index] += gradient * place[index];
				}
			}
			for (let index = 0; index < factors.length; index += 1) {
				factors[index] +=
					this.#options.learningRate *
					(update[index] - this.#options.regularization * factors[index]);
			}
		};
		for (let epoch = 0; epoch < epochs; epoch += 1) {
			if (this.#gplOptions) {
				const remaining = ranking.tiers.flatMap((tier) => [...tier]);
				for (const tier of ranking.tiers) {
					const choice = generalizedPlackettLuceChoice(
						new Map(remaining.map((placeId) => [placeId, score(placeId)])),
						tier,
						this.#gplOptions.tiePropensity,
						this.#gplOptions.maxTieSize
					);
					applyUserGradient(choice.gradients);
					for (const selectedPlace of tier) {
						const index = remaining.indexOf(selectedPlace);
						if (index >= 0) remaining.splice(index, 1);
					}
				}
			} else {
				for (let preferredTier = 0; preferredTier < ranking.tiers.length; preferredTier += 1) {
					for (
						let otherTier = preferredTier + 1;
						otherTier < ranking.tiers.length;
						otherTier += 1
					) {
						for (const preferred of ranking.tiers[preferredTier]) {
							for (const other of ranking.tiers[otherTier]) {
								const gradient = 1 - sigmoid(score(preferred) - score(other));
								applyUserGradient(
									new Map([
										[preferred, gradient],
										[other, -gradient]
									])
								);
							}
						}
					}
				}
			}
		}
		return score;
	}
}

export function trainGeneralizedPlackettLuce(
	rankings: readonly TieredRanking[],
	options: GeneralizedPlackettLuceOptions
): RecommendationModel {
	const state = createFactorState(rankings, options.dimensions, options.seed);
	for (let epoch = 0; epoch < options.epochs; epoch += 1) {
		for (const ranking of rankings) {
			const remaining = ranking.tiers.flatMap((tier) => [...tier]);
			for (const selectedTier of ranking.tiers) {
				const choice = generalizedPlackettLuceChoice(
					new Map(remaining.map((placeId) => [placeId, utility(state, ranking.userId, placeId)])),
					selectedTier,
					options.tiePropensity,
					options.maxTieSize
				);
				applyUtilityGradients(state, ranking.userId, choice.gradients, options);
				for (const selectedPlace of selectedTier) {
					const index = remaining.indexOf(selectedPlace);
					if (index >= 0) remaining.splice(index, 1);
				}
			}
		}
	}
	return new FactorRecommendationModel('generalized-plackett-luce', state, options, options);
}

function sigmoid(value: number) {
	if (value >= 0) return 1 / (1 + Math.exp(-value));
	const exponential = Math.exp(value);
	return exponential / (1 + exponential);
}

export function trainBradleyTerry(
	rankings: readonly TieredRanking[],
	options: FactorModelOptions
): RecommendationModel {
	const state = createFactorState(rankings, options.dimensions, options.seed);
	for (let epoch = 0; epoch < options.epochs; epoch += 1) {
		for (const ranking of rankings) {
			for (const tier of ranking.tiers) {
				for (let first = 0; first < tier.length; first += 1) {
					for (let second = first + 1; second < tier.length; second += 1) {
						const difference =
							utility(state, ranking.userId, tier[first]) -
							utility(state, ranking.userId, tier[second]);
						const gradient = 0.5 - sigmoid(difference);
						applyUtilityGradients(
							state,
							ranking.userId,
							new Map([
								[tier[first], gradient],
								[tier[second], -gradient]
							]),
							options
						);
					}
				}
			}
			for (let preferredTier = 0; preferredTier < ranking.tiers.length; preferredTier += 1) {
				for (let otherTier = preferredTier + 1; otherTier < ranking.tiers.length; otherTier += 1) {
					for (const preferred of ranking.tiers[preferredTier]) {
						for (const other of ranking.tiers[otherTier]) {
							const difference =
								utility(state, ranking.userId, preferred) - utility(state, ranking.userId, other);
							const gradient = 1 - sigmoid(difference);
							applyUtilityGradients(
								state,
								ranking.userId,
								new Map([
									[preferred, gradient],
									[other, -gradient]
								]),
								options
							);
						}
					}
				}
			}
		}
	}
	return new FactorRecommendationModel('bradley-terry', state, options);
}

function normalizedTierScore(tierIndex: number, tierCount: number) {
	return tierCount <= 1 ? 1 : 1 - tierIndex / (tierCount - 1);
}

function rankingScores(ranking: TieredRanking) {
	return new Map(
		ranking.tiers.flatMap((tier, tierIndex) =>
			tier.map(
				(placeId) => [placeId, normalizedTierScore(tierIndex, ranking.tiers.length)] as const
			)
		)
	);
}

export function trainGlobalPrior(
	rankings: readonly TieredRanking[],
	smoothing = 3
): RecommendationModel {
	const sums = new Map<string, number>();
	const support = new Map<string, number>();
	for (const ranking of rankings) {
		for (const [placeId, score] of rankingScores(ranking)) {
			sums.set(placeId, (sums.get(placeId) ?? 0) + score);
			support.set(placeId, (support.get(placeId) ?? 0) + 1);
		}
	}
	const globalMean =
		[...sums.values()].reduce((sum, value) => sum + value, 0) /
		Math.max(
			1,
			[...support.values()].reduce((sum, value) => sum + value, 0)
		);
	return {
		family: 'global-prior',
		score: (_userId, placeId) =>
			((sums.get(placeId) ?? 0) + smoothing * globalMean) /
			((support.get(placeId) ?? 0) + smoothing),
		support: (placeId) => support.get(placeId) ?? 0
	};
}

function commonPairAgreement(first: TieredRanking, second: TieredRanking) {
	const firstRanks = new Map(
		first.tiers.flatMap((tier, index) => tier.map((placeId) => [placeId, index] as const))
	);
	const secondRanks = new Map(
		second.tiers.flatMap((tier, index) => tier.map((placeId) => [placeId, index] as const))
	);
	const common = [...firstRanks.keys()].filter((placeId) => secondRanks.has(placeId));
	let agreement = 0;
	let pairs = 0;
	for (let firstIndex = 0; firstIndex < common.length; firstIndex += 1) {
		for (let secondIndex = firstIndex + 1; secondIndex < common.length; secondIndex += 1) {
			const firstDirection = Math.sign(
				(firstRanks.get(common[firstIndex]) ?? 0) - (firstRanks.get(common[secondIndex]) ?? 0)
			);
			const secondDirection = Math.sign(
				(secondRanks.get(common[firstIndex]) ?? 0) - (secondRanks.get(common[secondIndex]) ?? 0)
			);
			agreement += firstDirection === secondDirection ? 1 : -1;
			pairs += 1;
		}
	}
	return pairs === 0 ? 0 : agreement / pairs;
}

export function trainNearestNeighbor(rankings: readonly TieredRanking[]): RecommendationModel {
	const byUser = new Map(rankings.map((ranking) => [ranking.userId, ranking]));
	const scores = new Map(rankings.map((ranking) => [ranking.userId, rankingScores(ranking)]));
	const support = new Map<string, number>();
	for (const ranking of rankings) {
		for (const placeId of ranking.tiers.flatMap((tier) => tier)) {
			support.set(placeId, (support.get(placeId) ?? 0) + 1);
		}
	}
	const global = trainGlobalPrior(rankings);
	return {
		family: 'nearest-neighbor',
		score: (userId, placeId) => {
			const target = byUser.get(userId);
			if (!target) return global.score(userId, placeId);
			let weightedScore = 0;
			let totalWeight = 0;
			for (const neighbor of rankings) {
				if (neighbor.userId === userId) continue;
				const neighborScore = scores.get(neighbor.userId)?.get(placeId);
				if (neighborScore === undefined) continue;
				const weight = Math.max(0, commonPairAgreement(target, neighbor));
				weightedScore += weight * neighborScore;
				totalWeight += weight;
			}
			return totalWeight > 0 ? weightedScore / totalWeight : global.score(userId, placeId);
		},
		support: (placeId) => support.get(placeId) ?? 0
	};
}

function stringHash(value: string) {
	let hash = 2_166_136_261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16_777_619);
	}
	return hash >>> 0;
}

export function createRandomBaseline(seed: number): RecommendationModel {
	return {
		family: 'random',
		score: (userId, placeId) => stringHash(`${seed}:${userId}:${placeId}`) / 4_294_967_296,
		support: () => 0
	};
}
