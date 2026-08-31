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
	return {
		config,
		email: new LocalEmailProvider(config.appEnvironment),
		jobs: new LocalBackgroundJobProvider(),
		artifacts: new MemoryArtifactStore(),
		errors: new LocalErrorReporter()
	};
}
