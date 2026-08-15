import { randomUUID } from 'node:crypto';
import { and, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import { addDays } from '$lib/domain/reviews/policy';
import type { Database } from '$lib/server/db';
import {
	placeReview,
	reviewModerationEvent,
	reviewNotice,
	reviewPublication,
	reviewRetentionHold,
	reviewVersion,
	user
} from '$lib/server/db/schema';
import { NotFoundError } from '$lib/server/domain/errors';

export class ReviewPrivacyService {
	constructor(
		private readonly database: Database,
		private readonly clock: () => Date = () => new Date(),
		private readonly id: () => string = randomUUID
	) {}

	async eraseAccount(userId: string) {
		const now = this.clock();
		return this.database.transaction(async (transaction) => {
			await transaction.execute(sql`select set_config('app.review_erasure', 'on', true)`);
			const [account] = await transaction
				.select({ id: user.id })
				.from(user)
				.where(eq(user.id, userId))
				.limit(1);
			if (!account) throw new NotFoundError('Account was not found');
			const reviews = await transaction
				.select({ id: placeReview.id })
				.from(placeReview)
				.where(eq(placeReview.authorId, userId));
			const reviewIds = reviews.map((record) => record.id);
			const openCases =
				reviewIds.length === 0
					? []
					: await transaction
							.select({ id: reviewNotice.id, reviewId: reviewPublication.reviewId })
							.from(reviewNotice)
							.innerJoin(reviewPublication, eq(reviewPublication.id, reviewNotice.publicationId))
							.where(
								and(
									inArray(reviewPublication.reviewId, reviewIds),
									inArray(reviewNotice.status, [
										'received',
										'awaiting-submissions',
										'under-review',
										'decided'
									])
								)
							);
			const heldReviewIds = new Set(openCases.map((record) => record.reviewId));
			for (const caseRecord of openCases) {
				await transaction
					.insert(reviewRetentionHold)
					.values({
						id: this.id(),
						reviewId: caseRecord.reviewId,
						noticeId: caseRecord.id,
						reasonCode: 'active-review-case',
						placedAt: now,
						expiresAt: addDays(now, 180)
					})
					.onConflictDoNothing();
			}
			if (reviewIds.length > 0) {
				await transaction
					.update(reviewPublication)
					.set({
						lifecycle: 'removed',
						removedAt: now,
						interimRestrictedAt: null,
						visibilityReason: 'account-erasure'
					})
					.where(inArray(reviewPublication.reviewId, reviewIds));
				const redactReviewIds = reviewIds.filter((reviewId) => !heldReviewIds.has(reviewId));
				if (redactReviewIds.length > 0) await this.redact(transaction, redactReviewIds, now);
			}
			await transaction.delete(user).where(eq(user.id, userId));
			return { erased: true, heldReviewIds: [...heldReviewIds] };
		});
	}

	async releaseExpiredHolds(limit = 100) {
		const now = this.clock();
		return this.database.transaction(async (transaction) => {
			const holds = await transaction
				.select()
				.from(reviewRetentionHold)
				.where(and(isNull(reviewRetentionHold.releasedAt), lte(reviewRetentionHold.expiresAt, now)))
				.limit(limit)
				.for('update', { skipLocked: true });
			const reviewIds = [...new Set(holds.map((hold) => hold.reviewId))];
			for (const reviewId of reviewIds) {
				const [remaining] = await transaction
					.select({ id: reviewRetentionHold.id })
					.from(reviewRetentionHold)
					.where(
						and(
							eq(reviewRetentionHold.reviewId, reviewId),
							isNull(reviewRetentionHold.releasedAt),
							gt(reviewRetentionHold.expiresAt, now)
						)
					)
					.limit(1);
				if (!remaining) await this.redact(transaction, [reviewId], now);
			}
			if (holds.length > 0) {
				await transaction
					.update(reviewRetentionHold)
					.set({ releasedAt: now })
					.where(
						inArray(
							reviewRetentionHold.id,
							holds.map((hold) => hold.id)
						)
					);
			}
			return holds.length;
		});
	}

	private async redact(
		transaction: Parameters<Parameters<Database['transaction']>[0]>[0],
		reviewIds: string[],
		now: Date
	) {
		await transaction.execute(sql`select set_config('app.review_erasure', 'on', true)`);
		await transaction
			.update(reviewVersion)
			.set({ body: '[erased]', pseudonymSnapshot: 'Erased author' })
			.where(
				inArray(
					reviewVersion.publicationId,
					transaction
						.select({ id: reviewPublication.id })
						.from(reviewPublication)
						.where(inArray(reviewPublication.reviewId, reviewIds))
				)
			);
		for (const reviewId of reviewIds) {
			await transaction.insert(reviewModerationEvent).values({
				id: this.id(),
				reviewId,
				actorType: 'system',
				action: 'review-content-erased',
				reasonCode: 'account-erasure',
				createdAt: now
			});
		}
	}
}
