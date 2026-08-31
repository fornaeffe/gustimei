import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import type { RankingCategory, RankingRevision } from '$lib/domain/ranking/contracts';
import type { Database } from '$lib/server/db';
import { recommendationAttribution } from '$lib/server/db/schema';
import type { ProductAnalyticsService } from './product-analytics';

export class RecommendationAttributionService {
	constructor(
		private readonly database: Database,
		private readonly analytics: ProductAnalyticsService,
		private readonly clock: () => Date = () => new Date()
	) {}

	async recordRenderedExposures(input: {
		userId: string;
		category: RankingCategory;
		cohortAssignmentId: string;
		provenance: RankingRevision['provenance'];
		artifactId: string;
		rankingRevisionId?: string;
		eligibleUnvisitedPlaceIds: readonly string[];
	}) {
		if (input.provenance === 'synthetic' || input.eligibleUnvisitedPlaceIds.length === 0) return 0;
		const now = this.clock();
		const placeIds = [...new Set(input.eligibleUnvisitedPlaceIds)];
		for (const placeId of placeIds) {
			await this.database
				.insert(recommendationAttribution)
				.values({
					userId: input.userId,
					category: input.category,
					placeId,
					cohortAssignmentId: input.cohortAssignmentId,
					artifactId: input.artifactId,
					rankingRevisionId: input.rankingRevisionId,
					firstExposedAt: now,
					mostRecentExposedAt: now
				})
				.onConflictDoUpdate({
					target: [
						recommendationAttribution.userId,
						recommendationAttribution.category,
						recommendationAttribution.placeId
					],
					set: {
						cohortAssignmentId: input.cohortAssignmentId,
						artifactId: input.artifactId,
						rankingRevisionId: input.rankingRevisionId,
						mostRecentExposedAt: now
					},
					setWhere: isNull(recommendationAttribution.convertedAt)
				});
		}
		await this.analytics.record({
			userId: input.userId,
			cohortAssignmentId: input.cohortAssignmentId,
			name: 'recommendation-exposed',
			category: input.category,
			metadata: { exposureCount: placeIds.length }
		});
		return placeIds.length;
	}

	async attributeVisitedConversion(input: {
		userId: string;
		category: RankingCategory;
		placeId: string;
		cohortAssignmentId: string;
		provenance: RankingRevision['provenance'];
	}) {
		if (input.provenance === 'synthetic') return false;
		const now = this.clock();
		const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1_000);
		const [converted] = await this.database
			.update(recommendationAttribution)
			.set({ convertedAt: now })
			.where(
				and(
					eq(recommendationAttribution.userId, input.userId),
					eq(recommendationAttribution.category, input.category),
					eq(recommendationAttribution.placeId, input.placeId),
					isNull(recommendationAttribution.convertedAt),
					gte(recommendationAttribution.mostRecentExposedAt, cutoff),
					lte(recommendationAttribution.mostRecentExposedAt, now)
				)
			)
			.returning({ placeId: recommendationAttribution.placeId });
		if (!converted) return false;
		await this.analytics.record({
			userId: input.userId,
			cohortAssignmentId: input.cohortAssignmentId,
			name: 'recommendation-converted',
			category: input.category
		});
		return true;
	}
}
