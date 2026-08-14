export const appEnvironments = ['development', 'test', 'preview', 'production'] as const;

export type AppEnvironment = (typeof appEnvironments)[number];

export interface RuntimeConfig {
	appEnvironment: AppEnvironment;
	databaseUrl: string;
	origin: string;
	betterAuthSecret: string;
}

interface LoadEnvironmentOptions {
	building?: boolean;
}

const BUILD_CONFIG: RuntimeConfig = {
	appEnvironment: 'development',
	databaseUrl: 'postgres://build:build@127.0.0.1:5432/build',
	origin: 'http://127.0.0.1:3000',
	betterAuthSecret: 'build-only-secret-never-used-at-runtime'
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

	requireUrl(databaseUrl, 'DATABASE_URL', ['postgres:', 'postgresql:']);
	const parsedOrigin = requireUrl(origin, 'ORIGIN', ['http:', 'https:']);

	if (parsedOrigin.pathname !== '/' || parsedOrigin.search || parsedOrigin.hash) {
		throw new Error('ORIGIN must not include a path, query, or fragment');
	}

	if (appEnvironment === 'production' && parsedOrigin.protocol !== 'https:') {
		throw new Error('ORIGIN must use https in production');
	}

	if (betterAuthSecret.length < 32) {
		throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters');
	}

	return { appEnvironment, databaseUrl, origin: parsedOrigin.origin, betterAuthSecret };
}
