import { normalizePersonalComment } from '$lib/domain/personal-comments';
import { NotFoundError } from '$lib/server/domain/errors';
import type { PersonalCommentRepository } from '$lib/server/repositories/personal-comments';

export class PersonalCommentService {
	constructor(
		private readonly comments: PersonalCommentRepository,
		private readonly clock: () => Date = () => new Date()
	) {}

	async get(ownerId: string, placeId: string) {
		return this.comments.get(ownerId, placeId);
	}

	async save(ownerId: string, placeId: string, body: string) {
		const visited = await this.comments.findVisitedPlace(ownerId, placeId);
		if (!visited) throw new NotFoundError('The visited place was not found');
		return this.comments.upsert({
			ownerId,
			placeId,
			listId: visited.listId,
			body: normalizePersonalComment(body),
			now: this.clock()
		});
	}

	async delete(ownerId: string, placeId: string) {
		return this.comments.delete(ownerId, placeId);
	}
}
