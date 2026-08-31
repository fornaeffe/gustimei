export const appEnvironments = ['development', 'test', 'preview', 'production'] as const;

export type AppEnvironment = (typeof appEnvironments)[number];

export interface RuntimeConfig {
	appEnvironment: AppEnvironment;
	databaseUrl: string;
	origin: string;
	betterAuthSecret: string;
	mapTileUrl: string;
	geocodingBaseUrl: string;
}

interface LoadEnvironmentOptions {
	building?: boolean;
}

const BUILD_CONFIG: RuntimeConfig = {
	appEnvironment: 'development',
	databaseUrl: 'postgres://build:build@127.0.0.1:5432/build',
	origin: 'http://127.0.0.1:3000',
	betterAuthSecret: 'build-only-secret-never-used-at-runtime',
	mapTileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
	geocodingBaseUrl: 'https://nominatim.openstreetmap.org'
};

function readAppEnvironment(value: string | undefined, nodeEnvironment: string | undefined) {
	const candidate =
		value ??
		(nodeEnvironment === 'test'
			? 'test'
			: nodeEnvironment === 'production'
				? 'production'
				: 'development');

	if (!appEnvironments.includes(candidate as AppEnvironment)) {
		throw new Error(`APP_ENV must be one of: ${appEnvironments.join(', ')}`);
	}

	return candidate as AppEnvironment;
}

function requireValue(source: Record<string, string | undefined>, key: string) {
	const value = source[key]?.trim();

	if (!value) throw new Error(`${key} is required`);

	return value;
}

function requireUrl(value: string, key: string, protocols: string[]) {
	let url: URL;

	try {
		url = new URL(value);
	} catch {
		throw new Error(`${key} must be a valid URL`);
	}

	if (!protocols.includes(url.protocol)) {
		throw new Error(`${key} must use ${protocols.join(' or ')}`);
	}

	return url;
}

export function loadEnvironment(
	source: Record<string, string | undefined>,
	options: LoadEnvironmentOptions = {}
): RuntimeConfig {
	if (options.building) return BUILD_CONFIG;

	const appEnvironment = readAppEnvironment(source.APP_ENV, source.NODE_ENV);
	const databaseUrl = requireValue(source, 'DATABASE_URL');
	const origin = requireValue(source, 'ORIGIN');
	const betterAuthSecret = requireValue(source, 'BETTER_AUTH_SECRET');
	const mapTileUrl =
		source.OSM_TILE_URL?.trim() || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
	const geocodingBaseUrl =
		source.GEOCODING_BASE_URL?.trim() || 'https://nominatim.openstreetmap.org';

	requireUrl(databaseUrl, 'DATABASE_URL', ['postgres:', 'postgresql:']);
	const parsedOrigin = requireUrl(origin, 'ORIGIN', ['http:', 'https:']);
	const parsedGeocodingBaseUrl = requireUrl(geocodingBaseUrl, 'GEOCODING_BASE_URL', [
		'http:',
		'https:'
	]);
	if (!mapTileUrl.includes('{z}') || !mapTileUrl.includes('{x}') || !mapTileUrl.includes('{y}')) {
		throw new Error('OSM_TILE_URL must include {z}, {x}, and {y} placeholders');
	}
	const parsedMapTileUrl = requireUrl(
		mapTileUrl.replace('{z}', '0').replace('{x}', '0').replace('{y}', '0'),
		'OSM_TILE_URL',
		['http:', 'https:']
	);

	if (parsedOrigin.pathname !== '/' || parsedOrigin.search || parsedOrigin.hash) {
		throw new Error('ORIGIN must not include a path, query, or fragment');
	}

	if (appEnvironment === 'production' && parsedOrigin.protocol !== 'https:') {
		throw new Error('ORIGIN must use https in production');
	}
	if (
		appEnvironment === 'production' &&
		(parsedMapTileUrl.protocol !== 'https:' || parsedGeocodingBaseUrl.protocol !== 'https:')
	) {
		throw new Error('Map and geocoding providers must use https in production');
	}

	if (betterAuthSecret.length < 32) {
		throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters');
	}

	return {
		appEnvironment,
		databaseUrl,
		origin: parsedOrigin.origin,
		betterAuthSecret,
		mapTileUrl,
		geocodingBaseUrl:
			parsedGeocodingBaseUrl.origin + parsedGeocodingBaseUrl.pathname.replace(/\/$/, '')
	};
}
