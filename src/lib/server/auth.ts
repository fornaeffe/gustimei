import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { runtimeConfig } from '$lib/server/config';
import { authEmailOutbox } from '$lib/server/services/auth-email-runtime';

export const auth = betterAuth({
	baseURL: runtimeConfig.origin,
	secret: runtimeConfig.betterAuthSecret,
	database: drizzleAdapter(db, { provider: 'pg' }),
	emailVerification: {
		sendVerificationEmail: async ({ user, url }) => {
			await authEmailOutbox.enqueue({
				purpose: 'email-verification',
				recipient: user.email,
				actionUrl: url,
				locale: new URL(url).pathname.startsWith('/en/') ? 'en' : 'it'
			});
		},
		sendOnSignUp: true,
		sendOnSignIn: true,
		autoSignInAfterVerification: true,
		expiresIn: 60 * 60
	},
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: true,
		resetPasswordTokenExpiresIn: 60 * 60,
		revokeSessionsOnPasswordReset: true,
		sendResetPassword: async ({ user, url }) => {
			await authEmailOutbox.enqueue({
				purpose: 'password-reset',
				recipient: user.email,
				actionUrl: url,
				locale: new URL(url).pathname.startsWith('/en/') ? 'en' : 'it'
			});
		}
	},
	plugins: [
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
