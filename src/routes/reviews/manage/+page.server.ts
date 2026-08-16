import { randomUUID } from 'node:crypto';
import { fail } from '@sveltejs/kit';
import { runtimeConfig } from '$lib/server/config';
import { db } from '$lib/server/db';
import { requireUser } from '$lib/server/http/auth-guard';
import { stringField } from '$lib/server/security/auth-forms';
import { ReviewService } from '$lib/server/services/reviews';
import type { Actions, PageServerLoad } from './$types';

const reviews = new ReviewService(db, runtimeConfig.appEnvironment);

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	return { reviews: await reviews.listAuthorProjection(user.id) };
};

export const actions = {
	withdraw: async (event) => {
		const user = requireUser(event, { verified: true });
		const form = await event.request.formData();
		try {
			await reviews.withdraw(user.id, stringField(form, 'reviewId'), randomUUID());
			return { withdrawn: true };
		} catch (error) {
			return fail(400, { error: error instanceof Error ? error.message : 'Withdrawal failed' });
		}
	}
} satisfies Actions;
