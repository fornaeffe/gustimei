import { and, eq } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import { personalPlaceComment, rankingList, rankingListPlace } from '$lib/server/db/schema';

export interface PersonalCommentRecord {
	ownerId: string;
	placeId: string;
	listId: string;
	body: string;
	createdAt: Date;
	updatedAt: Date;
}

export class PersonalCommentRepository {
	constructor(private readonly database: Database) {}

	async findVisitedPlace(ownerId: string, placeId: string) {
		const [record] = await this.database
			.select({ listId: rankingListPlace.listId })
			.from(rankingListPlace)
			.innerJoin(
				rankingList,
				and(eq(rankingList.id, rankingListPlace.listId), eq(rankingList.ownerId, ownerId))
			)
			.where(and(eq(rankingListPlace.ownerId, ownerId), eq(rankingListPlace.placeId, placeId)))
			.limit(1);
		return record;
	}

	async get(ownerId: string, placeId: string): Promise<PersonalCommentRecord | undefined> {
		const [record] = await this.database
			.select()
			.from(personalPlaceComment)
			.where(
				and(eq(personalPlaceComment.ownerId, ownerId), eq(personalPlaceComment.placeId, placeId))
			)
			.limit(1);
		return record;
	}

	async upsert(input: {
		ownerId: string;
		placeId: string;
		listId: string;
		body: string;
		now: Date;
	}): Promise<PersonalCommentRecord> {
		const [record] = await this.database
			.insert(personalPlaceComment)
			.values({
				ownerId: input.ownerId,
				placeId: input.placeId,
				listId: input.listId,
				body: input.body,
				createdAt: input.now,
				updatedAt: input.now
			})
			.onConflictDoUpdate({
				target: [personalPlaceComment.ownerId, personalPlaceComment.placeId],
				set: { body: input.body, updatedAt: input.now }
			})
			.returning();
		return record;
	}

	async delete(ownerId: string, placeId: string) {
		const deleted = await this.database
			.delete(personalPlaceComment)
			.where(
				and(eq(personalPlaceComment.ownerId, ownerId), eq(personalPlaceComment.placeId, placeId))
			)
			.returning({ placeId: personalPlaceComment.placeId });
		return deleted.length > 0;
	}

	async listForOwner(ownerId: string) {
		return this.database
			.select()
			.from(personalPlaceComment)
			.where(eq(personalPlaceComment.ownerId, ownerId));
	}
}
