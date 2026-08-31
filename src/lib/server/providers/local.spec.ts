import { describe, expect, it } from 'vitest';
import { createLocalProviders, LocalEmailProvider } from './local';
import type { RuntimeConfig } from '$lib/server/config/environment';

const config: RuntimeConfig = {
	appEnvironment: 'test',
	databaseUrl: 'postgres://gustimei:test@localhost/gustimei_test',
	origin: 'http://127.0.0.1:3000',
	betterAuthSecret: 'a-test-secret-with-at-least-32-characters',
	mapTileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
	geocodingBaseUrl: 'https://nominatim.openstreetmap.org'
};

describe('local provider adapters', () => {
	it('keep transactional email inside the local outbox', async () => {
		const providers = createLocalProviders(config);
		const email = providers.email as LocalEmailProvider;

		await email.send({
			recipient: 'person@example.test',
			template: 'verify-email',
			variables: { link: 'http://127.0.0.1/verify' }
		});

		expect(email.outbox).toHaveLength(1);
	});

	it('copies artifact bytes at the storage boundary', async () => {
		const providers = createLocalProviders(config);
		const source = new Uint8Array([1, 2, 3]);

		await providers.artifacts.put('model/test', source);
		source[0] = 9;

		expect(await providers.artifacts.get('model/test')).toEqual(new Uint8Array([1, 2, 3]));
	});
});
