import { randomUUID } from 'node:crypto';
import { error, fail, redirect } from '@sveltejs/kit';
import { runtimeConfig } from '$lib/server/config';
import { db } from '$lib/server/db';
import { requireUser } from '$lib/server/http/auth-guard';
import { currentLocale, localizedPath } from '$lib/server/http/locale';
import { stringField } from '$lib/server/security/auth-forms';
import { ReviewService } from '$lib/server/services/reviews';
import type { Actions, PageServerLoad } from './$types';

const reviews = new ReviewService(db, runtimeConfig.appEnvironment);

function declarations(form: FormData) {
	return {
		personallyUsedService: form.get('usedService') === 'true',
		contentConcernsExperience: form.get('relevant') === 'true',
		noIncentive: form.get('notIncentivized') === 'true'
	};
}

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event, { verified: true });
	const review = (await reviews.listAuthorProjection(user.id)).find(
		(item) => item.reviewId === event.params.reviewId
	);
	if (!review) error(404, 'Review not found');
	return { review };
};

export const actions = {
	edit: async (event) => {
		const user = requireUser(event, { verified: true });
		const form = await event.request.formData();
		try {
			await reviews.edit(user.id, event.params.reviewId, {
				body: stringField(form, 'body'),
				locale: currentLocale(),
				declarations: declarations(form),
				expectedVersion: Number(stringField(form, 'expectedVersion')),
				idempotencyKey: randomUUID()
			});
			redirect(303, localizedPath('/reviews/manage'));
		} catch (cause) {
			if (cause && typeof cause === 'object' && 'status' in cause) throw cause;
			return fail(400, {
				section: 'edit',
				error: cause instanceof Error ? cause.message : 'Edit failed'
			});
		}
	},
	substitute: async (event) => {
		const user = requireUser(event, { verified: true });
		const form = await event.request.formData();
		try {
			await reviews.substitute(user.id, event.params.reviewId, {
				body: stringField(form, 'body'),
				serviceDate: stringField(form, 'serviceDate'),
				locale: currentLocale(),
				declarations: declarations(form),
				idempotencyKey: randomUUID()
			});
			redirect(303, localizedPath('/reviews/manage'));
		} catch (cause) {
			if (cause && typeof cause === 'object' && 'status' in cause) throw cause;
			return fail(400, {
				section: 'substitute',
				error: cause instanceof Error ? cause.message : 'Substitution failed'
			});
		}
	}
} satisfies Actions;
