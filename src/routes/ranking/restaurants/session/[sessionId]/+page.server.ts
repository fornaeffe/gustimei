import { db } from '$lib/server/db';
import { requireUser } from '$lib/server/http/auth-guard';
import { RankingRepository } from '$lib/server/repositories/rankings';
import type { PageServerLoad } from './$types';

const rankings = new RankingRepository(db);

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const session = await rankings.loadSession(user.id, event.params.sessionId);
	return { session: session.summary() };
};
