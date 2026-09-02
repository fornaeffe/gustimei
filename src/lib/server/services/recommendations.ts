import { newApplicationId } from '$lib/domain/ids';
import type { RankingCategory, RankingRevision } from '$lib/domain/ranking/contracts';
import {
	buildRecommendationArtifact,
	decodeRecommendationArtifact,
	encodeRecommendationArtifact,
	fingerprintEvidence
} from '$lib/domain/recommendations/artifact';
import {
	RECOMMENDATION_MAX_BROWSABLE_DEPTH,
	RECOMMENDATION_PAGE_SIZE,
	type RecommendationArtifact
} from '$lib/domain/recommendations/contracts';
import { scoreRecommendationCandidates } from '$lib/domain/recommendations/serving';
import type { AppEnvironment } from '$lib/server/config/environment';
import type { ArtifactStore } from '$lib/server/providers/contracts';
import { DomainValidationError } from '$lib/server/domain/errors';
import type { DatabaseRecommendationEvidenceSource } from '$lib/server/repositories/recommendation-evidence';
import {
	fingerprintRecommendationCatalogue,
	type RecommendationRepository
} from '$lib/server/repositories/recommendations';

const MAX_LOCAL_BUILD_MS = 5_000;
const MAX_LOCAL_ARTIFACT_BYTES = 16 * 1024 * 1024;

function artifactKey(
	environment: AppEnvironment,
	category: RankingCategory,
	dataClass: 'real' | 'synthetic',
	id = 'current'
) {
	return `recommendations/${environment}/${dataClass}/${category}/${id}.json`;
}

function allEvidencePlaceIds(
	dataset: Awaited<ReturnType<DatabaseRecommendationEvidenceSource['read']>>
) {
	return [...new Set(dataset.rankings.flatMap((ranking) => ranking.tiers.flatMap((tier) => tier)))];
}

function encodeCursor(value: {
	artifactId: string;
	offset: number;
	scope: string;
	rankingSnapshot: string;
}) {
	return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeCursor(value: string | undefined) {
	if (!value) return undefined;
	try {
		const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
			artifactId?: unknown;
			offset?: unknown;
			scope?: unknown;
			rankingSnapshot?: unknown;
		};
		if (
			typeof parsed.artifactId !== 'string' ||
			typeof parsed.offset !== 'number' ||
			!Number.isSafeInteger(parsed.offset) ||
			parsed.offset < 0 ||
			typeof parsed.scope !== 'string' ||
			typeof parsed.rankingSnapshot !== 'string'
		)
			return undefined;
		return {
			artifactId: parsed.artifactId,
			offset: parsed.offset,
			scope: parsed.scope,
			rankingSnapshot: parsed.rankingSnapshot
		};
	} catch {
		return undefined;
	}
}

export class RecommendationArtifactService {
	static readonly #locks = new Map<string, Promise<RecommendationArtifact>>();

	constructor(
		private readonly evidence: DatabaseRecommendationEvidenceSource,
		private readonly recommendations: RecommendationRepository,
		private readonly artifacts: ArtifactStore,
		private readonly environment: AppEnvironment,
		private readonly clock: () => Date = () => new Date(),
		private readonly createId: () => string = () => newApplicationId()
	) {}

	async load(category: RankingCategory, dataClass: 'real' | 'synthetic', id = 'current') {
		const stored = await this.artifacts.get(artifactKey(this.environment, category, dataClass, id));
		if (!stored) return undefined;
		try {
			return decodeRecommendationArtifact(stored);
		} catch {
			// Generated artifacts are replaceable caches. An incompatible schema is a cache miss, not a
			// reason to reinterpret or migrate old ranking input.
			return undefined;
		}
	}

