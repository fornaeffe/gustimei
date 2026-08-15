import { error } from '@sveltejs/kit';
import { runtimeConfig } from '$lib/server/config';
import { getLocalEmailRuntime } from '$lib/server/services/local-email-runtime';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	if (!['development', 'test'].includes(runtimeConfig.appEnvironment)) error(404);
	const runtime = getLocalEmailRuntime();
	await runtime.worker.runBatch();
	return { messages: runtime.email.outbox };
};
