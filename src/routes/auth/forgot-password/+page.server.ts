import { fail } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { consumeAuthRateLimit } from '$lib/server/security/auth-rate-limit';
import { authFormRateLimiter, stringField, validEmail } from '$lib/server/security/auth-forms';
import { localizedAbsoluteUrl } from '$lib/server/http/locale';
import type { Actions } from './$types';

export const actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const email = stringField(data, 'email').toLocaleLowerCase('en-US');
		if (!validEmail(email)) return fail(400, { email, error: 'email' });
		const rate = await consumeAuthRateLimit({
			limiter: authFormRateLimiter,
			action: 'password-reset',
			event,
			accountIdentifier: email
		});
		if (!rate.allowed) return fail(429, { email, error: 'rate-limited' });
		try {
			await auth.api.requestPasswordReset({
				body: { email, redirectTo: localizedAbsoluteUrl(event.url, '/auth/reset-password') },
				headers: event.request.headers
			});
		} catch {
			/* generic confirmation prevents account enumeration */
		}
		return { sent: true };
	}
} satisfies Actions;
