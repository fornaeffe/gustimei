import { describe, expect, it } from 'vitest';
import { PERSONAL_COMMENT_MAX_LENGTH, PersonalCommentCollection } from '../personal-comments';
import type { ComparisonEvidence } from '../ranking/contracts';
import { createRankingRevision } from '../ranking/revision';
import { PolicyEnforcedRecommendationEvidenceSource } from './evidence';
import { trainGlobalPrior, type TieredRanking } from './models';
import { MandatoryContributionPolicy } from './policy';

describe('personal-comment isolation contract', () => {
	it('normalizes line endings and enforces the provisional domain limit', () => {
		const comments = new PersonalCommentCollection();
		comments.upsert({
			ownerId: 'user-1',
			placeId: 'a',
			body: 'First\r\nSecond\rThird',
			updatedAt: '2026-08-14T00:00:00.000Z'
		});

		expect(comments.get('user-1', 'a')?.body).toBe('First\nSecond\nThird');
		expect(() =>
			comments.upsert({
				ownerId: 'user-1',
				placeId: 'a',
				body: 'x'.repeat(PERSONAL_COMMENT_MAX_LENGTH + 1),
				updatedAt: '2026-08-14T00:00:00.000Z'
			})
		).toThrow('limited');
	});

	it('cannot affect ranking, evidence extraction, scores, or invalidation inputs', () => {
		const comparison: ComparisonEvidence = {
			id: 'comparison-1',
			logicalPair: ['a', 'b'],
			sequence: 1,
			leftPlaceId: 'a',
			rightPlaceId: 'b',
			outcome: 'left',
			reason: 'initial-order',
			active: true
		};
		const ranking = createRankingRevision({
			id: 'revision-1',
			listId: 'list-1',
			category: 'restaurant',
			revision: 1,
			activePlaceIds: ['a', 'b'],
			evidence: [comparison],
			provenance: 'synthetic',
			publishedAt: '2026-08-14T00:00:00.000Z'
		});
		const source = new PolicyEnforcedRecommendationEvidenceSource(
			[
				{
					userId: 'user-1',
					revision: ranking,
					policyContext: {
						environment: 'test',
						accountDeleted: false,
						categoryDeleted: false,
						currentRevision: true,
						evidenceValid: true,
						restrictedPurposes: []
					}
				}
			],
			new MandatoryContributionPolicy()
		);
		const modelInput: TieredRanking[] = [
			{ userId: 'user-1', category: 'restaurant', tiers: [['a'], ['b']] },
			{ userId: 'user-2', category: 'restaurant', tiers: [['a'], ['c'], ['b']] }
		];
		const model = trainGlobalPrior(modelInput);
		const snapshot = () => ({
			ranking: structuredClone(ranking),
			dataset: source.read('community-model-training'),
			scores: ['a', 'b', 'c'].map((placeId) => model.score('user-1', placeId))
		});
		const before = snapshot();
		const comments = new PersonalCommentCollection();

		comments.upsert({
			ownerId: 'user-1',
			placeId: 'a',
			body: 'A private memory.\r\nStill private.',
			updatedAt: '2026-08-14T01:00:00.000Z'
		});
		expect(snapshot()).toEqual(before);
		comments.upsert({
			ownerId: 'user-1',
			placeId: 'a',
			body: 'Edited private memory.',
			updatedAt: '2026-08-14T02:00:00.000Z'
		});
		expect(snapshot()).toEqual(before);
		comments.delete('user-1', 'a');
		expect(snapshot()).toEqual(before);
	});
});
