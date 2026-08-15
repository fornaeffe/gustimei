import { describe, expect, it } from 'vitest';
import {
	assertServiceDateEligible,
	deriveExpiresAt,
	derivePublicPresentation,
	italianCalendarDate,
	normalizeReviewBody,
	publicServiceMonth,
	requireDeclarations
} from './policy';

describe('review publication policy', () => {
	it('uses the Italian calendar at UTC day boundaries and enforces the provisional window', () => {
		const now = new Date('2026-08-15T22:30:00.000Z');
		expect(italianCalendarDate(now)).toBe('2026-08-16');
		expect(assertServiceDateEligible('2026-07-17', now)).toBe('2026-07-17');
		expect(() => assertServiceDateEligible('2026-07-16', now)).toThrow('within 30 days');
		expect(() => assertServiceDateEligible('2026-08-17', now)).toThrow('future');
	});

	it('normalizes plain text and requires every declaration', () => {
		expect(normalizeReviewBody('  useful\r\nnotes  ')).toBe('useful\nnotes');
		expect(() => normalizeReviewBody('<'.repeat(2_001))).toThrow('2000');
		expect(() =>
			requireDeclarations({
				personallyUsedService: true,
				contentConcernsExperience: false,
				noIncentive: true
			})
		).toThrow('Every');
	});

	it('derives immutable expiry and public presentation without exposing the exact day', () => {
		const publishedAt = new Date('2024-02-29T12:00:00.000Z');
		expect(deriveExpiresAt(publishedAt)).toEqual(new Date('2026-03-01T12:00:00.000Z'));
		expect(publicServiceMonth('2026-08-15', 'en')).toBe('August 2026');
		expect(
			derivePublicPresentation({
				lifecycle: 'published',
				expiresAt: new Date('2026-08-16T00:00:00Z'),
				now: new Date('2026-08-15T00:00:00Z'),
				openNoticeCount: 1,
				placeIsPublic: true
			})
		).toEqual({ publiclyVisible: true, presentation: 'disputed' });
	});
});
