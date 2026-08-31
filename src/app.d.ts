import type { User, Session } from 'better-auth';

declare module '$app/paths' {
	/** TypeScript 6 fallback for localized path strings when the generated route overload union collapses. */
	export function resolve(path: string): string;
}

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: User;
			session?: Session;
		}

		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
