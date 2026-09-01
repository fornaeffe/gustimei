import { redirect } from '@sveltejs/kit';
import { localizedPath } from '$lib/server/http/locale';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, localizedPath('/recommendations/restaurants'));
};
