import { describe, expect, it } from 'vitest';
import { MemoryFixedWindowRateLimiter } from './rate-limit';

describe('purpose-scoped rate limiting', () => {
	it('isolates purposes and resets on an injectable clock boundary', async () => {
		let now = new Date('2026-08-15T00:00:00Z');
		const limiter = new MemoryFixedWindowRateLimiter(() => now);
		const request = {
			purpose: 'review-notice' as const,
			key: 'person',
			policy: { limit: 1, windowMs: 1_000 }
		};
		expect((await limiter.consume(request)).allowed).toBe(true);
		expect((await limiter.consume(request)).allowed).toBe(false);
		expect((await limiter.consume({ ...request, purpose: 'review-redress' })).allowed).toBe(true);
		now = new Date('2026-08-15T00:00:01Z');
		expect((await limiter.consume(request)).allowed).toBe(true);
	});
});
