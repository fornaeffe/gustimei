import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '$lib/server/domain/errors';
import { safeActionError } from './action-errors';

describe('public action error boundary', () => {
	it('keeps expected validation useful and hides infrastructure details', () => {
		expect(safeActionError(new DomainValidationError('Field is too short'), 'Try again')).toBe(
			'Field is too short'
		);
		expect(
			safeActionError(
				new Error('Failed query: insert into secret_table values ($1) params: private'),
				"We couldn't complete the request. Please try again."
			)
		).toBe("We couldn't complete the request. Please try again.");
	});
});
