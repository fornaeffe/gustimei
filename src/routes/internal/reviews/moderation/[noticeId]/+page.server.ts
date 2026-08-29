import { error, fail } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http/auth-guard';
import { stringField } from '$lib/server/security/auth-forms';
import { reviewModeration } from '$lib/server/services/review-moderation-runtime';
import type { Actions, PageServerLoad } from './$types';

function message(cause: unknown) {
	return cause instanceof Error ? cause.message : 'Moderation action failed';
}

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event, { verified: true });
	try {
		const [moderationCase, assignment] = await Promise.all([
			reviewModeration.getCaseForModerator(user.id, event.params.noticeId),
			reviewModeration.getModeratorAssignmentContext(user.id)
		]);
		return { case: moderationCase, assignment };
	} catch {
		error(403, 'Review moderator permission is required');
	}
};

export const actions = {
	assign: async (event) => {
		const user = requireUser(event, { verified: true });
		const form = await event.request.formData();
		const requestedModeratorId = String(form.get('moderatorUserId') ?? '').trim();
		try {
			await reviewModeration.assign(
				user.id,
				event.params.noticeId,
				requestedModeratorId || user.id
			);
			return { section: 'assign', saved: true };
		} catch (cause) {
			return fail(409, { section: 'assign', error: message(cause) });
		}
	},
	ownerAssertion: async (event) => {
		const user = requireUser(event, { verified: true });
		const form = await event.request.formData();
		try {
			await reviewModeration.verifyOwnerAssertion(
				user.id,
				event.params.noticeId,
				stringField(form, 'verified') === 'true',
				stringField(form, 'reasonCode')
			);
			return { section: 'ownerAssertion', saved: true };
		} catch (cause) {
			return fail(409, { section: 'ownerAssertion', error: message(cause) });
		}
	},
	restrict: async (event) => {
		const user = requireUser(event, { verified: true });
		const form = await event.request.formData();
		try {
			await reviewModeration.setInterimRestriction(
				user.id,
				event.params.noticeId,
				stringField(form, 'reasonCode')
			);
			return { section: 'restrict', saved: true };
		} catch (cause) {
			return fail(409, { section: 'restrict', error: message(cause) });
		}
	},
	liftRestriction: async (event) => {
		const user = requireUser(event, { verified: true });
		const form = await event.request.formData();
		try {
			await reviewModeration.clearInterimRestriction(
				user.id,
				event.params.noticeId,
				stringField(form, 'reasonCode')
			);
			return { section: 'restrict', saved: true };
		} catch (cause) {
			return fail(409, { section: 'restrict', error: message(cause) });
		}
	},
	decide: async (event) => {
		const user = requireUser(event, { verified: true });
		const form = await event.request.formData();
		const outcome = stringField(form, 'outcome');
		if (!['no-action', 'restrict', 'remove', 'restore'].includes(outcome)) {
			return fail(400, { section: 'decide', error: 'Invalid decision outcome' });
		}
		try {
			await reviewModeration.decide(user.id, {
				noticeId: event.params.noticeId,
				outcome: outcome as 'no-action' | 'restrict' | 'remove' | 'restore',
				scope: stringField(form, 'scope'),
				duration: String(form.get('duration') ?? '').trim() || undefined,
				ground: stringField(form, 'ground'),
				reasonedExplanation: stringField(form, 'reasonedExplanation'),
				factsReliedOn: stringField(form, 'factsReliedOn'),
				automationDisclosure: stringField(form, 'automationDisclosure')
			});
			return { section: 'decide', saved: true };
		} catch (cause) {
			return fail(409, { section: 'decide', error: message(cause) });
		}
	},
	close: async (event) => {
		const user = requireUser(event, { verified: true });
		try {
			await reviewModeration.closeCase(user.id, event.params.noticeId);
			return { section: 'close', saved: true };
		} catch (cause) {
			return fail(409, { section: 'close', error: message(cause) });
		}
	},
	scanEvidence: async (event) => {
		const user = requireUser(event, { verified: true });
		const form = await event.request.formData();
		try {
			await reviewModeration.markEvidenceScan(
				user.id,
				stringField(form, 'evidenceId'),
				stringField(form, 'clean') === 'true'
			);
			return { section: 'scanEvidence', saved: true };
		} catch (cause) {
			return fail(409, { section: 'scanEvidence', error: message(cause) });
		}
	}
} satisfies Actions;
