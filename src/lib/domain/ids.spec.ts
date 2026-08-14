import { describe, expect, it } from 'vitest';
import { newApplicationId } from './ids';

describe('newApplicationId', () => {
	it('creates RFC 4122 UUID application identifiers', () => {
		expect(newApplicationId()).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
		);
	});
});
