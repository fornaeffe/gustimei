import { describe, expect, it } from 'vitest';
import { loadProductionDeploymentEnvironment } from './deployment';

const digest = `sha256:${'a'.repeat(64)}`;
const valid = {
	APP_ENV: 'production',
	GUSTIMEI_IMAGE: `ghcr.io/example/gustimei@${digest}`,
	GUSTIMEI_OPS_IMAGE: `ghcr.io/example/gustimei-ops@${digest}`,
	DATABASE_URL: 'postgres://gustimei_runtime:secret@database:5432/gustimei',
	MIGRATION_DATABASE_URL: 'postgres://gustimei_migration:secret@database:5432/gustimei',
	BACKUP_DATABASE_URL: 'postgres://gustimei_backup:secret@database:5432/gustimei',
	OPERATOR_DATABASE_URL: 'postgres://gustimei_operator:secret@database:5432/gustimei',
	DEPLOYMENT_SSH_PRINCIPAL: 'gustimei-deploy',
	R2_JURISDICTION: 'eu',
	R2_ENDPOINT: 'https://account.eu.r2.cloudflarestorage.com',
	R2_EVIDENCE_BUCKET: 'gustimei-production-evidence',
	R2_ARTIFACT_BUCKET: 'gustimei-production-artifacts',
	R2_BACKUP_BUCKET: 'gustimei-production-backups',
	BACKUP_AGE_RECIPIENT: 'age1testrecipient',
	BREVO_API_KEY: 'secret',
	R2_ACCESS_KEY_ID: 'secret',
	R2_SECRET_ACCESS_KEY: 'secret',
	BETTER_STACK_SOURCE_TOKEN: 'secret',
	BETTER_STACK_UPTIME_URL: 'https://uptime.betterstack.test/token',
	BETTER_STACK_CRON_REVIEW_URL: 'https://uptime.betterstack.test/review',
	BETTER_STACK_CRON_BACKUP_URL: 'https://uptime.betterstack.test/backup',
	BETTER_STACK_CRON_RECOMMENDATIONS_URL: 'https://uptime.betterstack.test/recommendations',
	EMAIL_PROVIDER: 'brevo',
	OBJECT_STORAGE_PROVIDER: 'cloudflare-r2',
	MONITORING_PROVIDER: 'better-stack',
	JOB_PROVIDER: 'durable'
};

describe('production deployment environment', () => {
	it('accepts immutable images, isolated credentials, and purpose-separated storage', () => {
		const config = loadProductionDeploymentEnvironment(valid);

		expect(config.r2.jurisdiction).toBe('eu');
		expect(config.providers).toEqual({
			email: 'brevo',
			objectStorage: 'cloudflare-r2',
			monitoring: 'better-stack',
			jobs: 'durable'
		});
	});

	it('rejects a mutable container tag', () => {
		expect(() =>
			loadProductionDeploymentEnvironment({
				...valid,
				GUSTIMEI_IMAGE: 'ghcr.io/example/gustimei:latest'
			})
		).toThrow('immutable sha256 digest');
	});

	it('rejects database credential reuse', () => {
		expect(() =>
			loadProductionDeploymentEnvironment({
				...valid,
				BACKUP_DATABASE_URL: valid.DATABASE_URL
			})
		).toThrow('database users must be distinct');
	});

	it('rejects storage purpose mixing', () => {
		expect(() =>
			loadProductionDeploymentEnvironment({
				...valid,
				R2_BACKUP_BUCKET: valid.R2_EVIDENCE_BUCKET
			})
		).toThrow('separate buckets');
	});

	it('rejects a non-EU object-storage contract', () => {
		expect(() =>
			loadProductionDeploymentEnvironment({ ...valid, R2_JURISDICTION: 'automatic' })
		).toThrow('R2_JURISDICTION must be eu');
	});
});
