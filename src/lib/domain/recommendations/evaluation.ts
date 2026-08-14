import type { RankingCategory } from '../ranking/contracts';
import {
	createRandomBaseline,
	trainBradleyTerry,
	trainGeneralizedPlackettLuce,
	trainGlobalPrior,
	trainNearestNeighbor,
	type GeneralizedPlackettLuceOptions,
	type RecommendationModel,
	type TieredRanking
} from './models';
import { generateSyntheticDataset, type SyntheticDatasetOptions } from './synthetic';

export interface HeldOutRanking {
	full: TieredRanking;
	training: TieredRanking;
	heldOutPlaceIds: readonly string[];
	actualTierByPlace: ReadonlyMap<string, number>;
}

export interface BenchmarkMetrics {
	pairwiseAccuracy: number;
	tauB: number;
	ndcg: number;
	topTierRecall: number;
	coverage: number;
	novelty: number;
	calibrationError: number;
	coldStartPairwiseAccuracy: number;
	eligiblePairwiseAccuracy: number;
	evaluatedPairs: number;
}

export interface ModelBenchmarkResult {
	family: RecommendationModel['family'];
	metrics: BenchmarkMetrics;
	options?: GeneralizedPlackettLuceOptions;
}

export interface CategoryBenchmarkResult {
	category: RankingCategory;
	dataset: SyntheticDatasetOptions;
	holdoutStrategy: 'whole-tier-groups-before-observation-derivation';
	validationUserCount: number;
	testUserCount: number;
	selectedGeneralizedPlackettLuce: GeneralizedPlackettLuceOptions;
	selectedModelFamily: RecommendationModel['family'];
	models: readonly ModelBenchmarkResult[];
	servingGate: {
		rankedPlaces: 5;
		resolvedTiers: 3;
		supportedPlaceFactors: 4;
		validated: boolean;
	};
}

export function splitWholeTierGroups(rankings: readonly TieredRanking[]): HeldOutRanking[] {
	return rankings.map((ranking, userIndex) => {
		const desired = Math.max(2, Math.min(3, Math.floor(ranking.tiers.length * 0.25)));
		const selected = new Set<number>();
		for (let offset = 0; offset < desired; offset += 1) {
			const candidate = Math.min(
				ranking.tiers.length - 1,
				Math.floor(((offset + 1) * ranking.tiers.length) / (desired + 1)) + (userIndex % 2)
			);
			selected.add(candidate);
		}
		let fallback = 0;
		while (selected.size < desired && fallback < ranking.tiers.length) {
			selected.add(fallback);
			fallback += 1;
		}
		const heldOutPlaceIds = [...selected]
			.sort((first, second) => first - second)
			.flatMap((tierIndex) => ranking.tiers[tierIndex]);
		return {
			full: ranking,
			training: {
				...ranking,
				tiers: ranking.tiers.filter((_tier, tierIndex) => !selected.has(tierIndex))
			},
			heldOutPlaceIds,
			actualTierByPlace: new Map(
				ranking.tiers.flatMap((tier, tierIndex) =>
					tier.map((placeId) => [placeId, tierIndex] as const)
				)
			)
		};
	});
}

function predictedRelation(firstScore: number, secondScore: number) {
	return Math.abs(firstScore - secondScore) < 0.05 ? 0 : Math.sign(firstScore - secondScore);
}

function sigmoid(value: number) {
	return 1 / (1 + Math.exp(-value));
}

