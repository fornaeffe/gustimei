import { describe, expect, it } from 'vitest';
import { reviewCaseAction, reviewCaseEvidencePath } from './case-routes';

describe('review case routes', () => {
	it('builds an absolute internal moderator evidence path', () => {
		expect(
			reviewCaseEvidencePath({
				audience: 'moderator',
				noticeId: 'notice-1',
				evidenceId: 'evidence-1'
			})
		).toBe('/internal/reviews/moderation/notice-1/evidence/evidence-1');
	});

	it('builds an absolute party path and safely encodes its case token', () => {
		expect(
			reviewCaseEvidencePath({
				audience: 'party',
				noticeId: 'notice/1',
				evidenceId: 'evidence 1',
				token: 'token+value/='
			})
		).toBe('/reviews/cases/notice%2F1/evidence/evidence%201?token=token%2Bvalue%2F%3D');
	});

	it('preserves notifier authorization in enhanced case actions', () => {
		expect(reviewCaseAction('redress', 'token+value/=')).toBe(
			'?/redress&token=token%2Bvalue%2F%3D'
		);
		expect(reviewCaseAction('statement')).toBe('?/statement');
	});
});
