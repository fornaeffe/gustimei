import type {
	AppProviders,
	ArtifactStore,
	BackgroundJob,
	BackgroundJobProvider,
	EmailProvider,
	ErrorMetadataValue,
	ErrorReporter,
	TransactionalEmail
} from './contracts';
import type { RuntimeConfig } from '$lib/server/config/environment';

export class LocalEmailProvider implements EmailProvider {
	readonly outbox: TransactionalEmail[] = [];

	async send(message: TransactionalEmail) {
		this.outbox.push(structuredClone(message));
	}
}

export class LocalBackgroundJobProvider implements BackgroundJobProvider {
	readonly queue: BackgroundJob[] = [];

	async enqueue(job: BackgroundJob) {
		this.queue.push(structuredClone(job));
	}
}

export class MemoryArtifactStore implements ArtifactStore {
	readonly #artifacts = new Map<string, Uint8Array>();

	async put(key: string, value: Uint8Array) {
		this.#artifacts.set(key, value.slice());
	}

	async get(key: string) {
		return this.#artifacts.get(key)?.slice();
	}

	async delete(key: string) {
		this.#artifacts.delete(key);
	}
}

export interface CapturedError {
	error: unknown;
	metadata?: Readonly<Record<string, ErrorMetadataValue>>;
}

export class LocalErrorReporter implements ErrorReporter {
	readonly captured: CapturedError[] = [];

	capture(error: unknown, metadata?: Readonly<Record<string, ErrorMetadataValue>>) {
		this.captured.push({ error, metadata });
	}
}

export function createLocalProviders(config: RuntimeConfig): AppProviders {
	return {
		config,
		email: new LocalEmailProvider(),
		jobs: new LocalBackgroundJobProvider(),
		artifacts: new MemoryArtifactStore(),
		errors: new LocalErrorReporter()
	};
}