export function evaluateModel(
	model: RecommendationModel,
	folds: readonly HeldOutRanking[],
	maximumUserSupport: number
): BenchmarkMetrics {
	let correctPairs = 0;
	let evaluatedPairs = 0;
	let tauSum = 0;
	let tauUsers = 0;
	let ndcgSum = 0;
	let topTierRecallSum = 0;
	let covered = 0;
	let heldPlaces = 0;
	let noveltySum = 0;
	let coldCorrect = 0;
	let coldPairs = 0;
	let eligibleCorrect = 0;
	let eligiblePairs = 0;
	const calibration = Array.from({ length: 5 }, () => ({ confidence: 0, correct: 0, count: 0 }));

	for (const fold of folds) {
		const personalizedScore = model.personalize?.(fold.training);
		const scored = fold.heldOutPlaceIds.map((placeId) => ({
			placeId,
			score: personalizedScore?.(placeId) ?? model.score(fold.full.userId, placeId),
			actualTier: fold.actualTierByPlace.get(placeId) ?? Number.MAX_SAFE_INTEGER
		}));
		const trainingPlaceCount = fold.training.tiers.flatMap((tier) => tier).length;
		const gateEligible =
			trainingPlaceCount >= 5 &&
			fold.training.tiers.length >= 3 &&
			fold.heldOutPlaceIds.every((placeId) => model.support(placeId) >= 4);
		let concordant = 0;
		let discordant = 0;
		let actualTiesOnly = 0;
		let predictedTiesOnly = 0;
		for (let first = 0; first < scored.length; first += 1) {
			for (let second = first + 1; second < scored.length; second += 1) {
				const actual = Math.sign(scored[second].actualTier - scored[first].actualTier);
				const predicted = predictedRelation(scored[first].score, scored[second].score);
				const correct = actual === predicted;
				correctPairs += correct ? 1 : 0;
				evaluatedPairs += 1;
				if (trainingPlaceCount < 5) {
					coldCorrect += correct ? 1 : 0;
					coldPairs += 1;
				}
				if (gateEligible) {
					eligibleCorrect += correct ? 1 : 0;
					eligiblePairs += 1;
				}
				if (actual === 0 && predicted !== 0) actualTiesOnly += 1;
				else if (actual !== 0 && predicted === 0) predictedTiesOnly += 1;
				else if (actual !== 0 && predicted !== 0) {
					if (actual === predicted) concordant += 1;
					else discordant += 1;
					const confidence = sigmoid(Math.abs(scored[first].score - scored[second].score));
					const bucket = Math.min(4, Math.floor((confidence - 0.5) * 10));
					calibration[bucket].confidence += confidence;
					calibration[bucket].correct += correct ? 1 : 0;
					calibration[bucket].count += 1;
				}
			}
		}
		const denominator = Math.sqrt(
			(concordant + discordant + actualTiesOnly) * (concordant + discordant + predictedTiesOnly)
		);
		if (denominator > 0) {
			tauSum += (concordant - discordant) / denominator;
			tauUsers += 1;
		}

		const predictedOrder = [...scored].sort(
			(first, second) => second.score - first.score || first.placeId.localeCompare(second.placeId)
		);
		const relevance = (tier: number) => Math.max(0, fold.full.tiers.length - tier);
		const dcg = predictedOrder.reduce(
			(sum, item, index) => sum + (2 ** relevance(item.actualTier) - 1) / Math.log2(index + 2),
			0
		);
		const ideal = [...scored]
			.sort((first, second) => first.actualTier - second.actualTier)
			.reduce(
				(sum, item, index) => sum + (2 ** relevance(item.actualTier) - 1) / Math.log2(index + 2),
				0
			);
		ndcgSum += ideal === 0 ? 0 : dcg / ideal;
		const bestTier = Math.min(...scored.map((item) => item.actualTier));
		const bestCount = scored.filter((item) => item.actualTier === bestTier).length;
		topTierRecallSum +=
			predictedOrder.slice(0, bestCount).filter((item) => item.actualTier === bestTier).length /
			bestCount;

		for (const item of scored) {
			const support = model.support(item.placeId);
			covered += support >= 4 ? 1 : 0;
			heldPlaces += 1;
			noveltySum += 1 - Math.log1p(support) / Math.log1p(Math.max(1, maximumUserSupport));
		}
	}

	const calibrationCount = calibration.reduce((sum, bucket) => sum + bucket.count, 0);
	const calibrationError = calibration.reduce((sum, bucket) => {
		if (bucket.count === 0) return sum;
		const confidence = bucket.confidence / bucket.count;
		const accuracy = bucket.correct / bucket.count;
		return sum + (bucket.count / Math.max(1, calibrationCount)) * Math.abs(confidence - accuracy);
	}, 0);

	return {
		pairwiseAccuracy: correctPairs / Math.max(1, evaluatedPairs),
		tauB: tauSum / Math.max(1, tauUsers),
		ndcg: ndcgSum / Math.max(1, folds.length),
		topTierRecall: topTierRecallSum / Math.max(1, folds.length),
		coverage: covered / Math.max(1, heldPlaces),
		novelty: noveltySum / Math.max(1, heldPlaces),
		calibrationError,
		coldStartPairwiseAccuracy: coldCorrect / Math.max(1, coldPairs),
		eligiblePairwiseAccuracy: eligibleCorrect / Math.max(1, eligiblePairs),
		evaluatedPairs
	};
}

