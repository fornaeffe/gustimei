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
			betterAuthSecret: validEnvironment.BETTER_AUTH_SECRET
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
});
