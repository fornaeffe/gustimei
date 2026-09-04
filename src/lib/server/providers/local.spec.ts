import { describe, expect, it } from 'vitest';
import {
	createArtifactStore,
	createLocalProviders,
	LocalBackgroundJobProvider,
	LocalEmailProvider,
	LocalJobLockProvider
} from './local';
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

	it('deduplicates background jobs inside an explicit environment and category scope', async () => {
		const jobs = new LocalBackgroundJobProvider();
		const job = {
			name: 'recommendation-rebuild',
			idempotencyKey: 'revision-42',
			scope: { environment: 'test' as const, category: 'restaurant' as const },
			payload: {}
		};

		await jobs.enqueue(job);
		await jobs.enqueue(job);

		expect(jobs.queue).toEqual([job]);
	});

	it('does not grant the same job lock until its owner releases it', async () => {
		const locks = new LocalJobLockProvider();
		const release = await locks.acquire('test:restaurant:recommendation-rebuild');

		expect(release).toBeTypeOf('function');
		expect(await locks.acquire('test:restaurant:recommendation-rebuild')).toBeUndefined();
		await release?.();
		expect(await locks.acquire('test:restaurant:recommendation-rebuild')).toBeTypeOf('function');
	});

	it('fails closed for hosted artifact storage until Phase 9 installs an adapter', async () => {
		const artifacts = createArtifactStore('production');

		await expect(
			artifacts.get('recommendations/production/real/restaurant/current')
		).rejects.toThrow('Artifact storage is not configured');
	});

	it('rejects the complete local provider set in preview and production', () => {
		expect(() => createLocalProviders({ ...config, appEnvironment: 'preview' })).toThrow(
			'Local providers are forbidden'
		);
	});
});
