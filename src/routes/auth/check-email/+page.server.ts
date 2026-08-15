import { fail } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { consumeAuthRateLimit } from '$lib/server/security/auth-rate-limit';
import { authFormRateLimiter, stringField, validEmail } from '$lib/server/security/auth-forms';
import { localizedAbsoluteUrl } from '$lib/server/http/locale';
import type { Actions } from './$types';

export const actions = {
	resend: async (event) => {
		const data = await event.request.formData();
		const email = stringField(data, 'email').toLocaleLowerCase('en-US');
		if (!validEmail(email)) return fail(400, { error: 'email' });
		const rate = await consumeAuthRateLimit({
			limiter: authFormRateLimiter,
			action: 'verification-resend',
			event,
			accountIdentifier: email
		});
		if (!rate.allowed) return fail(429, { error: 'rate-limited' });
		try {
			await auth.api.sendVerificationEmail({
				body: { email, callbackURL: localizedAbsoluteUrl(event.url, '/auth/verification') },
				headers: event.request.headers
			});
		} catch {
			/* keep response generic */
		}
		return { sent: true };
	}
} satisfies Actions;
