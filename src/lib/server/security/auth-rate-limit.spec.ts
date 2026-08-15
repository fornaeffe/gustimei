import { describe, expect, it } from 'vitest';
import { MemoryFixedWindowRateLimiter } from './rate-limit';
import { authRateLimitPolicies, opaqueAuthKey } from './auth-rate-limit';

describe('authentication rate-limit policy', () => {
	it('uses purpose-specific limits and opaque identifiers', async () => {
		const limiter = new MemoryFixedWindowRateLimiter(() => new Date('2026-08-15T12:00:00Z'));
		const policy = authRateLimitPolicies['verification-resend'];
		const key = `verification-resend:account:${opaqueAuthKey('Person@Example.test')}`;
		for (let index = 0; index < policy.limit; index += 1) {
			expect((await limiter.consume({ purpose: 'auth', key, policy })).allowed).toBe(true);
		}
		expect((await limiter.consume({ purpose: 'auth', key, policy })).allowed).toBe(false);
		expect(key).not.toContain('person@example.test');
	});
});
