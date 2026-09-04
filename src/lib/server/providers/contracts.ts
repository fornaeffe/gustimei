import type { RuntimeConfig } from '$lib/server/config/environment';
import type { RankingCategory } from '$lib/domain/ranking/contracts';

export interface TransactionalEmail {
	recipient: string;
	template: string;
	variables: Readonly<Record<string, string>>;
}

export interface EmailProvider {
	send(message: TransactionalEmail): Promise<void>;
}

export interface BackgroundJob {
	name: string;
	idempotencyKey: string;
	scope: {
		environment: RuntimeConfig['appEnvironment'];
		category?: RankingCategory;
	};
	payload: Readonly<Record<string, unknown>>;
}

export interface BackgroundJobProvider {
	enqueue(job: BackgroundJob): Promise<void>;
}

export interface ArtifactStore {
	put(key: string, value: Uint8Array): Promise<void>;
	get(key: string): Promise<Uint8Array | undefined>;
	delete(key: string): Promise<void>;
}

export type ErrorMetadataValue = boolean | number | string | null;

export interface ErrorReporter {
	capture(error: unknown, metadata?: Readonly<Record<string, ErrorMetadataValue>>): void;
}

export type OperationalMonitor =
	| 'database-backup'
	| 'catalogue-import-restaurant'
	| 'recommendation-rebuild-restaurant'
	| 'review-maintenance'
	| 'transactional-outbox';

export interface MonitorCheckIn {
	monitor: OperationalMonitor;
	runId: string;
	status: 'started' | 'succeeded' | 'failed';
	occurredAt: string;
	/** Allowlisted counts and durations only. Never include content, identifiers, or action URLs. */
	metrics?: Readonly<Record<string, number>>;
}

export interface OperationalMonitoringProvider {
	checkIn(checkIn: MonitorCheckIn): Promise<void>;
}

export interface JobLockProvider {
	/** Returns a release function, or undefined when another runner owns this exact scope. */
	acquire(key: string): Promise<(() => Promise<void>) | undefined>;
}

export interface AppProviders {
	config: RuntimeConfig;
	email: EmailProvider;
	jobs: BackgroundJobProvider;
	artifacts: ArtifactStore;
	errors: ErrorReporter;
	monitoring: OperationalMonitoringProvider;
	locks: JobLockProvider;
}

export type ReviewOutboxPurpose =
	| 'email-verification'
	| 'password-reset'
	| 'review-acknowledgement'
	| 'review-case-access'
	| 'review-author-notice'
	| 'review-evidence-window'
	| 'review-decision'
	| 'review-reinstatement'
	| 'review-redress'
	| 'review-retention-deletion';
