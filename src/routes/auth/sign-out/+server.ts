import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { localizedPath } from '$lib/server/http/locale';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	await auth.api.signOut({ headers: event.request.headers });
	redirect(303, localizedPath(event.url, '/'));
};
