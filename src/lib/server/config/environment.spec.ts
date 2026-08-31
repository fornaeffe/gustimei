import { describe, expect, it } from 'vitest';
import { loadEnvironment } from './environment';

const validEnvironment = {
	APP_ENV: 'test',
	DATABASE_URL: 'postgres://gustimei:test@localhost:5433/gustimei_test',
	ORIGIN: 'http://127.0.0.1:3000',
	BETTER_AUTH_SECRET: 'a-test-secret-with-at-least-32-characters'
};

describe('loadEnvironment', () => {
	it('validates and returns a named environment configuration', () => {
		expect(loadEnvironment(validEnvironment)).toEqual({
			appEnvironment: 'test',
			databaseUrl: validEnvironment.DATABASE_URL,
			origin: validEnvironment.ORIGIN,
			betterAuthSecret: validEnvironment.BETTER_AUTH_SECRET,
			mapTileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
			geocodingBaseUrl: 'https://nominatim.openstreetmap.org'
		});
	});

	it('does not require runtime secrets while SvelteKit is building', () => {
		expect(loadEnvironment({}, { building: true }).databaseUrl).toContain('/build');
	});

	it.each(['DATABASE_URL', 'ORIGIN', 'BETTER_AUTH_SECRET'] as const)(
		'rejects a missing %s',
		(key) => {
			expect(() => loadEnvironment({ ...validEnvironment, [key]: '' })).toThrow(
				`${key} is required`
			);
		}
	);

	it('requires HTTPS in production', () => {
		expect(() => loadEnvironment({ ...validEnvironment, APP_ENV: 'production' })).toThrow(
			'ORIGIN must use https in production'
		);
	});

	it('defaults a production Node process to the production boundary', () => {
		expect(() =>
			loadEnvironment({ ...validEnvironment, APP_ENV: undefined, NODE_ENV: 'production' })
		).toThrow('ORIGIN must use https in production');
	});

	it('accepts configurable OSM-derived tile and geocoding providers', () => {
		const config = loadEnvironment({
			...validEnvironment,
			OSM_TILE_URL: 'https://tiles.example.test/{z}/{x}/{y}.png',
			GEOCODING_BASE_URL: 'https://geocoder.example.test/nominatim/'
		});
		expect(config.mapTileUrl).toBe('https://tiles.example.test/{z}/{x}/{y}.png');
		expect(config.geocodingBaseUrl).toBe('https://geocoder.example.test/nominatim');
	});

	it('rejects tile URLs without the required coordinate placeholders', () => {
		expect(() =>
			loadEnvironment({ ...validEnvironment, OSM_TILE_URL: 'https://tiles.example.test/map.png' })
		).toThrow('OSM_TILE_URL must include {z}, {x}, and {y} placeholders');
	});

	it('requires HTTPS map providers in production', () => {
		expect(() =>
			loadEnvironment({
				...validEnvironment,
				APP_ENV: 'production',
				ORIGIN: 'https://gustimei.example.test',
				OSM_TILE_URL: 'http://tiles.example.test/{z}/{x}/{y}.png'
			})
		).toThrow('Map and geocoding providers must use https in production');
	});
});
