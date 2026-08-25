import { error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/http/auth-guard';
import { reviewModeration } from '$lib/server/services/review-moderation-runtime';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event, { verified: true });
	try {
		return { cases: await reviewModeration.listModeratorQueue(user.id) };
	} catch {
		error(403, 'Review moderator permission is required');
	}
};
