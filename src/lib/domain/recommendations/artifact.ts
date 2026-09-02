import type { RankingCategory } from '../ranking/contracts';
import {
	MANDATORY_CONTRIBUTION_POLICY_VERSION,
	RECOMMENDATION_ARTIFACT_SCHEMA_VERSION,
	RECOMMENDATION_ENGINE_VERSION_BY_CATEGORY,
	type RecommendationArtifact,
	type RecommendationEvidenceDataset
} from './contracts';

function hashText(value: string) {
	let hash = 2_166_136_261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16_777_619);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

export function fingerprintEvidence(
	dataset: RecommendationEvidenceDataset,
	category: RankingCategory,
	dataClass: 'real' | 'synthetic'
) {
	return hashText(
		dataset.invalidationInputs
			.filter(
				(input) =>
					input.category === category &&
					(dataClass === 'synthetic'
						? input.provenance === 'synthetic'
						: input.provenance !== 'synthetic')
			)
			.map(
				(input) =>
					`${input.userId}:${input.revisionId}:${input.decision}:${input.reason}:${input.evidenceFingerprint}`
			)
			.sort()
			.join('|')
	);
}

export function buildRecommendationArtifact(input: {
	id: string;
	category: RankingCategory;
	dataClass: 'real' | 'synthetic';
	dataset: RecommendationEvidenceDataset;
	catalogueFingerprint: string;
	generatedAt: Date;
}): RecommendationArtifact {
	const permittedUsers = new Set(
		input.dataset.invalidationInputs
			.filter(
				(item) =>
					item.category === input.category &&
					item.decision === 'include' &&
					(input.dataClass === 'synthetic'
						? item.provenance === 'synthetic'
						: item.provenance !== 'synthetic')
			)
			.map((item) => item.userId)
	);
	const rankings = input.dataset.rankings.filter(
		(ranking) => ranking.category === input.category && permittedUsers.has(ranking.userId)
	);
	const support = new Map<string, Set<string>>();
	for (const ranking of rankings) {
		for (const placeId of ranking.tiers.flatMap((tier) => tier)) {
			const users = support.get(placeId) ?? new Set<string>();
			users.add(ranking.userId);
			support.set(placeId, users);
		}
	}
	return {
		schemaVersion: RECOMMENDATION_ARTIFACT_SCHEMA_VERSION,
		id: input.id,
		category: input.category,
		dataClass: input.dataClass,
		engineVersion: RECOMMENDATION_ENGINE_VERSION_BY_CATEGORY[input.category],
		contributionPolicyVersion:
			input.dataset.invalidationInputs.find((item) => item.category === input.category)
				?.policyVersion ?? MANDATORY_CONTRIBUTION_POLICY_VERSION,
		evidenceFingerprint: fingerprintEvidence(input.dataset, input.category, input.dataClass),
		catalogueFingerprint: input.catalogueFingerprint,
		generatedAt: input.generatedAt.toISOString(),
		observationCount: rankings.length,
		contributorCount: new Set(rankings.map((ranking) => ranking.userId)).size,
		rankings: rankings
			.map((ranking) => ({
				userId: ranking.userId,
				tiers: ranking.tiers.map((tier) => [...tier].sort())
			}))
			.sort((first, second) => first.userId.localeCompare(second.userId)),
		placeSupport: Object.fromEntries(
			[...support.entries()]
				.sort(([first], [second]) => first.localeCompare(second))
				.map(([placeId, users]) => [placeId, users.size])
		)
	};
}

export function encodeRecommendationArtifact(artifact: RecommendationArtifact) {
	return new TextEncoder().encode(JSON.stringify(artifact));
}

export function decodeRecommendationArtifact(value: Uint8Array) {
	const artifact = JSON.parse(new TextDecoder().decode(value)) as RecommendationArtifact;
	if (artifact.schemaVersion !== RECOMMENDATION_ARTIFACT_SCHEMA_VERSION) {
		throw new Error('Unsupported recommendation artifact schema');
	}
	return artifact;
}
