import { describe, expect, it } from 'vitest';
import { AuthorizationError, NotFoundError } from '$lib/server/domain/errors';
import { rethrowReviewModerationLoadError } from './review-moderation-load-errors';

describe('review moderation load error boundary', () => {
	it('maps an authorization failure to 403', () => {
		expect(() =>
			rethrowReviewModerationLoadError(new AuthorizationError('Internal detail'))
		).toThrow(expect.objectContaining({ status: 403 }));
	});

	it('maps a missing case to 404', () => {
		expect(() => rethrowReviewModerationLoadError(new NotFoundError('Internal detail'))).toThrow(
			expect.objectContaining({ status: 404 })
		);
	});

	it('does not misreport an infrastructure failure as an authorization failure', () => {
		const infrastructureFailure = new Error('Database schema is behind');
		expect(() => rethrowReviewModerationLoadError(infrastructureFailure)).toThrow(
			infrastructureFailure
		);
	});
});
