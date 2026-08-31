import type { RankingCategory } from '../ranking/contracts';
import {
	MANDATORY_CONTRIBUTION_POLICY_VERSION,
	RECOMMENDATION_ARTIFACT_SCHEMA_VERSION,
	RECOMMENDATION_ENGINE_VERSION_BY_CATEGORY,
	type RecommendationArtifact,
	type RecommendationEvidenceDataset,
	type ResolvedPreferenceObservation
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

function observationsToTiers(observations: readonly ResolvedPreferenceObservation[]) {
	const scores = new Map<string, number>();
	for (const observation of observations) {
		scores.set(observation.firstPlaceId, scores.get(observation.firstPlaceId) ?? 0);
		scores.set(observation.secondPlaceId, scores.get(observation.secondPlaceId) ?? 0);
		if (observation.relation === 'first-preferred') {
			scores.set(
				observation.firstPlaceId,
				(scores.get(observation.firstPlaceId) ?? 0) + observation.weight
			);
			scores.set(
				observation.secondPlaceId,
				(scores.get(observation.secondPlaceId) ?? 0) - observation.weight
			);
		} else if (observation.relation === 'second-preferred') {
			scores.set(
				observation.firstPlaceId,
				(scores.get(observation.firstPlaceId) ?? 0) - observation.weight
			);
			scores.set(
				observation.secondPlaceId,
				(scores.get(observation.secondPlaceId) ?? 0) + observation.weight
			);
		}
	}
	const grouped = new Map<number, string[]>();
	for (const [placeId, score] of scores) {
		const tier = grouped.get(score) ?? [];
		tier.push(placeId);
		grouped.set(score, tier);
	}
	return [...grouped.entries()]
		.sort(([first], [second]) => second - first)
		.map(([, places]) => places.sort());
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
	const observations = input.dataset.observations.filter(
		(observation) =>
			observation.category === input.category && permittedUsers.has(observation.userId)
	);
	const byUser = new Map<string, ResolvedPreferenceObservation[]>();
	const support = new Map<string, Set<string>>();
	for (const observation of observations) {
		const userObservations = byUser.get(observation.userId) ?? [];
		userObservations.push(observation);
		byUser.set(observation.userId, userObservations);
		for (const placeId of [observation.firstPlaceId, observation.secondPlaceId]) {
			const users = support.get(placeId) ?? new Set<string>();
			users.add(observation.userId);
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
		observationCount: observations.length,
		contributorCount: byUser.size,
		rankings: [...byUser.entries()]
			.sort(([first], [second]) => first.localeCompare(second))
			.map(([userId, userObservations]) => ({
				userId,
				tiers: observationsToTiers(userObservations)
			})),
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
