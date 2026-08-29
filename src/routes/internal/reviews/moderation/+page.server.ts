import { requireUser } from '$lib/server/http/auth-guard';
import { rethrowReviewModerationLoadError } from '$lib/server/http/review-moderation-load-errors';
import { reviewModeration } from '$lib/server/services/review-moderation-runtime';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event, { verified: true });
	try {
		return { cases: await reviewModeration.listModeratorQueue(user.id) };
	} catch (cause) {
		rethrowReviewModerationLoadError(cause);
	}
};
