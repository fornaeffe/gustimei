export type RateLimitPurpose =
	| 'auth'
	| 'review-author-mutation'
	| 'review-notice'
	| 'review-case-message'
	| 'review-case-access'
	| 'review-evidence-upload'
	| 'review-moderator-action'
	| 'review-redress'
	| 'geocoding'
	| 'map-catalogue';

export interface RateLimitPolicy {
	limit: number;
	windowMs: number;
}

export interface RateLimitRequest {
	purpose: RateLimitPurpose;
	key: string;
	policy: RateLimitPolicy;
}

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	retryAt: Date;
}

export interface RateLimiter {
	consume(request: RateLimitRequest): Promise<RateLimitResult>;
}

export const reviewRateLimitPolicies: Readonly<
	Record<Exclude<RateLimitPurpose, 'auth' | 'geocoding' | 'map-catalogue'>, RateLimitPolicy>
> = {
	'review-author-mutation': { limit: 10, windowMs: 60 * 60_000 },
	'review-notice': { limit: 5, windowMs: 60 * 60_000 },
	'review-case-message': { limit: 10, windowMs: 24 * 60 * 60_000 },
	'review-case-access': { limit: 5, windowMs: 60 * 60_000 },
	'review-evidence-upload': { limit: 5, windowMs: 24 * 60 * 60_000 },
	'review-moderator-action': { limit: 100, windowMs: 60 * 60_000 },
	'review-redress': { limit: 3, windowMs: 30 * 24 * 60 * 60_000 }
};

export const geocodingRateLimitPolicy: RateLimitPolicy = {
	limit: 30,
	windowMs: 60 * 60_000
};

export const mapCatalogueRateLimitPolicy: RateLimitPolicy = {
	limit: 240,
	windowMs: 60_000
};

interface WindowState {
	count: number;
	startsAt: number;
}

export class MemoryFixedWindowRateLimiter implements RateLimiter {
	readonly #windows = new Map<string, WindowState>();

	constructor(private readonly clock: () => Date = () => new Date()) {}

	async consume(request: RateLimitRequest): Promise<RateLimitResult> {
		const now = this.clock().getTime();
		const compositeKey = `${request.purpose}:${request.key}`;
		let state = this.#windows.get(compositeKey);
		if (!state || now >= state.startsAt + request.policy.windowMs) {
			state = { count: 0, startsAt: now };
			this.#windows.set(compositeKey, state);
		}
		const retryAt = new Date(state.startsAt + request.policy.windowMs);
		if (state.count >= request.policy.limit) {
			return { allowed: false, remaining: 0, retryAt };
		}
		state.count += 1;
		return {
			allowed: true,
			remaining: Math.max(0, request.policy.limit - state.count),
			retryAt
		};
	}
}
