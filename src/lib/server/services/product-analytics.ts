import { newApplicationId } from '$lib/domain/ids';
import type { RankingCategory } from '$lib/domain/ranking/contracts';
import type { Database } from '$lib/server/db';
import { productAnalyticsEvent } from '$lib/server/db/schema';

export type PhaseFourEventName =
	| 'catalogue-search'
	| 'visited-place-added'
	| 'visited-place-removed'
	| 'ranking-threshold-reached'
	| 'ranking-started';

const allowedMetadata = new Set(['resultCount', 'selectedCount', 'localityFiltered', 'duplicate']);

export class ProductAnalyticsService {
	constructor(
		private readonly database: Database,
		private readonly clock: () => Date = () => new Date(),
		private readonly createId: () => string = () => newApplicationId()
	) {}

	async record(input: {
		userId: string;
		cohortAssignmentId: string;
		name: PhaseFourEventName;
		category: RankingCategory;
		metadata?: Record<string, number | boolean | string>;
	}) {
		const metadata = Object.fromEntries(
			Object.entries(input.metadata ?? {}).filter(([key]) => allowedMetadata.has(key))
		);
		await this.database.insert(productAnalyticsEvent).values({
			id: this.createId(),
			userId: input.userId,
			cohortAssignmentId: input.cohortAssignmentId,
			name: input.name,
			category: input.category,
			metadata,
			occurredAt: this.clock()
		});
	}
}
