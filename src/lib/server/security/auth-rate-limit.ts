import { createHash } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import type { RateLimitPolicy, RateLimitResult, RateLimiter } from './rate-limit';

export type AuthRateLimitAction = 'sign-up' | 'sign-in' | 'verification-resend' | 'password-reset';

export const authRateLimitPolicies: Record<AuthRateLimitAction, RateLimitPolicy> = {
	'sign-up': { limit: 5, windowMs: 60 * 60_000 },
	'sign-in': { limit: 10, windowMs: 15 * 60_000 },
	'verification-resend': { limit: 3, windowMs: 60 * 60_000 },
	'password-reset': { limit: 3, windowMs: 60 * 60_000 }
};

export interface ClientAddressResolver {
	resolve(event: RequestEvent): string;
}

export class DirectClientAddressResolver implements ClientAddressResolver {
	resolve(event: RequestEvent) {
		try {
			return event.getClientAddress();
		} catch {
			return 'unavailable';
		}
	}
}

export function opaqueAuthKey(value: string) {
	return createHash('sha256').update(value.trim().toLocaleLowerCase('en-US')).digest('hex');
}

export async function consumeAuthRateLimit(input: {
	limiter: RateLimiter;
	action: AuthRateLimitAction;
	event: RequestEvent;
	accountIdentifier?: string;
	addressResolver?: ClientAddressResolver;
}): Promise<RateLimitResult> {
	const resolver = input.addressResolver ?? new DirectClientAddressResolver();
	const address = resolver.resolve(input.event);
	const parts = [`ip:${opaqueAuthKey(address)}`];
	if (input.accountIdentifier) parts.push(`account:${opaqueAuthKey(input.accountIdentifier)}`);
	return input.limiter.consume({
		purpose: 'auth',
		key: `${input.action}:${parts.join(':')}`,
		policy: authRateLimitPolicies[input.action]
	});
}
