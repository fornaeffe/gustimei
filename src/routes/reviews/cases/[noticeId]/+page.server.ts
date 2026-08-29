import { randomUUID } from 'node:crypto';
import { error, fail } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http/auth-guard';
import { stringField } from '$lib/server/security/auth-forms';
import { reviewModeration } from '$lib/server/services/review-moderation-runtime';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const token = event.url.searchParams.get('token');
	try {
		if (token) {
			return {
				case: await reviewModeration.getCaseForNotifier(event.params.noticeId, token),
				token,
				partyRole: 'notifier' as const
			};
		}
		const user = requireUser(event, { verified: true });
		return {
			case: await reviewModeration.getCaseForAuthor(user.id, event.params.noticeId),
			token: undefined,
			partyRole: 'author' as const
		};
	} catch {
		error(403, 'Case access is invalid or expired');
	}
};

export const actions = {
	statement: async (event) => {
		const form = await event.request.formData();
		const token =
			String(form.get('token') ?? '').trim() || event.url.searchParams.get('token') || undefined;
		try {
			await reviewModeration.submitPartyStatement({
				noticeId: event.params.noticeId,
				partyRole: token ? 'notifier' : 'author',
				notifierToken: token,
				authorUserId: token ? undefined : requireUser(event, { verified: true }).id,
				statement: stringField(form, 'statement'),
				idempotencyKey: randomUUID()
			});
			return { section: 'statement', saved: true };
		} catch (cause) {
			return fail(400, {
				section: 'statement',
				error: cause instanceof Error ? cause.message : 'Statement failed'
			});
		}
	},
	redress: async (event) => {
		const form = await event.request.formData();
		const token = String(form.get('token') ?? '').trim() || undefined;
		try {
			await reviewModeration.requestRedress({
				noticeId: event.params.noticeId,
				decisionId: stringField(form, 'decisionId'),
				partyRole: token ? 'notifier' : 'author',
				notifierToken: token,
				authorUserId: token ? undefined : requireUser(event, { verified: true }).id,
				statement: stringField(form, 'statement'),
				idempotencyKey: randomUUID()
			});
			return { section: 'redress', saved: true };
		} catch (cause) {
			return fail(400, {
				section: 'redress',
				error: cause instanceof Error ? cause.message : 'Redress failed'
			});
		}
	},
	evidence: async (event) => {
		const form = await event.request.formData();
		const token =
			String(form.get('token') ?? '').trim() || event.url.searchParams.get('token') || undefined;
		const evidence = form.get('evidence');
		if (!(evidence instanceof File))
			return fail(400, { section: 'evidence', error: 'Evidence file is required' });
		try {
			await reviewModeration.uploadEvidence({
				noticeId: event.params.noticeId,
				partyRole: token ? 'notifier' : 'author',
				notifierToken: token,
				authorUserId: token ? undefined : requireUser(event, { verified: true }).id,
				bytes: new Uint8Array(await evidence.arrayBuffer()),
				mediaType: evidence.type,
				filename: evidence.name,
				purpose: 'case-support'
			});
			return { section: 'evidence', saved: true };
		} catch (cause) {
			return fail(400, {
				section: 'evidence',
				error: cause instanceof Error ? cause.message : 'Evidence upload failed'
			});
		}
	},
	deleteEvidence: async (event) => {
		const form = await event.request.formData();
		const token =
			String(form.get('token') ?? '').trim() || event.url.searchParams.get('token') || undefined;
		try {
			await reviewModeration.deleteEvidence({
				evidenceId: stringField(form, 'evidenceId'),
				partyRole: token ? 'notifier' : 'author',
				notifierToken: token,
				authorUserId: token ? undefined : requireUser(event, { verified: true }).id
			});
			return { section: 'evidence', saved: true };
		} catch (cause) {
			return fail(400, {
				section: 'evidence',
				error: cause instanceof Error ? cause.message : 'Evidence deletion failed'
			});
		}
	}
} satisfies Actions;
