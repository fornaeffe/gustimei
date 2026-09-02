import { describe, expect, it } from 'vitest';
import type { RankingRevision } from '../ranking/contracts';
import { buildRecommendationArtifact, encodeRecommendationArtifact } from './artifact';
import type {
	RecommendationArtifact,
	RecommendationEvidenceDataset,
	ResolvedRankingObservation
} from './contracts';
import { deriveServingGate, scoreRecommendationCandidates } from './serving';

function dataset(
	rankings: ResolvedRankingObservation[],
	provenance: RankingRevision['provenance'] = 'internal-testing'
): RecommendationEvidenceDataset {
	const users = [...new Set(rankings.map((item) => item.userId))];
	return {
		purpose: 'community-model-training',
		rankings,
		decisions: users.map(() => ({
			decision: 'include',
			reason: 'eligible',
			policyVersion: 'contribution-mandatory-v1',
			purpose: 'community-model-training'
		})),
		exclusionCounts: {},
		invalidationInputs: users.map((userId) => ({
			userId,
			category: 'restaurant',
			revisionId: `revision-${userId}`,
			provenance,
			purpose: 'community-model-training',
			policyVersion: 'contribution-mandatory-v1',
			recommendationEngineVersion: 'recommendation-restaurant-nearest-neighbor-v2-resolved-tiers',
			decision: 'include',
			reason: 'eligible',
			evidenceFingerprint: rankings
				.filter((item) => item.userId === userId)
				.map((item) => item.id)
				.join('|')
		}))
	};
}

function ranking(userId: string, placeIds: string[]) {
	return {
		id: `revision-${userId}`,
		userId,
		category: 'restaurant' as const,
		revisionId: `revision-${userId}`,
		tiers: placeIds.map((placeId) => [placeId])
	};
}

function artifact(rankings: ResolvedRankingObservation[]) {
	return buildRecommendationArtifact({
		id: 'artifact-1',
		category: 'restaurant',
		dataClass: 'real',
		dataset: dataset(rankings),
		catalogueFingerprint: 'catalogue-1',
		generatedAt: new Date('2026-08-31T10:00:00.000Z')
	});
}

function revision(placeIds: string[]): RankingRevision {
	return {
		id: 'revision-current',
		listId: 'list-current',
		category: 'restaurant',
		revision: 1,
		activePlaceIds: placeIds,
		orderedTiers: placeIds.map((placeId) => ({ placeIds: [placeId] })),
		unresolvedRelations: [],
		activeEvidence: [],
		excludedEvidence: [],
		rankingEngineVersion: 'ranking-v3-manual-placement',
		provenance: 'internal-testing',
		publishedAt: '2026-08-31T09:00:00.000Z'
	};
}

describe('versioned recommendation artifacts', () => {
	it('separates real and synthetic contributors and builds reproducibly', () => {
		const real = ranking('real-user', ['a', 'b']);
		const synthetic = ranking('synthetic-user', ['b', 'c']);
		const base = dataset([real, synthetic]);
		const mixed = {
			...base,
			invalidationInputs: base.invalidationInputs.map((item) =>
				item.userId === 'synthetic-user' ? { ...item, provenance: 'synthetic' as const } : item
			)
		};
		const first = buildRecommendationArtifact({
			id: 'fixed',
			category: 'restaurant',
			dataClass: 'real',
			dataset: mixed,
			catalogueFingerprint: 'catalogue',
			generatedAt: new Date('2026-08-31T10:00:00.000Z')
		});
		const second = buildRecommendationArtifact({
			id: 'fixed',
			category: 'restaurant',
			dataClass: 'real',
			dataset: mixed,
			catalogueFingerprint: 'catalogue',
			generatedAt: new Date('2026-08-31T10:00:00.000Z')
		});

		expect(first.rankings.map((item) => item.userId)).toEqual(['real-user']);
		expect(first.placeSupport).toEqual({ a: 1, b: 1 });
		expect(encodeRecommendationArtifact(first)).toEqual(encodeRecommendationArtifact(second));
	});

	it('applies the provisional gate and returns a stable score/place-id order', () => {
		const rankings = Array.from({ length: 4 }, (_, userIndex) => {
			const userId = `community-${userIndex}`;
			return ranking(userId, ['a', 'b', 'c', 'd', 'e']);
		});
		const built = artifact(rankings);
		const current = revision(['a', 'b', 'c', 'd', 'e']);
		const result = scoreRecommendationCandidates({
			userId: 'current-user',
			revision: current,
			artifact: built,
			candidatePlaceIds: ['e', 'd', 'c', 'b', 'a'],
			visitedPlaceIds: new Set(['a', 'b', 'c', 'd', 'e'])
		});

		expect(deriveServingGate('current-user', current, built).mode).toBe('personalized');
		expect(result.scores.map((item) => item.placeId)).toEqual(['a', 'b', 'c', 'd', 'e']);
		expect(result.scores.every((item) => item.supported && item.visited)).toBe(true);
	});

	it('does not claim a community order when no place crosses the support threshold', () => {
		const underSupported = artifact(
			Array.from({ length: 3 }, (_, userIndex) => ranking(`community-${userIndex}`, ['a', 'b']))
		);
		const supported = artifact(
			Array.from({ length: 4 }, (_, userIndex) => ranking(`community-${userIndex}`, ['a', 'b']))
		);

		expect(underSupported.observationCount).toBeGreaterThan(0);
		expect(deriveServingGate('current-user', undefined, underSupported).mode).toBe(
			'insufficient-evidence'
		);
		expect(deriveServingGate('current-user', undefined, supported).mode).toBe('community-prior');
	});

	it('does not let review-shaped data alter artifacts or scores', () => {
		const built = artifact([ranking('u1', ['a', 'b'])]);
		const snapshot = (value: RecommendationArtifact) => ({
			bytes: encodeRecommendationArtifact(value),
			scores: scoreRecommendationCandidates({
				userId: 'u2',
				artifact: value,
				candidatePlaceIds: ['a', 'b'],
				visitedPlaceIds: new Set<string>()
			}).scores
		});
		const before = snapshot(built);
		const reviewMutation = {
			body: 'Public review text',
			serviceDate: '2026-08-01',
			moderationState: 'removed',
			count: 99
		};
		reviewMutation.body = 'Changed';
		reviewMutation.count += 1;

		expect(snapshot(built)).toEqual(before);
	});
});
