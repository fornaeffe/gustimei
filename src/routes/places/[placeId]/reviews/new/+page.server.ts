import { randomUUID } from 'node:crypto';
import { fail, redirect } from '@sveltejs/kit';
import { runtimeConfig } from '$lib/server/config';
import { db } from '$lib/server/db';
import { requireUser } from '$lib/server/http/auth-guard';
import { currentLocale, localizedPath } from '$lib/server/http/locale';
import { CatalogueRepository } from '$lib/server/repositories/catalogue';
import { stringField } from '$lib/server/security/auth-forms';
import { AccountService } from '$lib/server/services/account';
import { ReviewService } from '$lib/server/services/reviews';
import type { Actions, PageServerLoad } from './$types';

const catalogue = new CatalogueRepository(db, runtimeConfig.appEnvironment);
const reviews = new ReviewService(db, runtimeConfig.appEnvironment);
const accounts = new AccountService(db);

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event, { verified: true });
	const place = await catalogue.getPublicPlace(decodeURIComponent(event.params.placeId));
	return {
		place,
		profile: (await accounts.getAccountProjection(user.id)).publicProfile,
		idempotencyKey: randomUUID()
	};
};

export const actions = {
	publish: async (event) => {
		const user = requireUser(event, { verified: true });
		const form = await event.request.formData();
		const place = await catalogue.getPublicPlace(decodeURIComponent(event.params.placeId));
		try {
			const receipt = await reviews.create(user.id, {
				placeId: place.placeId,
				body: stringField(form, 'body'),
				serviceDate: stringField(form, 'serviceDate'),
				locale: currentLocale(),
				declarations: {
					personallyUsedService: form.get('usedService') === 'true',
					contentConcernsExperience: form.get('relevant') === 'true',
					noIncentive: form.get('notIncentivized') === 'true'
				},
				idempotencyKey: stringField(form, 'idempotencyKey')
			});
			redirect(
				303,
				`${localizedPath(`/places/${encodeURIComponent(place.placeId)}`)}#review-${receipt.versionId}`
			);
		} catch (error) {
			if (error && typeof error === 'object' && 'status' in error) throw error;
			return fail(400, {
				error: error instanceof Error ? error.message : 'Review publication failed',
				body: String(form.get('body') ?? ''),
				serviceDate: String(form.get('serviceDate') ?? '')
			});
		}
	}
} satisfies Actions;
