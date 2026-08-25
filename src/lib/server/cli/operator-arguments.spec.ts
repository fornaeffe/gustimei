import { describe, expect, it } from 'vitest';

import { parseOperatorArguments } from './operator-arguments';

describe('parseOperatorArguments', () => {
	it('parses the npm-on-Windows-safe name=value form', () => {
		const result = parseOperatorArguments([
			'environment=development',
			'target-user-id=user-1',
			'reason=initial local administrator'
		]);

		expect(Object.fromEntries(result)).toEqual({
			environment: 'development',
			'target-user-id': 'user-1',
			reason: 'initial local administrator'
		});
	});

	it('retains support for conventional named arguments', () => {
		const result = parseOperatorArguments([
			'--environment',
			'development',
			'--role=review_moderator'
		]);

		expect(Object.fromEntries(result)).toEqual({
			environment: 'development',
			role: 'review_moderator'
		});
	});

	it.each([
		[['development']],
		[['--environment']],
		[['--environment', '--role']],
		[['=development']],
		[['environment=']]
	])('rejects malformed arguments: %j', (rawArguments) => {
		expect(() => parseOperatorArguments(rawArguments)).toThrow(
			'Every operator argument must use name=value or --name value syntax'
		);
	});
});
