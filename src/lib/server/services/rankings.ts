import { newApplicationId } from '$lib/domain/ids';
import type {
	ComparisonOutcome,
	RankingCategory,
	RankingDirection
} from '$lib/domain/ranking/contracts';
import {
	createPlacedRankingRevision,
	createRankingRevision,
	deriveRankingProjection
} from '$lib/domain/ranking/revision';
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
		const [placeIds, baseRevision] = await Promise.all([
			this.rankings.listVisitedPlaceIds(ownerId, listId),
			this.rankings.loadCurrentRevision(ownerId, listId)
		]);
		if (placeIds.length < 2)
			throw new DomainValidationError('At least two visited places are required');
		const session = baseRevision
			? RankingSession.rebuild({
					id: this.createId(),
					listId,
					baseRevision,
					placeIds
				})
			: RankingSession.initial({ id: this.createId(), listId, placeIds });
		await this.rankings.saveSession(ownerId, session, await this.captureContext(ownerId, now), now);
		return session;
	}

	async startInsertionSession(ownerId: string, listId: string, newPlaceId: string) {
		const now = this.clock();
		const existing = await this.rankings.findOpenSession(ownerId, listId, now);
		if (existing) return existing;
		const baseRevision = await this.rankings.loadCurrentRevision(ownerId, listId);
		if (!baseRevision || baseRevision.unresolvedRelations.length > 0) {
			return this.startInitialSession(ownerId, listId);
		}
		const session = RankingSession.insertion({
			id: this.createId(),
			listId,
			baseRevision,
			newPlaceId
		});
		await this.rankings.saveSession(ownerId, session, await this.captureContext(ownerId, now), now);
		return session;
	}

	async startUsefulSession(ownerId: string, listId: string) {
		const now = this.clock();
		const existing = await this.rankings.findOpenSession(ownerId, listId, now);
		if (existing) return existing;
		const [placeIds, revision] = await Promise.all([
			this.rankings.listVisitedPlaceIds(ownerId, listId),
			this.rankings.loadCurrentRevision(ownerId, listId)
		]);
		if (placeIds.length < 2) {
			throw new DomainValidationError('At least two visited places are required');
		}
		if (!revision) return this.startInitialSession(ownerId, listId);
		const nextAction = deriveRankingProjection(revision).nextAction.type;
		if (nextAction === 'repair') {
			return this.startRepairSession(ownerId, listId);
		}
		const nextUnplaced = placeIds.find((placeId) => !revision.activePlaceIds.includes(placeId));
		if (nextUnplaced) return this.startInsertionSession(ownerId, listId, nextUnplaced);
		if (nextAction === 'continue-ranking') return this.startInitialSession(ownerId, listId);
		throw new DomainValidationError('Your ranking is already up to date');
	}

	async startNextUnplacedSession(ownerId: string, listId: string) {
		const existing = await this.rankings.findOpenSession(ownerId, listId, this.clock());
		if (existing) return existing;
		const [placeIds, revision] = await Promise.all([
			this.rankings.listVisitedPlaceIds(ownerId, listId),
			this.rankings.loadCurrentRevision(ownerId, listId)
		]);
		const nextUnplaced = placeIds.find((placeId) => !revision?.activePlaceIds.includes(placeId));
		if (!nextUnplaced) return undefined;
		return this.startInsertionSession(ownerId, listId, nextUnplaced);
	}

	async startRepairSession(ownerId: string, listId: string) {
		const now = this.clock();
		const existing = await this.rankings.findOpenSession(ownerId, listId, now);
		if (existing) return existing;
		const baseRevision = await this.rankings.loadCurrentRevision(ownerId, listId);
		if (!baseRevision) throw new DomainValidationError('Publish a ranking before repairing it');
		const session = RankingSession.repair({ id: this.createId(), listId, baseRevision });
		await this.rankings.saveSession(ownerId, session, await this.captureContext(ownerId, now), now);
		return session;
	}

	async startReconsiderSession(ownerId: string, listId: string, evidenceId: string) {
		const now = this.clock();
		const existing = await this.rankings.findOpenSession(ownerId, listId, now);
		if (existing) return existing;
		const baseRevision = await this.rankings.loadCurrentRevision(ownerId, listId);
		if (!baseRevision)
			throw new DomainValidationError('Publish a ranking before changing an answer');
		const session = RankingSession.reconsider({
			id: this.createId(),
			listId,
			baseRevision,
			evidenceId
		});
		await this.rankings.saveSession(ownerId, session, await this.captureContext(ownerId, now), now);
		return session;
	}

	async startRepositionSession(ownerId: string, listId: string, placeId: string) {
		const now = this.clock();
		const existing = await this.rankings.findOpenSession(ownerId, listId, now);
		if (existing) return existing;
		const baseRevision = await this.rankings.loadCurrentRevision(ownerId, listId);
		if (!baseRevision) throw new DomainValidationError('Publish a ranking before repositioning it');
		if (baseRevision.unresolvedRelations.length > 0) {
			throw new DomainValidationError(
				'Resolve the incomplete ranking before repositioning one restaurant'
			);
		}
		if (!baseRevision.activePlaceIds.includes(placeId)) {
			throw new DomainValidationError('The restaurant is not part of the current ranking');
		}
		const session = RankingSession.reposition({
			id: this.createId(),
			listId,
			baseRevision,
			placeId
		});
		await this.rankings.saveSession(ownerId, session, await this.captureContext(ownerId, now), now);
		return session;
	}

	async adjustAdjacentPlace(
		ownerId: string,
		listId: string,
		placeId: string,
		direction: RankingDirection,
		expectedRevisionId: string
	) {
		const now = this.clock();
		const open = await this.rankings.findOpenSession(ownerId, listId, now);
		if (open) throw new ConflictError('Finish or supersede the open ranking session first');
		const baseRevision = await this.rankings.loadCurrentRevision(ownerId, listId);
		if (!baseRevision) throw new DomainValidationError('Publish a ranking before adjusting it');
		if (baseRevision.id !== expectedRevisionId) {
			throw new ConflictError('The ranking changed before the adjustment was applied');
		}
		let session: RankingSession;
		try {
			session = RankingSession.adjustment({
				id: this.createId(),
				listId,
				baseRevision,
				placeId,
				direction
			});
		} catch (error) {
			if (error instanceof Error) throw new DomainValidationError(error.message);
			throw error;
		}
		const outcome = session.adjustmentOutcome();
		if (!outcome) throw new DomainValidationError('The ranking adjustment has no asserted outcome');
		session.submit(outcome);
		await this.rankings.saveSession(ownerId, session, await this.captureContext(ownerId, now), now);
		return this.publishCompletedSession(ownerId, session.id, baseRevision.category);
	}

	async removeRankedPlace(
		ownerId: string,
		listId: string,
		category: RankingCategory,
		placeId: string
	) {
		const now = this.clock();
		const open = await this.rankings.findOpenSession(ownerId, listId, now);
		if (open) throw new ConflictError('Finish or supersede the open ranking session first');
		const base = await this.rankings.loadCurrentRevision(ownerId, listId);
		if (!base || !base.activePlaceIds.includes(placeId)) {
			throw new NotFoundError('The ranked place was not found');
		}
		const activePlaceIds = base.activePlaceIds.filter((item) => item !== placeId);
		if (activePlaceIds.length === 0) {
			throw new DomainValidationError('Delete the list instead of removing its final place');
		}
		const evidence = [
			...base.activeEvidence,
			...base.excludedEvidence.map((item) => item.evidence)
		].filter((item) => item.leftPlaceId !== placeId && item.rightPlaceId !== placeId);
		const invalidatedEvidenceIds = base.excludedEvidence
			.filter(
				(item) =>
					item.reason === 'invalidated' &&
					item.evidence.leftPlaceId !== placeId &&
					item.evidence.rightPlaceId !== placeId
			)
			.map((item) => item.evidence.id);
		const capture = await this.captureContext(ownerId, now);
		const revision = createRankingRevision({
			id: this.createId(),
			listId,
			category,
			revision: base.revision + 1,
			activePlaceIds,
			evidence,
			invalidatedEvidenceIds,
			provenance: capture.provenance,
			publishedAt: now.toISOString()
		});
		const published = await this.rankings.publishRevision(ownerId, revision, capture);
		await this.rankings.removeRankedVisitedPlace(ownerId, listId, placeId, published.id);
		return published;
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
		let legacyRebuild = false;
		if (session.baseRevisionId !== base?.id) {
			if (session.purpose === 'initial-order' && !session.baseRevisionId && base) {
				const currentPlaceIds = await this.rankings.listVisitedPlaceIds(ownerId, session.listId);
				legacyRebuild =
					currentPlaceIds.length === session.placeIdsSnapshot.length &&
					currentPlaceIds.every((placeId) => session.placeIdsSnapshot.includes(placeId));
			}
			const publishedEvidenceIds = new Set([
				...(base?.activeEvidence.map((item) => item.id) ?? []),
				...(base?.excludedEvidence.map((item) => item.evidence.id) ?? [])
			]);
			if (base && session.evidence.every((item) => publishedEvidenceIds.has(item.id))) return base;
			if (!legacyRebuild)
				throw new ConflictError('The ranking session is based on a stale revision');
		}
		const activePlaceIds = [...session.placeIdsSnapshot];
		const evidence = session.evidenceForNextRevision(legacyRebuild ? undefined : base);
		const invalidatedEvidenceIds = base ? session.invalidatedEvidenceIdsForNextRevision(base) : [];
		const placedTiers = session.placedTierResult();
		const revisionInput = {
			id: this.createId(),
			listId: session.listId,
			category,
			revision: (base?.revision ?? 0) + 1,
			activePlaceIds,
			evidence,
			invalidatedEvidenceIds,
			provenance: capture.provenance,
			publishedAt: now.toISOString()
		};
		const revision =
			placedTiers && base
				? createPlacedRankingRevision({
						...revisionInput,
						orderedTiers: placedTiers,
						unresolvedRelations: base.unresolvedRelations
					})
				: createRankingRevision(revisionInput);
		return this.rankings.publishRevision(ownerId, revision, capture);
	}
}
