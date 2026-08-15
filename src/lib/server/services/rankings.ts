import { newApplicationId } from '$lib/domain/ids';
import type { ComparisonOutcome, RankingCategory } from '$lib/domain/ranking/contracts';
import { createRankingRevision } from '$lib/domain/ranking/revision';
import { RankingSession } from '$lib/domain/ranking/session';
import type { AppEnvironment } from '$lib/server/config/environment';
import { ConflictError, DomainValidationError } from '$lib/server/domain/errors';
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
		const { assignment, cohort } = await this.participation.effectiveAssignment(ownerId, at);
		if (cohort.environment !== this.environment) {
			throw new DomainValidationError('Participation cohorts cannot cross environments');
		}
		return {
			cohortAssignmentId: assignment.id,
			provenance: cohort.provenance,
			environment: this.environment
		};
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

	async startInitialSession(ownerId: string, listId: string) {
		const placeIds = await this.rankings.listVisitedPlaceIds(ownerId, listId);
		if (placeIds.length < 2)
			throw new DomainValidationError('At least two visited places are required');
		const now = this.clock();
		const session = RankingSession.initial({ id: this.createId(), listId, placeIds });
		await this.rankings.saveSession(ownerId, session, await this.captureContext(ownerId, now), now);
		return session;
	}

	async submit(ownerId: string, sessionId: string, outcome: ComparisonOutcome) {
		const session = await this.rankings.loadSession(ownerId, sessionId);
		session.submit(outcome);
		const now = this.clock();
		await this.rankings.saveSession(ownerId, session, await this.captureContext(ownerId, now), now);
		return session;
	}

	async undo(ownerId: string, sessionId: string) {
		const session = await this.rankings.loadSession(ownerId, sessionId);
		if (!session.undo()) return false;
		const now = this.clock();
		await this.rankings.saveSession(ownerId, session, await this.captureContext(ownerId, now), now);
		return true;
	}

	async publishCompletedSession(ownerId: string, sessionId: string, category: RankingCategory) {
		const session = await this.rankings.loadSession(ownerId, sessionId);
		if (session.lifecycle !== 'completed')
			throw new ConflictError('The ranking session is not complete');
		const now = this.clock();
		const capture = await this.captureContext(ownerId, now);
		const base = await this.rankings.loadCurrentRevision(ownerId, session.listId);
		if (session.baseRevisionId !== base?.id) {
			throw new ConflictError('The ranking session is based on a stale revision');
		}
		const activePlaceIds = await this.rankings.listVisitedPlaceIds(ownerId, session.listId);
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
