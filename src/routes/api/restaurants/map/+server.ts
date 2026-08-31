import { error, json } from '@sveltejs/kit';
import { runtimeConfig } from '$lib/server/config';
import { db } from '$lib/server/db';
import { requireUser } from '$lib/server/http/auth-guard';
import {
	MapCatalogueRepository,
	type RestaurantMapBounds
} from '$lib/server/repositories/map-catalogue';
import { ParticipationRepository } from '$lib/server/repositories/participation';
import { RankingRepository } from '$lib/server/repositories/rankings';
import {
	mapCatalogueRateLimitPolicy,
	MemoryFixedWindowRateLimiter
} from '$lib/server/security/rate-limit';
import { RankingService } from '$lib/server/services/rankings';
import type { RequestHandler } from './$types';

const catalogue = new MapCatalogueRepository(db);
const rankingRepository = new RankingRepository(db);
const participation = new ParticipationRepository(db);
const rankings = new RankingService(rankingRepository, participation, runtimeConfig.appEnvironment);
const limiter = new MemoryFixedWindowRateLimiter();

function finiteNumber(value: unknown) {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseRequest(value: unknown) {
	if (!value || typeof value !== 'object') return undefined;
	const candidate = value as { bounds?: Record<string, unknown>; zoom?: unknown };
	const south = finiteNumber(candidate.bounds?.south);
	const west = finiteNumber(candidate.bounds?.west);
	const north = finiteNumber(candidate.bounds?.north);
	const east = finiteNumber(candidate.bounds?.east);
	const zoom = finiteNumber(candidate.zoom);
	if (
		south === undefined ||
		west === undefined ||
		north === undefined ||
		east === undefined ||
		zoom === undefined ||
		south < -90 ||
		north > 90 ||
		west < -180 ||
		east > 180 ||
		south >= north ||
		west >= east ||
		north - south > 50 ||
		east - west > 80 ||
		zoom < 4 ||
		zoom > 19
	)
		return undefined;
	return {
		bounds: { south, west, north, east } satisfies RestaurantMapBounds,
		zoom: Math.round(zoom)
	};
}

export const POST: RequestHandler = async (event) => {
	const user = requireUser(event);
	const rate = await limiter.consume({
		purpose: 'map-catalogue',
		key: user.id,
		policy: mapCatalogueRateLimitPolicy
	});
	if (!rate.allowed) error(429, { message: 'Too many map updates. Please wait a moment.' });
	let request;
	try {
		request = parseRequest(await event.request.json());
	} catch {
		error(400, { message: 'A valid map viewport is required.' });
	}
	if (!request) error(400, { message: 'A valid map viewport is required.' });
	const capture = await rankings.captureContext(user.id);
	const dataClass = capture.provenance === 'synthetic' ? 'synthetic' : 'real';
	return json(await catalogue.viewport({ dataClass, ...request }), {
		headers: { 'Cache-Control': 'private, no-store' }
	});
};
