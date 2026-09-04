const IMMUTABLE_IMAGE_PATTERN = /^[\w./-]+@sha256:[a-f0-9]{64}$/;

export interface ProductionDeploymentConfig {
	appImage: string;
	opsImage: string;
	runtimeDatabaseUrl: string;
	migrationDatabaseUrl: string;
	backupDatabaseUrl: string;
	operatorDatabaseUrl: string;
	deploymentSshPrincipal: string;
	r2: {
		jurisdiction: 'eu';
		endpoint: string;
		evidenceBucket: string;
		artifactBucket: string;
		backupBucket: string;
		ageRecipient: string;
	};
	providers: {
		email: 'brevo';
		objectStorage: 'cloudflare-r2';
		monitoring: 'better-stack';
		jobs: 'durable';
	};
}

function required(source: Record<string, string | undefined>, key: string) {
	const value = source[key]?.trim();
	if (!value) throw new Error(`${key} is required for a production deployment`);
	return value;
}

function exact(source: Record<string, string | undefined>, key: string, expected: string): string {
	const value = required(source, key);
	if (value !== expected) throw new Error(`${key} must be ${expected}`);
	return value;
}

function httpsUrl(value: string, key: string) {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error(`${key} must be a valid HTTPS URL`);
	}
	if (parsed.protocol !== 'https:') throw new Error(`${key} must be a valid HTTPS URL`);
	return parsed.toString().replace(/\/$/, '');
}

function postgresUrl(value: string, key: string) {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error(`${key} must be a PostgreSQL URL`);
	}
	if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.username) {
		throw new Error(`${key} must be a PostgreSQL URL with a dedicated user`);
	}
	return { value, username: decodeURIComponent(parsed.username), database: parsed.pathname };
}

export function loadProductionDeploymentEnvironment(
	source: Record<string, string | undefined>
): ProductionDeploymentConfig {
	if (source.APP_ENV !== 'production') {
		throw new Error('Deployment validation requires APP_ENV=production');
	}
	const appImage = required(source, 'GUSTIMEI_IMAGE');
	const opsImage = required(source, 'GUSTIMEI_OPS_IMAGE');
	for (const [key, image] of [
		['GUSTIMEI_IMAGE', appImage],
		['GUSTIMEI_OPS_IMAGE', opsImage]
	] as const) {
		if (!IMMUTABLE_IMAGE_PATTERN.test(image)) {
			throw new Error(`${key} must use an immutable sha256 digest`);
		}
	}

	const databaseEntries = [
		['DATABASE_URL', postgresUrl(required(source, 'DATABASE_URL'), 'DATABASE_URL')],
		[
			'MIGRATION_DATABASE_URL',
			postgresUrl(required(source, 'MIGRATION_DATABASE_URL'), 'MIGRATION_DATABASE_URL')
		],
		[
			'BACKUP_DATABASE_URL',
			postgresUrl(required(source, 'BACKUP_DATABASE_URL'), 'BACKUP_DATABASE_URL')
		],
		[
			'OPERATOR_DATABASE_URL',
			postgresUrl(required(source, 'OPERATOR_DATABASE_URL'), 'OPERATOR_DATABASE_URL')
		]
	] as const;
	if (new Set(databaseEntries.map(([, entry]) => entry.username)).size !== databaseEntries.length) {
		throw new Error('Runtime, migration, backup, and operator database users must be distinct');
	}
	if (new Set(databaseEntries.map(([, entry]) => entry.database)).size !== 1) {
		throw new Error('All GustiMei role URLs must target the same isolated production database');
	}

	const evidenceBucket = required(source, 'R2_EVIDENCE_BUCKET');
	const artifactBucket = required(source, 'R2_ARTIFACT_BUCKET');
	const backupBucket = required(source, 'R2_BACKUP_BUCKET');
	if (new Set([evidenceBucket, artifactBucket, backupBucket]).size !== 3) {
		throw new Error('Evidence, artifact, and backup storage must use separate buckets');
	}
	const ageRecipient = required(source, 'BACKUP_AGE_RECIPIENT');
	if (!ageRecipient.startsWith('age1')) {
		throw new Error('BACKUP_AGE_RECIPIENT must be an age public recipient');
	}

	// Presence checks prove that the secret-bearing provider contract is complete without exposing values.
	for (const key of [
		'BREVO_API_KEY',
		'R2_ACCESS_KEY_ID',
		'R2_SECRET_ACCESS_KEY',
		'BETTER_STACK_SOURCE_TOKEN',
		'BETTER_STACK_UPTIME_URL',
		'BETTER_STACK_CRON_REVIEW_URL',
		'BETTER_STACK_CRON_BACKUP_URL',
		'BETTER_STACK_CRON_RECOMMENDATIONS_URL'
	]) {
		required(source, key);
	}

	return {
		appImage,
		opsImage,
		runtimeDatabaseUrl: databaseEntries[0][1].value,
		migrationDatabaseUrl: databaseEntries[1][1].value,
		backupDatabaseUrl: databaseEntries[2][1].value,
		operatorDatabaseUrl: databaseEntries[3][1].value,
		deploymentSshPrincipal: required(source, 'DEPLOYMENT_SSH_PRINCIPAL'),
		r2: {
			jurisdiction: exact(source, 'R2_JURISDICTION', 'eu') as 'eu',
			endpoint: httpsUrl(required(source, 'R2_ENDPOINT'), 'R2_ENDPOINT'),
			evidenceBucket,
			artifactBucket,
			backupBucket,
			ageRecipient
		},
		providers: {
			email: exact(source, 'EMAIL_PROVIDER', 'brevo') as 'brevo',
			objectStorage: exact(source, 'OBJECT_STORAGE_PROVIDER', 'cloudflare-r2') as 'cloudflare-r2',
			monitoring: exact(source, 'MONITORING_PROVIDER', 'better-stack') as 'better-stack',
			jobs: exact(source, 'JOB_PROVIDER', 'durable') as 'durable'
		}
	};
}
