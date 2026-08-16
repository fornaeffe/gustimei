import { fail, redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { consumeAuthRateLimit } from '$lib/server/security/auth-rate-limit';
import {
	authFormRateLimiter,
	isUnverifiedAuthError,
	stringField,
	validEmail
} from '$lib/server/security/auth-forms';
import { localizedPath, safeRedirectPath } from '$lib/server/http/locale';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, localizedPath('/dashboard'));
	return { redirectTo: url.searchParams.get('redirectTo') ?? '' };
};

export const actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const email = stringField(data, 'email').toLocaleLowerCase('en-US');
		const password = stringField(data, 'password');
		const values = { email, redirectTo: stringField(data, 'redirectTo') };
		if (!validEmail(email) || !password) return fail(400, { values, error: 'generic' });
		const rate = await consumeAuthRateLimit({
			limiter: authFormRateLimiter,
			action: 'sign-in',
			event,
			accountIdentifier: email
		});
		if (!rate.allowed) return fail(429, { values, error: 'rate-limited' });
		try {
			await auth.api.signInEmail({
				body: { email, password, rememberMe: data.get('rememberMe') === 'true' },
				headers: event.request.headers
			});
		} catch (error) {
			if (isUnverifiedAuthError(error)) redirect(303, localizedPath('/auth/check-email'));
			return fail(400, { values, error: 'generic' });
		}
		redirect(303, safeRedirectPath(event.url, data.get('redirectTo'), '/dashboard'));
	}
} satisfies Actions;
