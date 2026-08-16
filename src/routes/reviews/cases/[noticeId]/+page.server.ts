import { randomUUID } from 'node:crypto';
import { error, fail } from '@sveltejs/kit';
import { stringField } from '$lib/server/security/auth-forms';
import { reviewModeration } from '$lib/server/services/review-moderation-runtime';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const token = url.searchParams.get('token');
	if (!token) error(401, 'Case access token required');
	try {
		return { case: await reviewModeration.getCaseForNotifier(params.noticeId, token), token };
	} catch {
		error(403, 'Case access is invalid or expired');
	}
};

export const actions = {
	statement: async (event) => {
		const form = await event.request.formData();
		try {
			await reviewModeration.submitPartyStatement({
				noticeId: event.params.noticeId,
				partyRole: 'notifier',
				notifierToken: stringField(form, 'token'),
				statement: stringField(form, 'statement'),
				idempotencyKey: randomUUID()
			});
			return { saved: true };
		} catch (cause) {
			return fail(400, { error: cause instanceof Error ? cause.message : 'Statement failed' });
		}
	}
} satisfies Actions;
