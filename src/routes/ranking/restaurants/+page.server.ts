import { requireUser } from '$lib/server/http/auth-guard';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = (event) => {
	requireUser(event);
};
