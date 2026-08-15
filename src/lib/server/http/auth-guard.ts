import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { localizedPath } from './locale';

export function requireUser(
	event: Pick<RequestEvent, 'locals' | 'url'>,
	options: { verified?: boolean } = {}
) {
	if (!event.locals.user) {
		const signIn = new URL(localizedPath(event.url, '/auth/sign-in'), event.url.origin);
		signIn.searchParams.set('redirectTo', event.url.pathname + event.url.search);
		redirect(303, `${signIn.pathname}${signIn.search}`);
	}
	if (options.verified && !event.locals.user.emailVerified) {
		redirect(303, localizedPath(event.url, '/auth/check-email'));
	}
	return event.locals.user;
}
