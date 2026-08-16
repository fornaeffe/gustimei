import { describe, expect, it } from 'vitest';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { currentLocale, localizedAbsoluteUrl, localizedPath } from './locale';

describe('server locale helpers', () => {
	it.each([
		{
			url: 'http://localhost:5173/auth/sign-up',
			locale: 'it',
			dashboard: '/dashboard',
			verification: 'http://localhost:5173/auth/verification'
		},
		{
			url: 'http://localhost:5173/en/auth/sign-up',
			locale: 'en',
			dashboard: '/en/dashboard',
			verification: 'http://localhost:5173/en/auth/verification'
		}
	])('uses the request-scoped locale after Paraglide rewrites $url', async (expected) => {
		await paraglideMiddleware(new Request(expected.url), ({ request, locale }) => {
			expect(locale).toBe(expected.locale);
			expect(currentLocale()).toBe(expected.locale);
			expect(localizedPath('/dashboard')).toBe(expected.dashboard);
			expect(localizedAbsoluteUrl(new URL(request.url), '/auth/verification')).toBe(
				expected.verification
			);
			return new Response();
		});
	});
});
