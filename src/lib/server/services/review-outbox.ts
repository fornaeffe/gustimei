import { and, asc, eq, isNull, lte, notInArray, or } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { reviewNotification, transactionalOutbox, user } from '$lib/server/db/schema';
import type { EmailProvider } from '$lib/server/providers/contracts';

const terminalRecipientErrorCodes = ['recipient-invalid', 'recipient-not-found'] as const;

class OutboxRecipientError extends Error {
	constructor(readonly code: (typeof terminalRecipientErrorCodes)[number]) {
		super(
			code === 'recipient-invalid'
				? 'Outbox recipient is invalid'
				: 'Outbox recipient was not found'
		);
	}
}

export class ReviewOutboxWorker {
	constructor(
		private readonly database: Database,
		private readonly email: EmailProvider,
		private readonly clock: () => Date = () => new Date()
	) {}

	async runBatch(limit = 50): Promise<number> {
		const now = this.clock();
		const records = await this.database
			.select()
			.from(transactionalOutbox)
			.where(
				and(
					isNull(transactionalOutbox.deliveredAt),
					lte(transactionalOutbox.availableAt, now),
					or(
						isNull(transactionalOutbox.lastErrorCode),
						notInArray(transactionalOutbox.lastErrorCode, [...terminalRecipientErrorCodes])
					)
				)
			)
			.orderBy(asc(transactionalOutbox.availableAt), asc(transactionalOutbox.id))
			.limit(limit);
		let delivered = 0;
		for (const record of records) {
			try {
				const recipient = await this.resolveRecipient(record.recipientReference);
				await this.email.send({
					recipient,
					template: `${record.purpose}:v1`,
					variables: record.payload
				});
				const deliveredAt = this.clock();
				await this.database.transaction(async (transaction) => {
					await transaction
						.update(transactionalOutbox)
						.set({ deliveredAt, attemptCount: record.attemptCount + 1, lastErrorCode: null })
						.where(
							and(eq(transactionalOutbox.id, record.id), isNull(transactionalOutbox.deliveredAt))
						);
					await transaction
						.update(reviewNotification)
						.set({ state: 'delivered', deliveredAt })
						.where(eq(reviewNotification.outboxJobId, record.id));
				});
				delivered += 1;
			} catch (cause) {
				const lastErrorCode =
					cause instanceof OutboxRecipientError ? cause.code : 'delivery-failed';
				await this.database.transaction(async (transaction) => {
					await transaction
						.update(transactionalOutbox)
						.set({ attemptCount: record.attemptCount + 1, lastErrorCode })
						.where(eq(transactionalOutbox.id, record.id));
					await transaction
						.update(reviewNotification)
						.set({ state: 'failed' })
						.where(eq(reviewNotification.outboxJobId, record.id));
				});
			}
		}
		return delivered;
	}

	private async resolveRecipient(reference: string): Promise<string> {
		const recipientReference = reference.trim();
		if (!recipientReference) throw new OutboxRecipientError('recipient-invalid');
		if (recipientReference.includes('@')) return recipientReference;
		const [record] = await this.database
			.select({ email: user.email })
			.from(user)
			.where(eq(user.id, recipientReference))
			.limit(1);
		if (!record) throw new OutboxRecipientError('recipient-not-found');
		return record.email;
	}
}
