import { describe, expect, it } from 'vitest';
import type { ComparisonEvidence } from '../ranking/contracts';
import { createRankingRevision } from '../ranking/revision';
import { PolicyEnforcedRecommendationEvidenceSource } from './evidence';
import { MandatoryContributionPolicy, OptionalContributionPolicyFixture } from './policy';

const evidence: ComparisonEvidence[] = [
	{
		id: 'comparison-1',
		logicalPair: ['a', 'b'],
		sequence: 1,
		leftPlaceId: 'a',
		rightPlaceId: 'b',
		outcome: 'left',
		reason: 'initial-order',
		active: true
	}
];

const ranking = createRankingRevision({
	id: 'revision-1',
	listId: 'list-1',
	category: 'restaurant',
	revision: 1,
	activePlaceIds: ['a', 'b'],
	evidence,
	provenance: 'synthetic',
	publishedAt: '2026-08-14T00:00:00.000Z'
});

const baseContext = {
	environment: 'test' as const,
	accountDeleted: false,
	categoryDeleted: false,
	currentRevision: true,
	evidenceValid: true,
	restrictedPurposes: []
};

describe('purpose-specific contribution policies', () => {
	it('includes eligible current evidence under the mandatory MVP policy', () => {
		const source = new PolicyEnforcedRecommendationEvidenceSource(
			[{ userId: 'user-1', revision: ranking, policyContext: baseContext }],
			new MandatoryContributionPolicy()
		);

		for (const purpose of ['community-model-training', 'current-user-personalization'] as const) {
			const dataset = source.read(purpose);
			expect(dataset.observations).toHaveLength(1);
			expect(dataset.decisions[0]).toMatchObject({
				decision: 'include',
				reason: 'eligible',
				purpose
			});
			expect(dataset.invalidationInputs[0].evidenceFingerprint).toContain('comparison-1');
		}
	});

	it('keeps optional fixture choices out of private ranking behavior and separates purposes', () => {
		const source = new PolicyEnforcedRecommendationEvidenceSource(
			[
				{
					userId: 'user-1',
					revision: ranking,
					policyContext: {
						...baseContext,
						optionalContribution: {
							'community-model-training': false,
							'current-user-personalization': true
						}
					}
				}
			],
			new OptionalContributionPolicyFixture()
		);

		expect(source.read('community-model-training')).toMatchObject({
			observations: [],
			exclusionCounts: { 'optional-policy-disabled': 1 }
		});
		expect(source.read('current-user-personalization').observations).toHaveLength(1);
		expect(ranking.activeEvidence).toEqual(evidence);
	});

	it('uses stable, non-sensitive exclusion precedence and invalidation inputs', () => {
		const source = new PolicyEnforcedRecommendationEvidenceSource(
			[
				{
					userId: 'user-1',
					revision: ranking,
					policyContext: {
						...baseContext,
						accountDeleted: true,
						categoryDeleted: true,
						restrictedPurposes: ['community-model-training']
					}
				}
			],
			new MandatoryContributionPolicy()
		);
		const dataset = source.read('community-model-training');

		expect(dataset.decisions[0].reason).toBe('account-deleted');
		expect(dataset.invalidationInputs[0]).toMatchObject({
			decision: 'exclude',
			reason: 'account-deleted',
			evidenceFingerprint: ''
		});
	});

	it('isolates synthetic evidence from preview and production builds', () => {
		const source = new PolicyEnforcedRecommendationEvidenceSource(
			[
				{
					userId: 'user-1',
					revision: ranking,
					policyContext: { ...baseContext, environment: 'production' }
				}
			],
			new MandatoryContributionPolicy()
		);

		expect(source.read('community-model-training').decisions[0].reason).toBe('synthetic-isolation');
	});
});
