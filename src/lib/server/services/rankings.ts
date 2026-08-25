import { newApplicationId } from '$lib/domain/ids';
import type { ComparisonOutcome, RankingCategory } from '$lib/domain/ranking/contracts';
import { createRankingRevision } from '$lib/domain/ranking/revision';
import { RankingSession } from '$lib/domain/ranking/session';
import type { AppEnvironment } from '$lib/server/config/environment';
import { ConflictError, DomainValidationError, NotFoundError } from '$lib/server/domain/errors';
import type { ParticipationRepository } from '$lib/server/repositories/participation';
import type { CaptureContext, RankingRepository } from '$lib/server/repositories/rankings';

export class RankingService {
	constructor(
		private readonly rankings: RankingRepository,
		private readonly participation: ParticipationRepository,
		private readonly environment: AppEnvironment,
		private readonly clock: () => Date = () => new Date(),
		private readonly createId: () => string = () => newApplicationId()
	) {}

	async captureContext(ownerId: string, at = this.clock()): Promise<CaptureContext> {
		let result;
		try {
			result = await this.participation.effectiveAssignment(ownerId, at);
		} catch (error) {
			if (!(error instanceof NotFoundError)) throw error;
			const provenance =
				this.environment === 'test'
					? 'synthetic'
					: this.environment === 'development'
						? 'internal-testing'
						: this.environment === 'preview'
							? 'private-beta'
							: 'general-release';
			const cohort = await this.participation.defineCohort(
				{
					id: this.createId(),
					slug: `${this.environment}-default`,
					provenance,
					environment: this.environment,
					description: `Default ${this.environment} product cohort`
				},
				at
			);
			await this.participation.assign({
				id: this.createId(),
				userId: ownerId,
				cohortId: cohort.id,
				effectiveFrom: at
			});
			result = await this.participation.effectiveAssignment(ownerId, at);
		}
		const { assignment, cohort } = result;
		if (cohort.environment !== this.environment) {
			throw new DomainValidationError('Participation cohorts cannot cross environments');
		}
		return {
			cohortAssignmentId: assignment.id,
			provenance: cohort.provenance,
			environment: this.environment
		};
	}

	async catalogueDataClass(ownerId: string) {
		return (await this.captureContext(ownerId)).provenance === 'synthetic' ? 'synthetic' : 'real';
	}

	async getOrCreateList(ownerId: string, category: RankingCategory) {
		return this.rankings.getOrCreateList({
			id: this.createId(),
			ownerId,
			category,
			now: this.clock()
		});
	}

	async addVisitedPlace(ownerId: string, listId: string, placeId: string) {
		const now = this.clock();
		return this.rankings.addVisitedPlace({
			ownerId,
			listId,
			placeId,
			capture: await this.captureContext(ownerId, now),
			now
		});
	}

	async selectVisitedPlace(ownerId: string, category: RankingCategory, placeId: string) {
		const now = this.clock();
		return this.rankings.createListWithFirstPlace({
			id: this.createId(),
			ownerId,
			category,
			placeId,
			capture: await this.captureContext(ownerId, now),
			now
		});
	}

	async listVisitedPlaces(ownerId: string, category: RankingCategory) {
		return this.rankings.listVisitedPlaces(ownerId, category);
	}

	async removeUnrankedVisitedPlace(ownerId: string, category: RankingCategory, placeId: string) {
		return this.rankings.removeUnrankedVisitedPlace(ownerId, category, placeId);
	}

	async startInitialSession(ownerId: string, listId: string) {
		const now = this.clock();
		const existing = await this.rankings.findOpenSession(ownerId, listId, now);
		if (existing) return existing;
		const placeIds = await this.rankings.listVisitedPlaceIds(ownerId, listId);
		if (placeIds.length < 2)
			throw new DomainValidationError('At least two visited places are required');
		const session = RankingSession.initial({ id: this.createId(), listId, placeIds });
		await this.rankings.saveSession(ownerId, session, await this.captureContext(ownerId, now), now);
		return session;
	}

	async submit(
		ownerId: string,
		sessionId: string,
		expectedComparisonId: string,
		outcome: ComparisonOutcome
	) {
		const now = this.clock();
		return this.rankings.submitSessionOutcome({
			ownerId,
			sessionId,
			expectedComparisonId,
			outcome,
			capture: await this.captureContext(ownerId, now),
			now
		});
	}

	async undo(ownerId: string, sessionId: string, expectedEvidenceId: string) {
		const now = this.clock();
		return this.rankings.undoSessionOutcome({
			ownerId,
			sessionId,
			expectedEvidenceId,
			capture: await this.captureContext(ownerId, now),
			now
		});
	}

	async publishCompletedSession(ownerId: string, sessionId: string, category: RankingCategory) {
		const session = await this.rankings.loadSession(ownerId, sessionId);
		if (session.lifecycle !== 'completed')
			throw new ConflictError('The ranking session is not complete');
		const now = this.clock();
		const capture = await this.captureContext(ownerId, now);
		const base = await this.rankings.loadCurrentRevision(ownerId, session.listId);
		if (session.baseRevisionId !== base?.id) {
			const publishedEvidenceIds = new Set([
				...(base?.activeEvidence.map((item) => item.id) ?? []),
				...(base?.excludedEvidence.map((item) => item.evidence.id) ?? [])
			]);
			if (base && session.evidence.every((item) => publishedEvidenceIds.has(item.id))) return base;
			throw new ConflictError('The ranking session is based on a stale revision');
		}
		const activePlaceIds = [...session.placeIdsSnapshot];
		const revision = createRankingRevision({
			id: this.createId(),
			listId: session.listId,
			category,
			revision: (base?.revision ?? 0) + 1,
			activePlaceIds,
			evidence: session.evidenceForNextRevision(base),
			provenance: capture.provenance,
			publishedAt: now.toISOString()
		});
		return this.rankings.publishRevision(ownerId, revision, capture);
	}
}
