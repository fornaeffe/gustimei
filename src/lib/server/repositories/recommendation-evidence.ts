import { and, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import type {
	ContributionPurpose,
	EvidenceCandidate,
	RecommendationEvidenceDataset
} from '$lib/domain/recommendations/contracts';
import { PolicyEnforcedRecommendationEvidenceSource } from '$lib/domain/recommendations/evidence';
import { MandatoryContributionPolicy } from '$lib/domain/recommendations/policy';
import type { AppEnvironment } from '$lib/server/config/environment';
import type { Database } from '$lib/server/db';
import {
	effectivePlace,
	processingRestriction,
	rankingList,
	rankingRevisionPlace
} from '$lib/server/db/schema';
import type { RankingRepository } from './rankings';

/**
 * The only database-backed model-input boundary. It deliberately has no dependency on comments,
 * search text, or route code and always applies the product's mandatory contribution policy.
 */
export class DatabaseRecommendationEvidenceSource {
	readonly #policy = new MandatoryContributionPolicy();

	constructor(
		private readonly database: Database,
		private readonly rankings: RankingRepository,
		private readonly environment: AppEnvironment
	) {}

	async read(purpose: ContributionPurpose): Promise<RecommendationEvidenceDataset> {
		const aggregates = await this.database
			.select({
				listId: rankingList.id,
				ownerId: rankingList.ownerId,
				category: rankingList.category,
				currentRevisionId: rankingList.currentRevisionId
			})
			.from(rankingList)
			.where(isNotNull(rankingList.currentRevisionId));
		const candidates: EvidenceCandidate[] = [];
		for (const aggregate of aggregates) {
			const revision = await this.rankings.loadCurrentRevision(aggregate.ownerId, aggregate.listId);
			if (!revision) continue;
			const [restrictions, quarantined] = await Promise.all([
				this.database
					.select({ purpose: processingRestriction.purpose })
					.from(processingRestriction)
					.where(
						and(
							eq(processingRestriction.userId, aggregate.ownerId),
							eq(processingRestriction.category, aggregate.category),
							eq(processingRestriction.purpose, purpose),
							isNull(processingRestriction.liftedAt)
						)
					),
				this.database
					.select({ placeId: rankingRevisionPlace.placeId })
					.from(rankingRevisionPlace)
					.innerJoin(effectivePlace, eq(effectivePlace.placeId, rankingRevisionPlace.placeId))
					.where(
						and(
							eq(rankingRevisionPlace.revisionId, revision.id),
							ne(effectivePlace.status, 'active')
						)
					)
			]);
			candidates.push({
				userId: aggregate.ownerId,
				revision,
				policyContext: {
					environment: this.environment,
					accountDeleted: false,
					categoryDeleted: false,
					currentRevision: aggregate.currentRevisionId === revision.id,
					evidenceValid: true,
					restrictedPurposes: restrictions.map((item) => item.purpose)
				},
				quarantinedPlaceIds: quarantined.map((item) => item.placeId)
			});
		}
		return new PolicyEnforcedRecommendationEvidenceSource(candidates, this.#policy).read(purpose);
	}
}