	async rebuild(
		category: RankingCategory,
		dataClass: 'real' | 'synthetic',
		options: { signal?: AbortSignal; attempts?: number } = {}
	) {
		const lockKey = `${this.environment}:${dataClass}:${category}`;
		const existing = RecommendationArtifactService.#locks.get(lockKey);
		if (existing) return existing;
		const running = this.#rebuildWithRetry(category, dataClass, options).finally(() => {
			RecommendationArtifactService.#locks.delete(lockKey);
		});
		RecommendationArtifactService.#locks.set(lockKey, running);
		return running;
	}

	async #rebuildWithRetry(
		category: RankingCategory,
		dataClass: 'real' | 'synthetic',
		options: { signal?: AbortSignal; attempts?: number }
	) {
		let failure: unknown;
		for (let attempt = 1; attempt <= (options.attempts ?? 3); attempt += 1) {
			if (options.signal?.aborted) throw new Error('Recommendation rebuild cancelled');
			try {
				return await this.#build(category, dataClass, options.signal);
			} catch (error) {
				failure = error;
				if (options.signal?.aborted) break;
			}
		}
		throw failure;
	}

	async #build(category: RankingCategory, dataClass: 'real' | 'synthetic', signal?: AbortSignal) {
		const started = performance.now();
		const dataset = await this.evidence.read('community-model-training');
		if (signal?.aborted) throw new Error('Recommendation rebuild cancelled');
		const candidates = await this.recommendations.loadCandidates({
			category,
			dataClass,
			placeIds: allEvidencePlaceIds(dataset)
		});
		const artifact = buildRecommendationArtifact({
			id: this.createId(),
			category,
			dataClass,
			dataset,
			catalogueFingerprint: fingerprintRecommendationCatalogue(candidates),
			generatedAt: this.clock()
		});
		const encoded = encodeRecommendationArtifact(artifact);
		const duration = performance.now() - started;
		if (duration > MAX_LOCAL_BUILD_MS) throw new Error('Recommendation build exceeded 5 seconds');
		if (encoded.byteLength > MAX_LOCAL_ARTIFACT_BYTES) {
			throw new Error('Recommendation artifact exceeded 16 MiB');
		}
		if (signal?.aborted) throw new Error('Recommendation rebuild cancelled');
		await this.artifacts.put(
			artifactKey(this.environment, category, dataClass, artifact.id),
			encoded
		);
		await this.artifacts.put(artifactKey(this.environment, category, dataClass), encoded);
		return artifact;
	}

	async ensureCurrent(category: RankingCategory, dataClass: 'real' | 'synthetic') {
		const [current, dataset] = await Promise.all([
			this.load(category, dataClass),
			this.evidence.read('community-model-training')
		]);
		const placeIds = [
			...new Set([...Object.keys(current?.placeSupport ?? {}), ...allEvidencePlaceIds(dataset)])
		];
		const candidates = await this.recommendations.loadCandidates({
			category,
			dataClass,
			placeIds
		});
		if (
			current &&
			current.evidenceFingerprint === fingerprintEvidence(dataset, category, dataClass) &&
			current.catalogueFingerprint === fingerprintRecommendationCatalogue(candidates)
		)
			return current;
		return this.rebuild(category, dataClass);
	}
}

export class RecommendationService {
	constructor(
		private readonly evidence: DatabaseRecommendationEvidenceSource,
		private readonly recommendations: RecommendationRepository,
		private readonly artifactService: RecommendationArtifactService
	) {}

	async list(input: {
		userId: string;
		category: RankingCategory;
		dataClass: 'real' | 'synthetic';
		revision?: RankingRevision;
		visitedPlaceIds: readonly string[];
		locality?: string;
		cursor?: string;
		all?: boolean;
	}) {
		const requested = decodeCursor(input.cursor);
		if (input.cursor && !requested)
			throw new DomainValidationError('Invalid recommendation cursor');
		const artifact = requested
			? await this.artifactService.load(input.category, input.dataClass, requested.artifactId)
			: await this.artifactService.ensureCurrent(input.category, input.dataClass);
		if (!artifact) {
			throw new DomainValidationError(
				'The requested recommendation snapshot is no longer available'
			);
		}
		const scope = input.locality?.trim().toLocaleLowerCase('it') ?? '';
		const rankingSnapshot =
			input.revision?.id ?? `unpublished:${[...input.visitedPlaceIds].sort().join('|')}`;
		if (requested && (requested.scope !== scope || requested.rankingSnapshot !== rankingSnapshot)) {
			throw new DomainValidationError(
				'Recommendation cursor does not match the current scope or ranking snapshot'
			);
		}
		const candidateIds = [
			...new Set([
				...Object.keys(artifact.placeSupport)
					.sort(
						(first, second) =>
							artifact.placeSupport[second] - artifact.placeSupport[first] ||
							first.localeCompare(second)
					)
					.slice(0, RECOMMENDATION_MAX_BROWSABLE_DEPTH),
				...input.visitedPlaceIds
			])
		];
		const places = await this.recommendations.loadCandidates({
			category: input.category,
			dataClass: input.dataClass,
			placeIds: candidateIds
		});
		const placeById = new Map(places.map((place) => [place.placeId, place]));
		const personalDataset = await this.evidence.read('current-user-personalization');
		const personalPermission = personalDataset.invalidationInputs.find(
			(item) => item.userId === input.userId && item.category === input.category
		)?.decision;
		const scored = scoreRecommendationCandidates({
			userId: input.userId,
			revision: personalPermission === 'include' ? input.revision : undefined,
			artifact,
			candidatePlaceIds: places.map((place) => place.placeId),
			visitedPlaceIds: new Set(input.visitedPlaceIds)
		});
		const ordered = scored.scores
			.map((score) => ({ ...placeById.get(score.placeId)!, ...score }))
			.filter(
				(place) =>
					!scope ||
					place.displayLocality.toLocaleLowerCase('it').includes(scope) ||
					place.addressLabel?.toLocaleLowerCase('it').includes(scope)
			);
		const offset = requested?.offset ?? 0;
		const page = input.all ? ordered : ordered.slice(offset, offset + RECOMMENDATION_PAGE_SIZE);
		const nextOffset = offset + page.length;
		return {
			artifactId: artifact.id,
			generatedAt: artifact.generatedAt,
			gate: scored.gate,
			results: page.map((place, index) => ({ ...place, predictedPosition: offset + index + 1 })),
			total: ordered.length,
			nextCursor:
				!input.all && nextOffset < ordered.length
					? encodeCursor({ artifactId: artifact.id, offset: nextOffset, scope, rankingSnapshot })
					: undefined
		};
	}
}
