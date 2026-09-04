import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		await db.execute(sql`select 1`);
		return json({ status: 'ready' }, { headers: { 'cache-control': 'no-store' } });
	} catch {
		return json(
			{ status: 'unavailable' },
			{ status: 503, headers: { 'cache-control': 'no-store', 'retry-after': '5' } }
		);
	}
};
