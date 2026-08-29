import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const journalUrl = new URL('../drizzle/meta/_journal.json', import.meta.url);

export function compareMigrations(journalEntries, appliedRows) {
	const expected = journalEntries.map((entry) => String(entry.when));
	const applied = appliedRows.map((row) => String(row.created_at));
	const appliedSet = new Set(applied);
	const expectedSet = new Set(expected);

	return {
		missing: expected.filter((createdAt) => !appliedSet.has(createdAt)),
		unexpected: applied.filter((createdAt) => !expectedSet.has(createdAt))
	};
}

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error('DATABASE_URL is required to check database migrations.');
	}

	const journal = JSON.parse(await readFile(journalUrl, 'utf8'));
	const sql = postgres(databaseUrl, { max: 1 });
	try {
		const appliedRows = await sql`
			select "created_at"
			from "drizzle"."__drizzle_migrations"
			order by "created_at"
		`;
		const { missing, unexpected } = compareMigrations(journal.entries, appliedRows);
		if (missing.length || unexpected.length) {
			const details = [
				missing.length ? `${missing.length} pending migration(s)` : null,
				unexpected.length ? `${unexpected.length} unknown applied migration(s)` : null
			]
				.filter(Boolean)
				.join(', ');
			throw new Error(
				`Database migration parity check failed: ${details}. Run npm run db:migrate with the intended DATABASE_URL before starting the application.`
			);
		}
		console.log(`Database migration parity check passed (${journal.entries.length} migrations).`);
	} finally {
		await sql.end();
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	await main();
}
