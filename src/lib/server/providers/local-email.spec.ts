import { describe, expect, it } from 'vitest';
import { LocalEmailProvider } from './local';

describe('local email transport boundary', () => {
	it('fails closed outside local and test environments', () => {
		expect(() => new LocalEmailProvider('preview')).toThrow();
		expect(() => new LocalEmailProvider('production')).toThrow();
	});

	it('keeps complete local action data inspectable in memory', async () => {
		const provider = new LocalEmailProvider('test');
		await provider.send({
			recipient: 'person@example.test',
			template: 'email-verification:v1',
			variables: { actionUrl: 'http://localhost/api/auth/verify-email?token=secret' }
		});
		expect(provider.outbox[0]?.variables.actionUrl).toContain('token=secret');
	});
});
