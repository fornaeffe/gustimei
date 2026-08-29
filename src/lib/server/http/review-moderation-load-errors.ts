import { error } from '@sveltejs/kit';
import { AuthorizationError, NotFoundError } from '$lib/server/domain/errors';

export function rethrowReviewModerationLoadError(cause: unknown): never {
	if (cause instanceof AuthorizationError) {
		error(403, 'Review moderator permission is required');
	}
	if (cause instanceof NotFoundError) {
		error(404, 'Review moderation case was not found');
	}
	throw cause;
}
