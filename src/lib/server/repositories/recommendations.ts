import { and, asc, eq, inArray } from 'drizzle-orm';
import type { RankingCategory } from '$lib/domain/ranking/contracts';
import type { Database } from '$lib/server/db';
import { effectivePlace, place } from '$lib/server/db/schema';

export interface RecommendationCandidatePlace {
	placeId: string;
	name: string;
	category: RankingCategory;
	displayLocality: string;
	addressLabel?: string;
	updatedAt: Date;
}

export class RecommendationRepository {
	constructor(private readonly database: Database) {}

	async loadCandidates(input: {
		category: RankingCategory;
		dataClass: 'real' | 'synthetic';
		placeIds: readonly string[];
	}) {
		if (input.placeIds.length === 0) return [];
		const rows = await this.database
			.select({
				placeId: effectivePlace.placeId,
				name: effectivePlace.name,
				category: effectivePlace.category,
				displayLocality: effectivePlace.displayLocality,
				addressLabel: effectivePlace.addressLabel,
				updatedAt: effectivePlace.updatedAt
			})
			.from(effectivePlace)
			.innerJoin(place, eq(place.id, effectivePlace.placeId))
			.where(
				and(
					eq(effectivePlace.category, input.category),
					eq(effectivePlace.status, 'active'),
					eq(place.dataClass, input.dataClass),
					inArray(effectivePlace.placeId, [...input.placeIds])
				)
			)
			.orderBy(asc(effectivePlace.placeId));
		return rows.map((row): RecommendationCandidatePlace => ({
			...row,
			addressLabel: row.addressLabel ?? undefined
		}));
	}
}

export function fingerprintRecommendationCatalogue(
	candidates: readonly RecommendationCandidatePlace[]
) {
	let hash = 2_166_136_261;
	for (const candidate of candidates) {
		const value = `${candidate.placeId}:${candidate.updatedAt.toISOString()}`;
		for (let index = 0; index < value.length; index += 1) {
			hash ^= value.charCodeAt(index);
			hash = Math.imul(hash, 16_777_619);
		}
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}