function trainModels(
	training: readonly TieredRanking[],
	gplOptions: GeneralizedPlackettLuceOptions,
	seed: number
) {
	const factorOptions = {
		dimensions: gplOptions.dimensions,
		epochs: gplOptions.epochs,
		learningRate: gplOptions.learningRate,
		regularization: gplOptions.regularization,
		seed
	};
	return [
		trainGeneralizedPlackettLuce(training, gplOptions),
		trainBradleyTerry(training, factorOptions),
		trainNearestNeighbor(training),
		trainGlobalPrior(training),
		createRandomBaseline(seed)
	];
}

export function runCategoryBenchmark(
	datasetOptions: SyntheticDatasetOptions,
	parameterGrid: readonly GeneralizedPlackettLuceOptions[]
): CategoryBenchmarkResult {
	const dataset = generateSyntheticDataset(datasetOptions);
	const folds = splitWholeTierGroups(dataset.rankings);
	const validationFolds = folds.filter((_fold, index) => index % 4 === 0);
	const testFolds = folds.filter((_fold, index) => index % 4 !== 0);
	const training = folds.map((fold) => fold.training);
	let selected = parameterGrid[0];
	let selectedAccuracy = Number.NEGATIVE_INFINITY;
	for (const options of parameterGrid) {
		const model = trainGeneralizedPlackettLuce(training, options);
		const metrics = evaluateModel(model, validationFolds, datasetOptions.userCount);
		if (metrics.pairwiseAccuracy > selectedAccuracy) {
			selected = options;
			selectedAccuracy = metrics.pairwiseAccuracy;
		}
	}
	const models = trainModels(training, selected, datasetOptions.seed).map((model) => ({
		family: model.family,
		metrics: evaluateModel(model, testFolds, datasetOptions.userCount),
		...(model.family === 'generalized-plackett-luce' ? { options: selected } : {})
	}));
	const global = models.find((model) => model.family === 'global-prior');
	const selectedModel = models
		.filter((model) => model.family !== 'global-prior' && model.family !== 'random')
		.sort(
			(first, second) =>
				second.metrics.pairwiseAccuracy - first.metrics.pairwiseAccuracy ||
				second.metrics.tauB - first.metrics.tauB ||
				second.metrics.ndcg - first.metrics.ndcg
		)[0];
	return {
		category: datasetOptions.category,
		dataset: datasetOptions,
		holdoutStrategy: 'whole-tier-groups-before-observation-derivation',
		validationUserCount: validationFolds.length,
		testUserCount: testFolds.length,
		selectedGeneralizedPlackettLuce: selected,
		selectedModelFamily: selectedModel.family,
		models,
		servingGate: {
			rankedPlaces: 5,
			resolvedTiers: 3,
			supportedPlaceFactors: 4,
			validated:
				selectedModel.metrics.eligiblePairwiseAccuracy >
				(global?.metrics.eligiblePairwiseAccuracy ?? 1)
		}
	};
}
