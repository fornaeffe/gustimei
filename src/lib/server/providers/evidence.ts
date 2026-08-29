import {
	EVIDENCE_ALLOWED_MEDIA_TYPES,
	EVIDENCE_MAX_FILE_BYTES,
	EVIDENCE_MAX_FILES_PER_CASE
} from '$lib/domain/reviews/evidence';

export { EVIDENCE_ALLOWED_MEDIA_TYPES, EVIDENCE_MAX_FILE_BYTES, EVIDENCE_MAX_FILES_PER_CASE };

export interface EvidenceWrite {
	handle: string;
	bytes: Uint8Array;
	mediaType: string;
}

export interface RestrictedEvidenceStore {
	put(input: EvidenceWrite): Promise<void>;
	get(handle: string): Promise<Uint8Array | undefined>;
	delete(handle: string): Promise<void>;
}

export class EphemeralEvidenceStore implements RestrictedEvidenceStore {
	readonly #objects = new Map<string, Uint8Array>();

	async put(input: EvidenceWrite): Promise<void> {
		if (!EVIDENCE_ALLOWED_MEDIA_TYPES.has(input.mediaType)) {
			throw new Error('Evidence media type is not allowed');
		}
		if (input.bytes.byteLength === 0 || input.bytes.byteLength > EVIDENCE_MAX_FILE_BYTES) {
			throw new Error('Evidence file size is outside the allowed range');
		}
		this.#objects.set(input.handle, input.bytes.slice());
	}

	async get(handle: string): Promise<Uint8Array | undefined> {
		return this.#objects.get(handle)?.slice();
	}

	async delete(handle: string): Promise<void> {
		this.#objects.delete(handle);
	}
}

export class FailClosedEvidenceStore implements RestrictedEvidenceStore {
	async put(): Promise<never> {
		throw new Error('Restricted evidence storage is not configured for this environment');
	}
	async get(): Promise<never> {
		throw new Error('Restricted evidence storage is not configured for this environment');
	}
	async delete(): Promise<never> {
		throw new Error('Restricted evidence storage is not configured for this environment');
	}
}

export function createEvidenceStore(
	environment: 'development' | 'test' | 'preview' | 'production'
) {
	return environment === 'development' || environment === 'test'
		? new EphemeralEvidenceStore()
		: new FailClosedEvidenceStore();
}
