import { fail } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { stringField } from '$lib/server/security/auth-forms';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => ({ token: url.searchParams.get('token') ?? '' });

export const actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const token = stringField(data, 'token');
		const password = stringField(data, 'password');
		const confirmation = stringField(data, 'confirmation');
		if (!token) return fail(400, { token, error: 'invalid-link' });
		if (password.length < 8) return fail(400, { token, error: 'password-length' });
		if (password !== confirmation) return fail(400, { token, error: 'password-match' });
		try {
			await auth.api.resetPassword({
				body: { newPassword: password, token },
				headers: event.request.headers
			});
		} catch {
			return fail(400, { token, error: 'invalid-link' });
		}
		return { success: true };
	}
} satisfies Actions;
