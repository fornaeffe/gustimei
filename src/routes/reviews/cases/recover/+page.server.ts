import { localizedAbsoluteUrl } from '$lib/server/http/locale';
import { reviewModeration } from '$lib/server/services/review-moderation-runtime';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => ({
	caseReference: url.searchParams.get('case') ?? ''
});

export const actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const noticeId = String(form.get('caseReference') ?? '').trim();
		const email = String(form.get('email') ?? '').trim();
		if (noticeId && email) {
			await reviewModeration.requestNotifierCaseAccess({
				noticeId,
				email,
				caseActionUrl: (token) =>
					`${localizedAbsoluteUrl(event.url, `/reviews/cases/${encodeURIComponent(noticeId)}`)}?token=${encodeURIComponent(token)}`
			});
		}
		return { submitted: true };
	}
} satisfies Actions;
