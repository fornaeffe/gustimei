import { db } from '$lib/server/db';
import { runtimeConfig } from '$lib/server/config';
import { LocalEmailProvider } from '$lib/server/providers/local';
import { ReviewOutboxWorker } from './review-outbox';

let email: LocalEmailProvider | undefined;
let worker: ReviewOutboxWorker | undefined;

export function getLocalEmailRuntime() {
	if (!['development', 'test'].includes(runtimeConfig.appEnvironment)) {
		throw new Error('The local email runtime is unavailable outside development and test');
	}
	email ??= new LocalEmailProvider(runtimeConfig.appEnvironment);
	worker ??= new ReviewOutboxWorker(db, email);
	return { email, worker };
}
