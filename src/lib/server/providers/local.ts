import type {
	AppProviders,
	ArtifactStore,
	BackgroundJob,
	BackgroundJobProvider,
	EmailProvider,
	ErrorMetadataValue,
	ErrorReporter,
	JobLockProvider,
	MonitorCheckIn,
	OperationalMonitoringProvider,
	TransactionalEmail
} from './contracts';
import type { RuntimeConfig } from '$lib/server/config/environment';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

export class LocalEmailProvider implements EmailProvider {
	readonly outbox: TransactionalEmail[] = [];

	constructor(private readonly environment: RuntimeConfig['appEnvironment'] = 'test') {
		if (!['development', 'test'].includes(environment)) {
			throw new Error('The local email transport is forbidden outside development and test');
		}
	}

	async send(message: TransactionalEmail) {
		this.outbox.push(structuredClone(message));
	}
}

export class LocalBackgroundJobProvider implements BackgroundJobProvider {
	readonly queue: BackgroundJob[] = [];
	readonly #accepted = new Set<string>();

	async enqueue(job: BackgroundJob) {
		const key = job.idempotencyKey.trim();
		if (!key) throw new Error('Background jobs require an idempotency key');
		if (!job.scope.environment) throw new Error('Background jobs require an environment scope');
		const scopedKey = `${job.scope.environment}:${job.scope.category ?? 'global'}:${key}`;
		if (this.#accepted.has(scopedKey)) return;
		this.#accepted.add(scopedKey);
		this.queue.push(structuredClone(job));
	}
}

export class LocalJobLockProvider implements JobLockProvider {
	readonly #locks = new Set<string>();

	async acquire(key: string) {
		if (!key.trim()) throw new Error('Job locks require an explicit scope key');
		if (this.#locks.has(key)) return undefined;
		this.#locks.add(key);
		return async () => {
			this.#locks.delete(key);
		};
	}
}

export class LocalOperationalMonitoringProvider implements OperationalMonitoringProvider {
	readonly checkIns: MonitorCheckIn[] = [];

	async checkIn(checkIn: MonitorCheckIn) {
		this.checkIns.push(structuredClone(checkIn));
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

export class FailClosedArtifactStore implements ArtifactStore {
	async put(): Promise<never> {
		throw new Error('Artifact storage is not configured for this environment');
	}
	async get(): Promise<never> {
		throw new Error('Artifact storage is not configured for this environment');
	}
	async delete(): Promise<never> {
		throw new Error('Artifact storage is not configured for this environment');
	}
}

/** Durable local/test artifact storage with same-directory atomic replacement. */
export class FileArtifactStore implements ArtifactStore {
	readonly #root: string;

	constructor(root = resolve('.data', 'artifacts')) {
		this.#root = resolve(root);
	}

	#path(key: string) {
		const target = resolve(this.#root, ...key.split('/'));
		if (target !== this.#root && !target.startsWith(`${this.#root}${sep}`)) {
			throw new Error('Artifact key escapes the configured root');
		}
		return target;
	}

	async put(key: string, value: Uint8Array) {
		const target = this.#path(key);
		await mkdir(dirname(target), { recursive: true });
		const temporary = join(dirname(target), `.${crypto.randomUUID()}.tmp`);
		await writeFile(temporary, value, { flag: 'wx' });
		await rename(temporary, target);
	}

	async get(key: string) {
		try {
			return new Uint8Array(await readFile(this.#path(key)));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
			throw error;
		}
	}

	async delete(key: string) {
		await rm(this.#path(key), { force: true });
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
	if (!['development', 'test'].includes(config.appEnvironment)) {
		throw new Error('Local providers are forbidden outside development and test');
	}
	return {
		config,
		email: new LocalEmailProvider(config.appEnvironment),
		jobs: new LocalBackgroundJobProvider(),
		artifacts: new MemoryArtifactStore(),
		errors: new LocalErrorReporter(),
		monitoring: new LocalOperationalMonitoringProvider(),
		locks: new LocalJobLockProvider()
	};
}

export function createArtifactStore(environment: RuntimeConfig['appEnvironment'], root?: string) {
	return environment === 'development' || environment === 'test'
		? new FileArtifactStore(root)
		: new FailClosedArtifactStore();
}
