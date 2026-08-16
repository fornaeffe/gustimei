import { fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { AccountService } from '$lib/server/services/account';
import { consumeAuthRateLimit } from '$lib/server/security/auth-rate-limit';
import { authFormRateLimiter, stringField, validEmail } from '$lib/server/security/auth-forms';
import { currentLocale, localizedAbsoluteUrl, localizedPath } from '$lib/server/http/locale';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, localizedPath('/dashboard'));
};

export const actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const name = stringField(data, 'name');
		const email = stringField(data, 'email').toLocaleLowerCase('en-US');
		const password = stringField(data, 'password');
		const accepted =
			data.get('adult') === 'true' &&
			data.get('terms') === 'true' &&
			data.get('contribution') === 'true';
		const values = { name, email };
		if (!name || !email || !password) return fail(400, { values, error: 'required' });
		if (!validEmail(email)) return fail(400, { values, error: 'email' });
		if (password.length < 8) return fail(400, { values, error: 'password-length' });
		if (!accepted) return fail(400, { values, error: 'acceptances' });
		const rate = await consumeAuthRateLimit({
			limiter: authFormRateLimiter,
			action: 'sign-up',
			event,
			accountIdentifier: email
		});
		if (!rate.allowed) return fail(429, { values, error: 'rate-limited' });
		try {
			const result = await auth.api.signUpEmail({
				body: {
					name,
					email,
					password,
					callbackURL: localizedAbsoluteUrl(event.url, '/auth/verification')
				},
				headers: event.request.headers
			});
			const [persisted] = await db
				.select({ id: user.id })
				.from(user)
				.where(andUserIdentity(result.user.id, email))
				.limit(1);
			if (persisted) await new AccountService(db).recordRegistration(persisted.id, currentLocale());
		} catch {
			return fail(400, { values, error: 'generic' });
		}
		redirect(303, localizedPath('/auth/check-email'));
	}
} satisfies Actions;

function andUserIdentity(id: string, email: string) {
	return and(eq(user.id, id), eq(user.email, email));
}
