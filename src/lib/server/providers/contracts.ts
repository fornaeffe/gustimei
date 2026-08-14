import type { RuntimeConfig } from '$lib/server/config/environment';

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

export interface AppProviders {
	config: RuntimeConfig;
	email: EmailProvider;
	jobs: BackgroundJobProvider;
	artifacts: ArtifactStore;
	errors: ErrorReporter;
}
