import { and, eq, gt, isNull, lte, or } from 'drizzle-orm';
import type { RankingRevision } from '$lib/domain/ranking/contracts';
import type { AppEnvironment } from '$lib/server/config/environment';
import type { Database } from '$lib/server/db';
import {
	participationAssignment,
	participationCohort,
	processingRestriction
} from '$lib/server/db/schema';
import { ConflictError, NotFoundError } from '$lib/server/domain/errors';

export interface CohortDefinition {
	id: string;
	slug: string;
	provenance: RankingRevision['provenance'];
	environment: AppEnvironment;
	description: string;
}

export class ParticipationRepository {
	constructor(private readonly database: Database) {}

	async defineCohort(definition: CohortDefinition, now = new Date()) {
		const [cohort] = await this.database
			.insert(participationCohort)
			.values({ ...definition, createdAt: now })
			.onConflictDoNothing({ target: participationCohort.slug })
			.returning();
		if (cohort) return cohort;
		const [existing] = await this.database
			.select()
			.from(participationCohort)
			.where(eq(participationCohort.slug, definition.slug));
		if (
			!existing ||
			existing.provenance !== definition.provenance ||
			existing.environment !== definition.environment
		) {
			throw new ConflictError('The cohort slug is already assigned to a different definition');
		}
		return existing;
	}

	async assign(input: { id: string; userId: string; cohortId: string; effectiveFrom: Date }) {
		return this.database.transaction(async (transaction) => {
			const [current] = await transaction
				.select({ effectiveFrom: participationAssignment.effectiveFrom })
				.from(participationAssignment)
				.where(
					and(
						eq(participationAssignment.userId, input.userId),
						isNull(participationAssignment.effectiveTo)
					)
				);
			if (current && current.effectiveFrom >= input.effectiveFrom) {
				throw new ConflictError('A cohort assignment must advance effective time');
			}
			await transaction
				.update(participationAssignment)
				.set({ effectiveTo: input.effectiveFrom })
				.where(
					and(
						eq(participationAssignment.userId, input.userId),
						isNull(participationAssignment.effectiveTo),
						lte(participationAssignment.effectiveFrom, input.effectiveFrom)
					)
				);
			const [assignment] = await transaction
				.insert(participationAssignment)
				.values({ ...input, createdAt: input.effectiveFrom })
				.returning();
			return assignment;
		});
	}

	async effectiveAssignment(userId: string, capturedAt: Date) {
		const [result] = await this.database
			.select({ assignment: participationAssignment, cohort: participationCohort })
			.from(participationAssignment)
			.innerJoin(participationCohort, eq(participationCohort.id, participationAssignment.cohortId))
			.where(
				and(
					eq(participationAssignment.userId, userId),
					lte(participationAssignment.effectiveFrom, capturedAt),
					or(
						isNull(participationAssignment.effectiveTo),
						gt(participationAssignment.effectiveTo, capturedAt)
					)
				)
			)
			.limit(1);
		if (!result) throw new NotFoundError('No participation cohort covers the capture time');
		return result;
	}
}

export class ProcessingRestrictionRepository {
	constructor(private readonly database: Database) {}

	async restrict(input: typeof processingRestriction.$inferInsert) {
		const [record] = await this.database.insert(processingRestriction).values(input).returning();
		return record;
	}

	async lift(id: string, liftedAt: Date) {
		const [record] = await this.database
			.update(processingRestriction)
			.set({ liftedAt })
			.where(and(eq(processingRestriction.id, id), isNull(processingRestriction.liftedAt)))
			.returning();
		if (!record) throw new NotFoundError('The active processing restriction was not found');
		return record;
	}

	async activePurposes(userId: string, category: 'restaurant' | 'hotel') {
		const rows = await this.database
			.select({ purpose: processingRestriction.purpose })
			.from(processingRestriction)
			.where(
				and(
					eq(processingRestriction.userId, userId),
					eq(processingRestriction.category, category),
					isNull(processingRestriction.liftedAt)
				)
			);
		return rows.map((row) => row.purpose);
	}
}
