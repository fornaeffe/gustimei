import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { loadEnvironment } from '../src/lib/server/config/environment';
import { createDatabase } from '../src/lib/server/db/connection';
import { createEvidenceStore } from '../src/lib/server/providers/evidence';
import { LocalEmailProvider } from '../src/lib/server/providers/local';
import { ReviewModerationService } from '../src/lib/server/services/review-moderation';
import { ReviewOutboxWorker } from '../src/lib/server/services/review-outbox';
import { ReviewPrivacyService } from '../src/lib/server/services/review-privacy';

const config = loadEnvironment(process.env);
if (!['development', 'test'].includes(config.appEnvironment)) {
	throw new Error(
		'Phase 8 review maintenance uses local providers only; install hosted Phase 9 adapters'
	);
}

const connection = createDatabase(config.databaseUrl);
const lockKey = `${config.appEnvironment}:global:review-maintenance`;
const runId = randomUUID();

function checkIn(status: 'started' | 'succeeded' | 'failed', metrics?: Record<string, number>) {
	console.log(JSON.stringify({ monitor: 'review-maintenance', runId, status, metrics }));
}

async function withRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;
			if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 100));
		}
	}
	throw lastError;
}

try {
	const lockRows = await connection.db.execute<{ acquired: boolean }>(
		sql`select pg_try_advisory_lock(hashtextextended(${lockKey}, 0)) as acquired`
	);
	if (!lockRows[0]?.acquired) {
		console.log(JSON.stringify({ monitor: 'review-maintenance', runId, status: 'locked' }));
		process.exitCode = 75;
	} else {
		checkIn('started');
		try {
			const moderation = new ReviewModerationService(
				connection.db,
				config.appEnvironment,
				createEvidenceStore(config.appEnvironment)
			);
			const privacy = new ReviewPrivacyService(connection.db);
			const outbox = new ReviewOutboxWorker(
				connection.db,
				new LocalEmailProvider(config.appEnvironment)
			);
			const [expiredPublications, deletedEvidence, releasedHolds, deliveredMessages] =
				await withRetry(async () =>
					Promise.all([
						moderation.runExpiryBatch(),
						moderation.runEvidenceRetentionBatch(),
						privacy.releaseExpiredHolds(),
						outbox.runBatch()
					])
				);
			checkIn('succeeded', {
				expiredPublications,
				deletedEvidence,
				releasedHolds,
				deliveredMessages
			});
		} catch (error) {
			checkIn('failed');
			throw error;
		} finally {
			await connection.db.execute(sql`select pg_advisory_unlock(hashtextextended(${lockKey}, 0))`);
		}
	}
} finally {
	await connection.close();
}
