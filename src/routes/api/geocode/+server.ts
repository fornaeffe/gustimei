import { error, json } from '@sveltejs/kit';
import { runtimeConfig } from '$lib/server/config';
import { requireUser } from '$lib/server/http/auth-guard';
import { currentLocale } from '$lib/server/http/locale';
import {
	geocodingRateLimitPolicy,
	MemoryFixedWindowRateLimiter
} from '$lib/server/security/rate-limit';
import { NominatimGeocoder } from '$lib/server/services/geocoding';
import type { RequestHandler } from './$types';

const geocoder = new NominatimGeocoder(runtimeConfig.geocodingBaseUrl, runtimeConfig.origin);
const limiter = new MemoryFixedWindowRateLimiter();

export const POST: RequestHandler = async (event) => {
	const user = requireUser(event);
	let query = '';
	try {
		const body = (await event.request.json()) as { query?: unknown };
		query = typeof body.query === 'string' ? body.query : '';
	} catch {
		error(400, { message: 'A valid location search is required.' });
	}
	const rate = await limiter.consume({
		purpose: 'geocoding',
		key: user.id,
		policy: geocodingRateLimitPolicy
	});
	if (!rate.allowed) {
		error(429, { message: 'Too many location searches. Please try again later.' });
	}
	try {
		return json({ results: await geocoder.search(query, currentLocale()) });
	} catch (cause) {
		if (cause instanceof Error && cause.message.includes('between 2 and 160')) {
			error(400, { message: cause.message });
		}
		error(503, { message: 'Location search is temporarily unavailable.' });
	}
};
