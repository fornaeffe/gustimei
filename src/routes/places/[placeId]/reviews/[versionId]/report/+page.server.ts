import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { placeReview, reviewPublication, reviewVersion } from '$lib/server/db/schema';
import { localizedAbsoluteUrl, localizedPath } from '$lib/server/http/locale';
import { CatalogueRepository } from '$lib/server/repositories/catalogue';
import { runtimeConfig } from '$lib/server/config';
import { stringField } from '$lib/server/security/auth-forms';
import { reviewModeration } from '$lib/server/services/review-moderation-runtime';
import type { Actions, PageServerLoad } from './$types';

const catalogue = new CatalogueRepository(db, runtimeConfig.appEnvironment);

async function target(placeId: string, versionId: string) {
	const place = await catalogue.getPublicPlace(decodeURIComponent(placeId));
	const [review] = await db
		.select({
			publicationId: reviewPublication.id,
			versionId: reviewVersion.id,
			body: reviewVersion.body,
			pseudonym: reviewVersion.pseudonymSnapshot,
			originalPlaceId: placeReview.placeId
		})
		.from(reviewVersion)
		.innerJoin(reviewPublication, eq(reviewPublication.id, reviewVersion.publicationId))
		.innerJoin(placeReview, eq(placeReview.id, reviewPublication.reviewId))
		.where(eq(reviewVersion.id, versionId))
		.limit(1);
	if (!review) error(404, 'Review version not found');
	const reviewPlace = await catalogue.getPublicPlace(review.originalPlaceId);
	if (reviewPlace.placeId !== place.placeId) error(404, 'Review version not found');
	return { place, review };
}

export const load: PageServerLoad = async ({ params }) => target(params.placeId, params.versionId);

export const actions = {
	notice: async (event) => {
		const { place, review } = await target(event.params.placeId, event.params.versionId);
		const form = await event.request.formData();
		const anonymous = form.get('anonymous') === 'true';
		try {
			const result = await reviewModeration.submitNotice({
				publicationId: review.publicationId,
				versionId: review.versionId,
				exactPublicUrl: `${localizedAbsoluteUrl(event.url, `/places/${encodeURIComponent(place.placeId)}`)}#review-${review.versionId}`,
				kind: stringField(form, 'kind') as
					'alleged-illegality' | 'terms-or-policy' | 'authenticity',
				allegedGround: stringField(form, 'ground'),
				explanation: stringField(form, 'explanation'),
				notifierName: anonymous ? '' : stringField(form, 'name'),
				notifierEmail: String(form.get('email') ?? ''),
				ownerOrDelegate: form.get('ownerDelegate') === 'true',
				goodFaithAccepted: form.get('goodFaith') === 'true',
				anonymous,
				idempotencyKey: randomUUID()
			});
			const evidence = form.get('evidence');
			let evidenceError: string | undefined;
			if (evidence instanceof File && evidence.size > 0) {
				if (!result.caseToken) {
					evidenceError = 'Anonymous evidence requires volunteered contact details for case access';
				} else {
					try {
						await reviewModeration.uploadEvidence({
							noticeId: result.noticeId,
							partyRole: 'notifier',
							notifierToken: result.caseToken,
							bytes: new Uint8Array(await evidence.arrayBuffer()),
							mediaType: evidence.type,
							filename: evidence.name,
							purpose: 'Initial notice substantiation'
						});
					} catch (cause) {
						evidenceError = cause instanceof Error ? cause.message : 'Evidence upload failed';
					}
				}
			}
			return {
				submitted: true,
				noticeId: result.noticeId,
				evidenceError,
				caseHref: result.caseToken
					? `${localizedPath(`/reviews/cases/${result.noticeId}`)}?token=${encodeURIComponent(result.caseToken)}`
					: undefined
			};
		} catch (cause) {
			return fail(400, { error: cause instanceof Error ? cause.message : 'Notice failed' });
		}
	}
} satisfies Actions;
