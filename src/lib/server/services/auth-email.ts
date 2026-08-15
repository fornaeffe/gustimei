import { createHash, randomUUID } from 'node:crypto';
import type { ProductLocale } from '$lib/content/policies';
import type { Database } from '$lib/server/db';
import { transactionalOutbox } from '$lib/server/db/schema';

export type AuthEmailPurpose = 'email-verification' | 'password-reset';

function emailJobKey(purpose: AuthEmailPurpose, recipient: string, actionUrl: string) {
	return createHash('sha256').update(`${purpose}:${recipient}:${actionUrl}`).digest('hex');
}

export class AuthEmailOutbox {
	constructor(
		private readonly database: Database,
		private readonly clock: () => Date = () => new Date(),
		private readonly id: () => string = randomUUID
	) {}

	async enqueue(input: {
		purpose: AuthEmailPurpose;
		recipient: string;
		actionUrl: string;
		locale?: ProductLocale;
	}) {
		const now = this.clock();
		await this.database
			.insert(transactionalOutbox)
			.values({
				id: this.id(),
				purpose: input.purpose,
				recipientReference: input.recipient,
				payload: { actionUrl: input.actionUrl, locale: input.locale ?? 'en' },
				idempotencyKey: emailJobKey(input.purpose, input.recipient, input.actionUrl),
				availableAt: now,
				createdAt: now
			})
			.onConflictDoNothing();
	}
}
