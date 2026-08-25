import { ConflictError, DomainValidationError } from '$lib/server/domain/errors';

export function safeActionError(cause: unknown, fallback: string): string {
	if (cause instanceof DomainValidationError || cause instanceof ConflictError) {
		return cause.message;
	}
	return fallback;
}
