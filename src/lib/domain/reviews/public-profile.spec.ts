import { describe, expect, it } from 'vitest';
import { normalizePseudonym } from './public-profile';

describe('public pseudonyms', () => {
	it('normalizes spacing and case without exposing an auth identity', () => {
		expect(normalizePseudonym('  Tavola   Curiosa  ')).toEqual({
			display: 'Tavola Curiosa',
			key: 'tavola curiosa'
		});
	});

	it.each(['ab', 'GustiMei', '<script>', 'name/route'])(
		'rejects unsafe or reserved value %s',
		(value) => {
			expect(() => normalizePseudonym(value)).toThrow();
		}
	);
});
