import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { count, eq, sql } from 'drizzle-orm';
import { createDatabase } from './connection';
import {
	documentVersion,
	pseudonymChange,
	pseudonymReservation,
	registrationAttestation,
	transactionalOutbox,
	user
} from './schema';
import { LocalEmailProvider } from '$lib/server/providers/local';
import { AccountRightsService } from '$lib/server/services/account-rights';
import { AccountService } from '$lib/server/services/account';
import { AuthEmailOutbox } from '$lib/server/services/auth-email';
import { ReviewOutboxWorker } from '$lib/server/services/review-outbox';

const connection = createDatabase(process.env.DATABASE_URL!);
const { db } = connection;
let now = new Date('2026-08-16T09:00:00.000Z');
const clock = () => now;

beforeEach(async () => {
	now = new Date('2026-08-16T09:00:00.000Z');
	await db.execute(sql`truncate table "user", "document_version", "transactional_outbox" cascade`);
	await db.insert(user).values([
		{ id: 'account-one', name: 'Private one', email: 'one@example.test', emailVerified: true },
		{ id: 'account-two', name: 'Private two', email: 'two@example.test', emailVerified: true }
	]);
});

afterAll(async () => connection.close());

describe('Phase 3 account boundaries', () => {
	it('records versioned registration presentation and enforces pseudonym cadence and reservation', async () => {
		const accounts = new AccountService(db, clock, () => crypto.randomUUID());
		await accounts.recordRegistration('account-one', 'en');
		const [attestation] = await db
			.select()
			.from(registrationAttestation)
			.where(eq(registrationAttestation.userId, 'account-one'));
		expect(attestation).toMatchObject({
			locale: 'en',
			termsVersion: '2026-08-15',
			privacyNoticeVersion: '2026-08-15'
		});
		const [{ value: documents }] = await db.select({ value: count() }).from(documentVersion);
		expect(documents).toBe(6);

		await accounts.setPseudonym('account-one', 'Tavola Curiosa');
		await expect(accounts.setPseudonym('account-one', 'Forchetta Verde')).rejects.toThrow(
			'once every 30 days'
		);
		now = new Date('2026-09-16T09:00:00.000Z');
		await accounts.setPseudonym('account-one', 'Forchetta Verde');
		await expect(accounts.setPseudonym('account-two', 'Tavola Curiosa')).rejects.toThrow(
			'unavailable'
		);
		expect(await db.select().from(pseudonymChange)).toHaveLength(2);
		expect(await db.select().from(pseudonymReservation)).toHaveLength(1);
	});

	it('exports canonical account data and delivers complete local auth action URLs through the outbox worker', async () => {
		const accounts = new AccountService(db, clock, () => crypto.randomUUID());
		await accounts.recordRegistration('account-one', 'it');
		const exported = await new AccountRightsService(db, clock).exportAccount('account-one');
		expect(exported).toMatchObject({
			format: 'gustimei-account-export',
			version: 1,
			registration: { locale: 'it' },
			privateComments: [],
			reviews: []
		});

		const outbox = new AuthEmailOutbox(db, clock, () => 'auth-email-job');
		await outbox.enqueue({
			purpose: 'email-verification',
			recipient: 'one@example.test',
			actionUrl: 'http://localhost:5173/api/auth/verify-email?token=complete-secret',
			locale: 'it'
		});
		const email = new LocalEmailProvider('test');
		expect(await new ReviewOutboxWorker(db, email, clock).runBatch()).toBe(1);
		expect(email.outbox[0]).toMatchObject({
			recipient: 'one@example.test',
			template: 'email-verification:v1',
			variables: {
				actionUrl: 'http://localhost:5173/api/auth/verify-email?token=complete-secret',
				locale: 'it'
			}
		});
		const [job] = await db.select().from(transactionalOutbox);
		expect(job?.deliveredAt).toEqual(now);
	});
});
