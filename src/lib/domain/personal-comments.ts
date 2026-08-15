export const PERSONAL_COMMENT_MAX_LENGTH = 2_000;

export interface PersonalPlaceComment {
	ownerId: string;
	placeId: string;
	body: string;
	updatedAt: string;
}

export function normalizePersonalComment(body: string) {
	const normalized = body.replace(/\r\n?/g, '\n');
	if (normalized.includes('\u0000'))
		throw new Error('Personal comments cannot contain null characters');
	if (normalized.length > PERSONAL_COMMENT_MAX_LENGTH) {
		throw new Error(`Personal comments are limited to ${PERSONAL_COMMENT_MAX_LENGTH} characters`);
	}
	return normalized;
}

/**
 * In-memory contract fixture for pure isolation tests. Product persistence uses the owner-scoped
 * Phase 2A repository and deliberately remains outside ranking aggregates.
 */
export class PersonalCommentCollection {
	readonly #comments = new Map<string, PersonalPlaceComment>();

	upsert(comment: PersonalPlaceComment) {
		const saved = { ...comment, body: normalizePersonalComment(comment.body) };
		this.#comments.set(this.#key(comment.ownerId, comment.placeId), saved);
		return structuredClone(saved);
	}

	get(ownerId: string, placeId: string) {
		const comment = this.#comments.get(this.#key(ownerId, placeId));
		return comment ? structuredClone(comment) : undefined;
	}

	delete(ownerId: string, placeId: string) {
		return this.#comments.delete(this.#key(ownerId, placeId));
	}

	#key(ownerId: string, placeId: string) {
		return `${ownerId}\u0000${placeId}`;
	}
}
