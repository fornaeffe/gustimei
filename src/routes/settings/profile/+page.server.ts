import { fail } from '@sveltejs/kit';
import { AccountService } from '$lib/server/services/account';
import { db } from '$lib/server/db';
import { requireUser } from '$lib/server/http/auth-guard';
import { stringField } from '$lib/server/security/auth-forms';
import { ConflictError, DomainValidationError } from '$lib/server/domain/errors';
import type { Actions, PageServerLoad } from './$types';

const accounts = new AccountService(db);
export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	return {
		email: user.email,
		emailVerified: user.emailVerified,
		...(await accounts.getAccountProjection(user.id))
	};
};
export const actions = {
	pseudonym: async (event) => {
		const user = requireUser(event, { verified: true });
		const data = await event.request.formData();
		try {
			await accounts.setPseudonym(user.id, stringField(data, 'pseudonym'));
		} catch (error) {
			if (error instanceof ConflictError || error instanceof DomainValidationError)
				return fail(400, { section: 'pseudonym', error: error.message });
			throw error;
		}
		return { section: 'pseudonym', saved: true };
	},
	locale: async (event) => {
		const user = requireUser(event);
		const data = await event.request.formData();
		const locale = stringField(data, 'locale');
		if (locale !== 'en' && locale !== 'it')
			return fail(400, { section: 'locale', error: 'Invalid locale' });
		await accounts.setLocale(user.id, locale);
		return { section: 'locale', saved: true };
	}
} satisfies Actions;
