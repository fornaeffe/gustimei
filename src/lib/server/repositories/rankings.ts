import { and, asc, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { AppEnvironment } from '$lib/server/config/environment';
import type {
	ComparisonEvidence,
	ComparisonOutcome,
	RankingCategory,
	RankingRevision
} from '$lib/domain/ranking/contracts';
import { RANKING_ENGINE_VERSION } from '$lib/domain/ranking/contracts';
import { RankingSession } from '$lib/domain/ranking/session';
import type { Database } from '$lib/server/db';
import {
	comparisonEvidence,
	catalogueListPlaceSupersession,
	effectivePlace,
	personalPlaceComment,
	place,
	rankingList,
	rankingListPlace,
	rankingRevision,
	rankingRevisionEvidence,
	rankingRevisionPlace,
	rankingSession,
	rankingUnresolvedRelation
} from '$lib/server/db/schema';
import { ConflictError, DomainValidationError, NotFoundError } from '$lib/server/domain/errors';

export interface CaptureContext {
	cohortAssignmentId: string;
	provenance: RankingRevision['provenance'];
	environment: AppEnvironment;
}

export const RANKING_SESSION_IDLE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1_000;

function permitsDataClass(capture: CaptureContext, dataClass: 'real' | 'synthetic') {
	if (capture.provenance === 'synthetic') {
		return ['development', 'test'].includes(capture.environment);
	}
	return dataClass === 'real';
}

function persistedEvidence(
	row: typeof comparisonEvidence.$inferSelect,
	revisionSequence = row.sequence
): ComparisonEvidence {
	return {
		id: row.id,
		logicalPair: [row.logicalFirstPlaceId, row.logicalSecondPlaceId],
		leftPlaceId: row.leftPlaceId,
		rightPlaceId: row.rightPlaceId,
		reason: row.reason,
		sequence: revisionSequence,
		outcome: row.outcome,
		active: row.active === 1,
		...(row.supersedesEvidenceId ? { supersedesEvidenceId: row.supersedesEvidenceId } : {})
	};
}

export class RankingRepository {
	constructor(private readonly database: Database) {}

	async getOrCreateList(input: {
		id: string;
		ownerId: string;
		category: RankingCategory;
		now: Date;
	}) {
		const [inserted] = await this.database
			.insert(rankingList)
			.values({
				id: input.id,
				ownerId: input.ownerId,
				category: input.category,
				createdAt: input.now,
				updatedAt: input.now
			})
			.onConflictDoNothing({ target: [rankingList.ownerId, rankingList.category] })
			.returning();
		if (inserted) return inserted;
		const [existing] = await this.database
			.select()
			.from(rankingList)
			.where(and(eq(rankingList.ownerId, input.ownerId), eq(rankingList.category, input.category)));
		if (!existing) throw new ConflictError('The ranking list could not be created');
		return existing;
	}

	async addVisitedPlace(input: {
		ownerId: string;
		listId: string;
		placeId: string;
		capture: CaptureContext;
		now: Date;
	}) {
		const [target] = await this.database
			.select({
				list: rankingList,
				placeCategory: place.category,
				dataClass: place.dataClass,
				status: effectivePlace.status
			})
			.from(rankingList)
			.innerJoin(place, eq(place.id, input.placeId))
			.leftJoin(effectivePlace, eq(effectivePlace.placeId, place.id))
			.where(eq(rankingList.id, input.listId));
		if (!target || target.list.ownerId !== input.ownerId) {
			throw new NotFoundError('The ranking list or place was not found');
		}
		if (target.list.category !== target.placeCategory) {
			throw new DomainValidationError('Places cannot cross ranking categories');
		}
		if (!permitsDataClass(input.capture, target.dataClass)) {
			throw new DomainValidationError(
				'The capture provenance cannot use this catalogue data class'
			);
		}
		if (
			input.capture.provenance === 'synthetic' &&
			!['development', 'test'].includes(input.capture.environment)
		) {
			throw new DomainValidationError('Synthetic rankings are forbidden in preview and production');
		}
		if (target.status !== 'active')
			throw new DomainValidationError('The place is not catalogue-eligible');

		const [membership] = await this.database
			.insert(rankingListPlace)
			.values({
				listId: input.listId,
				ownerId: input.ownerId,
				placeId: input.placeId,
				addedAt: input.now
			})
			.onConflictDoNothing()
			.returning();
		return membership;
	}

	async createListWithFirstPlace(input: {
		id: string;
		ownerId: string;
		category: RankingCategory;
		placeId: string;
		capture: CaptureContext;
		now: Date;
	}) {
		return this.database.transaction(async (transaction) => {
			const [target] = await transaction
				.select({
					category: place.category,
					dataClass: place.dataClass,
					status: effectivePlace.status
				})
				.from(place)
				.leftJoin(effectivePlace, eq(effectivePlace.placeId, place.id))
				.where(eq(place.id, input.placeId))
				.limit(1);
			if (!target || target.category !== input.category || target.status !== 'active') {
				throw new DomainValidationError('The place is not eligible for this list');
			}
			if (!permitsDataClass(input.capture, target.dataClass)) {
				throw new DomainValidationError(
					'The capture provenance cannot use this catalogue data class'
				);
			}

			const [created] = await transaction
				.insert(rankingList)
				.values({
					id: input.id,
					ownerId: input.ownerId,
					category: input.category,
					createdAt: input.now,
					updatedAt: input.now
				})
				.onConflictDoNothing({ target: [rankingList.ownerId, rankingList.category] })
				.returning();
			const [list] = created
				? [created]
				: await transaction
						.select()
						.from(rankingList)
						.where(
							and(eq(rankingList.ownerId, input.ownerId), eq(rankingList.category, input.category))
						)
						.limit(1);
			if (!list) throw new ConflictError('The ranking list could not be created');

			const [membership] = await transaction
				.insert(rankingListPlace)
				.values({
					listId: list.id,
					ownerId: input.ownerId,
					placeId: input.placeId,
					addedAt: input.now
				})
				.onConflictDoNothing()
				.returning();
			return { list, membership, added: Boolean(membership) };
		});
	}

	async findList(ownerId: string, category: RankingCategory) {
		const [list] = await this.database
			.select()
			.from(rankingList)
			.where(and(eq(rankingList.ownerId, ownerId), eq(rankingList.category, category)))
			.limit(1);
		return list;
	}

	async listVisitedPlaces(ownerId: string, category: RankingCategory) {
		return this.database
			.select({
				listId: rankingList.id,
				placeId: rankingListPlace.placeId,
				name: effectivePlace.name,
				category: effectivePlace.category,
				displayLocality: effectivePlace.displayLocality,
				addressLabel: effectivePlace.addressLabel,
				addedAt: rankingListPlace.addedAt,
				commentBody: personalPlaceComment.body
			})
			.from(rankingList)
			.innerJoin(rankingListPlace, eq(rankingListPlace.listId, rankingList.id))
			.innerJoin(effectivePlace, eq(effectivePlace.placeId, rankingListPlace.placeId))
			.leftJoin(
				personalPlaceComment,
				and(
					eq(personalPlaceComment.ownerId, ownerId),
					eq(personalPlaceComment.placeId, rankingListPlace.placeId)
				)
			)
			.where(and(eq(rankingList.ownerId, ownerId), eq(rankingList.category, category)))
			.orderBy(asc(rankingListPlace.addedAt), asc(rankingListPlace.placeId));
	}

	async removeUnrankedVisitedPlace(ownerId: string, category: RankingCategory, placeId: string) {
		return this.database.transaction(async (transaction) => {
			const [list] = await transaction
				.select({ id: rankingList.id, currentRevisionId: rankingList.currentRevisionId })
				.from(rankingList)
				.where(and(eq(rankingList.ownerId, ownerId), eq(rankingList.category, category)))
				.limit(1);
			if (!list) return false;
			if (list.currentRevisionId) {
				throw new ConflictError('Ranked places are maintained from the ranking flow');
			}
			const [openSession] = await transaction
				.select({ id: rankingSession.id })
				.from(rankingSession)
				.where(and(eq(rankingSession.listId, list.id), eq(rankingSession.lifecycle, 'open')))
				.limit(1);
			if (openSession) throw new ConflictError('A ranking session is already using this selection');
			const deleted = await transaction
				.delete(rankingListPlace)
				.where(and(eq(rankingListPlace.listId, list.id), eq(rankingListPlace.placeId, placeId)))
				.returning({ placeId: rankingListPlace.placeId });
			if (deleted.length === 0) return false;
			const [{ count }] = await transaction
				.select({ count: sql<number>`count(*)::int` })
				.from(rankingListPlace)
				.where(eq(rankingListPlace.listId, list.id));
			if (count === 0) await transaction.delete(rankingList).where(eq(rankingList.id, list.id));
			return true;
		});
	}

	async removeRankedVisitedPlace(
		ownerId: string,
		listId: string,
		placeId: string,
		expectedRevisionId: string
	) {
		return this.database.transaction(async (transaction) => {
			const [list] = await transaction
				.select({ ownerId: rankingList.ownerId, currentRevisionId: rankingList.currentRevisionId })
				.from(rankingList)
				.where(eq(rankingList.id, listId))
				.limit(1);
			if (!list || list.ownerId !== ownerId)
				throw new NotFoundError('The ranking list was not found');
			if (list.currentRevisionId !== expectedRevisionId) {
				throw new ConflictError('The ranking changed while the place was being removed');
			}
			const [stillRanked] = await transaction
				.select({ placeId: rankingRevisionPlace.placeId })
				.from(rankingRevisionPlace)
				.where(
					and(
						eq(rankingRevisionPlace.revisionId, expectedRevisionId),
						eq(rankingRevisionPlace.placeId, placeId)
					)
				)
				.limit(1);
			if (stillRanked)
				throw new ConflictError('Publish the removal revision before deleting membership');
			const deleted = await transaction
				.delete(rankingListPlace)
				.where(and(eq(rankingListPlace.listId, listId), eq(rankingListPlace.placeId, placeId)))
				.returning({ placeId: rankingListPlace.placeId });
			return deleted.length > 0;
		});
	}

	async listVisitedPlaceIds(ownerId: string, listId: string) {
		const [owned] = await this.database
			.select({ id: rankingList.id })
			.from(rankingList)
			.where(and(eq(rankingList.id, listId), eq(rankingList.ownerId, ownerId)));
		if (!owned) throw new NotFoundError('The ranking list was not found');
		const rows = await this.database
			.select({ placeId: rankingListPlace.placeId })
			.from(rankingListPlace)
			.where(
				and(
					eq(rankingListPlace.listId, listId),
					sql`not exists (
						select 1 from ${catalogueListPlaceSupersession} supersession
						where supersession.list_id = ${rankingListPlace.listId}
							and supersession.source_place_id = ${rankingListPlace.placeId}
							and supersession.reversed_at is null
					)`
				)
			)
			.orderBy(asc(rankingListPlace.addedAt), asc(rankingListPlace.placeId));
		return rows.map((row) => row.placeId);
	}

	async findOpenSession(ownerId: string, listId: string, now = new Date()) {
		const [record] = await this.database
			.select({ session: rankingSession, ownerId: rankingList.ownerId })
			.from(rankingSession)
			.innerJoin(rankingList, eq(rankingList.id, rankingSession.listId))
			.where(
				and(
					eq(rankingSession.listId, listId),
					eq(rankingSession.lifecycle, 'open'),
					gt(rankingSession.updatedAt, new Date(now.getTime() - RANKING_SESSION_IDLE_EXPIRY_MS)),
					eq(rankingList.ownerId, ownerId)
				)
			)
			.orderBy(sql`${rankingSession.updatedAt} desc`)
			.limit(1);
		return record ? RankingSession.resume(record.session.serializedState) : undefined;
	}

	async findCompletedSessionForRevision(ownerId: string, listId: string, revisionId: string) {
		const [record] = await this.database
			.select({ id: rankingSession.id })
			.from(rankingSession)
			.innerJoin(rankingList, eq(rankingList.id, rankingSession.listId))
			.where(
				and(
					eq(rankingSession.listId, listId),
					eq(rankingSession.lifecycle, 'completed'),
					eq(rankingList.ownerId, ownerId),
					sql`exists (
						select 1
						from ${comparisonEvidence}
						inner join ${rankingRevisionEvidence}
							on ${rankingRevisionEvidence.comparisonId} = ${comparisonEvidence.id}
						where ${comparisonEvidence.sessionId} = ${rankingSession.id}
							and ${rankingRevisionEvidence.revisionId} = ${revisionId}
					)`,
					sql`not exists (
						select 1
						from ${comparisonEvidence}
						where ${comparisonEvidence.sessionId} = ${rankingSession.id}
							and not exists (
								select 1
								from ${rankingRevisionEvidence}
								where ${rankingRevisionEvidence.comparisonId} = ${comparisonEvidence.id}
									and ${rankingRevisionEvidence.revisionId} = ${revisionId}
							)
					)`
				)
			)
			.orderBy(desc(rankingSession.updatedAt))
			.limit(1);
		return record;
	}

	async saveSession(ownerId: string, session: RankingSession, capture: CaptureContext, now: Date) {
		return this.database.transaction(async (transaction) => {
			const [owned] = await transaction
				.select({ ownerId: rankingList.ownerId })
				.from(rankingList)
				.where(eq(rankingList.id, session.listId));
			if (!owned || owned.ownerId !== ownerId)
				throw new NotFoundError('The ranking list was not found');
			if (
				capture.provenance === 'synthetic' &&
				!['development', 'test'].includes(capture.environment)
			) {
				throw new DomainValidationError(
					'Synthetic sessions are forbidden in preview and production'
				);
			}

			const summary = session.summary();
			const [existing] = await transaction
				.select({ id: rankingSession.id, listId: rankingSession.listId })
				.from(rankingSession)
				.where(eq(rankingSession.id, session.id));
			if (existing && existing.listId !== session.listId) {
				throw new ConflictError('A ranking session ID cannot move between lists');
			}
			if (!existing && summary.lifecycle === 'open') {
				await transaction
					.update(rankingSession)
					.set({ lifecycle: 'superseded', updatedAt: now, completedAt: now })
					.where(
						and(
							eq(rankingSession.listId, session.listId),
							eq(rankingSession.lifecycle, 'open'),
							session.baseRevisionId
								? eq(rankingSession.baseRevisionId, session.baseRevisionId)
								: isNull(rankingSession.baseRevisionId)
						)
					);
			}

			await transaction
				.insert(rankingSession)
				.values({
					id: session.id,
					listId: session.listId,
					baseRevisionId: session.baseRevisionId,
					purpose: session.purpose,
					lifecycle: summary.lifecycle,
					serializedState: session.serialize(),
					cohortAssignmentId: capture.cohortAssignmentId,
					createdAt: now,
					updatedAt: now,
					completedAt: summary.lifecycle === 'open' ? undefined : now
				})
				.onConflictDoUpdate({
					target: rankingSession.id,
					set: {
						lifecycle: summary.lifecycle,
						serializedState: session.serialize(),
						updatedAt: now,
						completedAt: summary.lifecycle === 'open' ? null : now
					}
				});

			for (const evidence of session.evidence) {
				await transaction
					.insert(comparisonEvidence)
					.values({
						id: evidence.id,
						sessionId: session.id,
						sequence: evidence.sequence,
						logicalFirstPlaceId: evidence.logicalPair[0],
						logicalSecondPlaceId: evidence.logicalPair[1],
						leftPlaceId: evidence.leftPlaceId,
						rightPlaceId: evidence.rightPlaceId,
						outcome: evidence.outcome,
						reason: evidence.reason,
						active: evidence.active ? 1 : 0,
						supersedesEvidenceId: evidence.supersedesEvidenceId,
						capturedAt: now
					})
					.onConflictDoUpdate({
						target: comparisonEvidence.id,
						set: { active: evidence.active ? 1 : 0 }
					});
			}
			return summary;
		});
	}

	async loadSession(ownerId: string, sessionId: string, now = new Date()) {
		return this.database.transaction(async (transaction) => {
			const [record] = await transaction
				.select({ session: rankingSession, ownerId: rankingList.ownerId })
				.from(rankingSession)
				.innerJoin(rankingList, eq(rankingList.id, rankingSession.listId))
				.where(eq(rankingSession.id, sessionId))
				.for('update');
			if (!record || record.ownerId !== ownerId) {
				throw new NotFoundError('The ranking session was not found');
			}
			const session = RankingSession.resume(record.session.serializedState);
			const expired =
				record.session.lifecycle === 'open' &&
				record.session.updatedAt <= new Date(now.getTime() - RANKING_SESSION_IDLE_EXPIRY_MS);
			if (record.session.lifecycle === 'superseded' || expired) session.supersede();
			if (expired) {
				await transaction
					.update(rankingSession)
					.set({
						lifecycle: 'superseded',
						serializedState: session.serialize(),
						updatedAt: now,
						completedAt: now
					})
					.where(eq(rankingSession.id, sessionId));
			}
			return session;
		});
	}

	async submitSessionOutcome(input: {
		ownerId: string;
		sessionId: string;
		expectedComparisonId: string;
		outcome: ComparisonOutcome;
		capture: CaptureContext;
		now: Date;
	}) {
		return this.database.transaction(async (transaction) => {
			const [record] = await transaction
				.select({ session: rankingSession, ownerId: rankingList.ownerId })
				.from(rankingSession)
				.innerJoin(rankingList, eq(rankingList.id, rankingSession.listId))
				.where(eq(rankingSession.id, input.sessionId))
				.for('update');
			if (!record || record.ownerId !== input.ownerId) {
				throw new NotFoundError('The ranking session was not found');
			}
			if (
				input.capture.provenance === 'synthetic' &&
				!['development', 'test'].includes(input.capture.environment)
			) {
				throw new DomainValidationError(
					'Synthetic sessions are forbidden in preview and production'
				);
			}

			const session = RankingSession.resume(record.session.serializedState);
			if (record.session.lifecycle === 'superseded') session.supersede();
			if (
				record.session.lifecycle === 'open' &&
				record.session.updatedAt <= new Date(input.now.getTime() - RANKING_SESSION_IDLE_EXPIRY_MS)
			) {
				session.supersede();
				await transaction
					.update(rankingSession)
					.set({
						lifecycle: 'superseded',
						serializedState: session.serialize(),
						updatedAt: input.now,
						completedAt: input.now
					})
					.where(eq(rankingSession.id, input.sessionId));
				return { session, captured: false };
			}
			const previouslyCaptured = session.evidence.find(
				(item) => item.id === input.expectedComparisonId
			);
			if (previouslyCaptured) {
				if (previouslyCaptured.outcome !== input.outcome) {
					throw new ConflictError('This comparison was already answered differently');
				}
				return { session, captured: false };
			}
			if (session.lifecycle !== 'open') {
				throw new ConflictError('The ranking session is no longer open');
			}
			if (session.nextComparison()?.id !== input.expectedComparisonId) {
				throw new ConflictError('The comparison changed in another tab');
			}

			session.submit(input.outcome);
			const summary = session.summary();
			await transaction
				.update(rankingSession)
				.set({
					lifecycle: summary.lifecycle,
					serializedState: session.serialize(),
					updatedAt: input.now,
					completedAt: summary.lifecycle === 'open' ? null : input.now
				})
				.where(eq(rankingSession.id, session.id));

			const captured = session.evidence.at(-1);
			if (!captured) throw new ConflictError('The comparison outcome was not captured');
			await transaction.insert(comparisonEvidence).values({
				id: captured.id,
				sessionId: session.id,
				sequence: captured.sequence,
				logicalFirstPlaceId: captured.logicalPair[0],
				logicalSecondPlaceId: captured.logicalPair[1],
				leftPlaceId: captured.leftPlaceId,
				rightPlaceId: captured.rightPlaceId,
				outcome: captured.outcome,
				reason: captured.reason,
				active: 1,
				supersedesEvidenceId: captured.supersedesEvidenceId,
				capturedAt: input.now
			});
			return { session, captured: true };
		});
	}

	async undoSessionOutcome(input: {
		ownerId: string;
		sessionId: string;
		expectedEvidenceId: string;
		capture: CaptureContext;
		now: Date;
	}) {
		return this.database.transaction(async (transaction) => {
			if (
				input.capture.provenance === 'synthetic' &&
				!['development', 'test'].includes(input.capture.environment)
			) {
				throw new DomainValidationError(
					'Synthetic sessions are forbidden in preview and production'
				);
			}
			const [record] = await transaction
				.select({ session: rankingSession, ownerId: rankingList.ownerId })
				.from(rankingSession)
				.innerJoin(rankingList, eq(rankingList.id, rankingSession.listId))
				.where(eq(rankingSession.id, input.sessionId))
				.for('update');
			if (!record || record.ownerId !== input.ownerId) {
				throw new NotFoundError('The ranking session was not found');
			}
			const session = RankingSession.resume(record.session.serializedState);
			if (record.session.lifecycle === 'superseded') session.supersede();
			if (
				record.session.lifecycle === 'open' &&
				record.session.updatedAt <= new Date(input.now.getTime() - RANKING_SESSION_IDLE_EXPIRY_MS)
			) {
				session.supersede();
				await transaction
					.update(rankingSession)
					.set({
						lifecycle: 'superseded',
						serializedState: session.serialize(),
						updatedAt: input.now,
						completedAt: input.now
					})
					.where(eq(rankingSession.id, input.sessionId));
				return { session, undone: false };
			}
			const latest = session.latestActiveEvidence();
			if (!latest) return { session, undone: false };
			if (latest.id !== input.expectedEvidenceId) {
				const expected = session.evidence.find((item) => item.id === input.expectedEvidenceId);
				if (expected && !expected.active) return { session, undone: false };
				throw new ConflictError('The ranking changed in another tab');
			}
			if (!session.undo()) return { session, undone: false };
			await transaction
				.update(rankingSession)
				.set({
					lifecycle: 'open',
					serializedState: session.serialize(),
					updatedAt: input.now,
					completedAt: null
				})
				.where(eq(rankingSession.id, session.id));
			await transaction
				.update(comparisonEvidence)
				.set({ active: 0 })
				.where(
					and(
						eq(comparisonEvidence.id, input.expectedEvidenceId),
						eq(comparisonEvidence.sessionId, input.sessionId)
					)
				);
			return { session, undone: true };
		});
	}

	async publishRevision(ownerId: string, revision: RankingRevision, capture: CaptureContext) {
		if (revision.rankingEngineVersion !== RANKING_ENGINE_VERSION) {
			throw new DomainValidationError('Unsupported ranking-engine version');
		}
		if (revision.provenance !== capture.provenance) {
			throw new DomainValidationError('Revision provenance must match its capture assignment');
		}
		return this.database.transaction(async (transaction) => {
			const [aggregate] = await transaction
				.select()
				.from(rankingList)
				.where(eq(rankingList.id, revision.listId));
			if (!aggregate || aggregate.ownerId !== ownerId)
				throw new NotFoundError('The ranking list was not found');
			if (aggregate.category !== revision.category) {
				throw new DomainValidationError('The revision category does not match its ranking list');
			}
			const [latest] = await transaction
				.select({ revisionNumber: rankingRevision.revisionNumber })
				.from(rankingRevision)
				.where(eq(rankingRevision.listId, revision.listId))
				.orderBy(sql`${rankingRevision.revisionNumber} desc`)
				.limit(1);
			if (revision.revision !== (latest?.revisionNumber ?? 0) + 1) {
				throw new ConflictError('Ranking revisions must be monotonically consecutive');
			}
			const memberships = await transaction
				.select({ placeId: rankingListPlace.placeId, dataClass: place.dataClass })
				.from(rankingListPlace)
				.innerJoin(place, eq(place.id, rankingListPlace.placeId))
				.where(
					and(
						eq(rankingListPlace.listId, revision.listId),
						inArray(rankingListPlace.placeId, [...revision.activePlaceIds])
					)
				);
			if (memberships.length !== revision.activePlaceIds.length) {
				throw new DomainValidationError('Every revision place must be a current visited place');
			}
			if (memberships.some((item) => !permitsDataClass(capture, item.dataClass))) {
				throw new DomainValidationError('The revision provenance cannot use a selected data class');
			}
			if (
				revision.provenance === 'synthetic' &&
				!['development', 'test'].includes(capture.environment)
			) {
				throw new DomainValidationError(
					'Synthetic revisions are forbidden in preview and production'
				);
			}

			const evidence = [
				...revision.activeEvidence,
				...revision.excludedEvidence.map((item) => item.evidence)
			];
			const uniqueEvidenceIds = [...new Set(evidence.map((item) => item.id))];
			if (uniqueEvidenceIds.length > 0) {
				const persisted = await transaction
					.select({ id: comparisonEvidence.id })
					.from(comparisonEvidence)
					.where(inArray(comparisonEvidence.id, uniqueEvidenceIds));
				if (persisted.length !== uniqueEvidenceIds.length) {
					throw new DomainValidationError(
						'Revision evidence must be persisted by a ranking session first'
					);
				}
			}

			await transaction.insert(rankingRevision).values({
				id: revision.id,
				listId: revision.listId,
				revisionNumber: revision.revision,
				category: revision.category,
				rankingEngineVersion: revision.rankingEngineVersion,
				provenance: revision.provenance,
				cohortAssignmentId: capture.cohortAssignmentId,
				publishedAt: new Date(revision.publishedAt)
			});

			const tierByPlace = new Map<string, { tierIndex: number; tierPosition: number }>();
			for (const [tierIndex, tier] of revision.orderedTiers.entries()) {
				for (const [tierPosition, placeId] of tier.placeIds.entries()) {
					tierByPlace.set(placeId, { tierIndex, tierPosition });
				}
			}
			await transaction.insert(rankingRevisionPlace).values(
				revision.activePlaceIds.map((placeId, membershipOrder) => {
					const tier = tierByPlace.get(placeId);
					if (!tier)
						throw new DomainValidationError('Every active place must occur in exactly one tier');
					return { revisionId: revision.id, placeId, membershipOrder, ...tier };
				})
			);
			if (revision.unresolvedRelations.length > 0) {
				await transaction.insert(rankingUnresolvedRelation).values(
					revision.unresolvedRelations.map((relation) => {
						const [firstPlaceId, secondPlaceId] = [
							relation.firstPlaceId,
							relation.secondPlaceId
						].sort();
						return {
							revisionId: revision.id,
							firstPlaceId,
							secondPlaceId,
							reason: relation.reason
						};
					})
				);
			}
			const evidenceRows = [
				...revision.activeEvidence.map((item) => ({
					revisionId: revision.id,
					comparisonId: item.id,
					revisionSequence: item.sequence,
					disposition: 'active' as const,
					exclusionReason: null,
					conflictingEvidenceIds: [] as string[]
				})),
				...revision.excludedEvidence.map((item) => ({
					revisionId: revision.id,
					comparisonId: item.evidence.id,
					revisionSequence: item.evidence.sequence,
					disposition: 'excluded' as const,
					exclusionReason: item.reason,
					conflictingEvidenceIds: [...item.conflictingEvidenceIds]
				}))
			];
			if (evidenceRows.length > 0)
				await transaction.insert(rankingRevisionEvidence).values(evidenceRows);

			const [published] = await transaction
				.update(rankingList)
				.set({ currentRevisionId: revision.id, updatedAt: new Date(revision.publishedAt) })
				.where(
					and(
						eq(rankingList.id, revision.listId),
						aggregate.currentRevisionId
							? eq(rankingList.currentRevisionId, aggregate.currentRevisionId)
							: isNull(rankingList.currentRevisionId)
					)
				)
				.returning({ id: rankingList.id });
			if (!published) throw new ConflictError('The current ranking revision changed concurrently');
			return revision;
		});
	}

	async loadCurrentRevision(ownerId: string, listId: string): Promise<RankingRevision | undefined> {
		const [aggregate] = await this.database
			.select()
			.from(rankingList)
			.where(and(eq(rankingList.id, listId), eq(rankingList.ownerId, ownerId)));
		if (!aggregate) throw new NotFoundError('The ranking list was not found');
		if (!aggregate.currentRevisionId) return undefined;
		const [revision] = await this.database
			.select()
			.from(rankingRevision)
			.where(eq(rankingRevision.id, aggregate.currentRevisionId));
		if (!revision) throw new ConflictError('The current revision pointer is invalid');
		if (revision.rankingEngineVersion !== RANKING_ENGINE_VERSION) {
			throw new ConflictError('The persisted ranking-engine version is unsupported');
		}
		const [places, unresolved, evidenceRows] = await Promise.all([
			this.database
				.select()
				.from(rankingRevisionPlace)
				.where(eq(rankingRevisionPlace.revisionId, revision.id))
				.orderBy(asc(rankingRevisionPlace.membershipOrder)),
			this.database
				.select()
				.from(rankingUnresolvedRelation)
				.where(eq(rankingUnresolvedRelation.revisionId, revision.id)),
			this.database
				.select({ link: rankingRevisionEvidence, comparison: comparisonEvidence })
				.from(rankingRevisionEvidence)
				.innerJoin(
					comparisonEvidence,
					eq(comparisonEvidence.id, rankingRevisionEvidence.comparisonId)
				)
				.where(eq(rankingRevisionEvidence.revisionId, revision.id))
		]);
		const tiers = new Map<number, { positions: { position: number; placeId: string }[] }>();
		for (const item of places) {
			const tier = tiers.get(item.tierIndex) ?? { positions: [] };
			tier.positions.push({ position: item.tierPosition, placeId: item.placeId });
			tiers.set(item.tierIndex, tier);
		}
		const activeEvidence = evidenceRows
			.filter((item) => item.link.disposition === 'active')
			.map((item) => persistedEvidence(item.comparison, item.link.revisionSequence))
			.sort((first, second) => first.sequence - second.sequence);
		const excludedEvidence = evidenceRows
			.filter((item) => item.link.disposition === 'excluded')
			.map((item) => ({
				evidence: persistedEvidence(item.comparison, item.link.revisionSequence),
				reason: item.link.exclusionReason!,
				conflictingEvidenceIds: item.link.conflictingEvidenceIds
			}))
			.sort((first, second) => first.evidence.sequence - second.evidence.sequence);

		return {
			id: revision.id,
			listId: revision.listId,
			category: revision.category,
			revision: revision.revisionNumber,
			activePlaceIds: places.map((item) => item.placeId),
			orderedTiers: [...tiers.entries()]
				.sort(([first], [second]) => first - second)
				.map(([, tier]) => ({
					placeIds: tier.positions
						.sort((first, second) => first.position - second.position)
						.map((item) => item.placeId)
				})),
			unresolvedRelations: unresolved.map((item) => ({
				firstPlaceId: item.firstPlaceId,
				secondPlaceId: item.secondPlaceId,
				reason: item.reason
			})),
			activeEvidence,
			excludedEvidence,
			rankingEngineVersion: RANKING_ENGINE_VERSION,
			provenance: revision.provenance,
			publishedAt: revision.publishedAt.toISOString()
		};
	}

	async deleteCategory(ownerId: string, category: RankingCategory) {
		const deleted = await this.database
			.delete(rankingList)
			.where(and(eq(rankingList.ownerId, ownerId), eq(rankingList.category, category)))
			.returning({ id: rankingList.id });
		return deleted.length > 0;
	}
}
