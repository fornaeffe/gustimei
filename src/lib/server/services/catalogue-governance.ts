import { randomUUID } from 'node:crypto';
import { and, asc, count, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import type { CatalogueOverridePatch } from '$lib/domain/catalogue/governance';
import {
	applyCatalogueOverride,
	selectOverriddenBaseValues,
	validateCatalogueOverridePatch
} from '$lib/domain/catalogue/governance';
import type { AppEnvironment } from '$lib/server/config/environment';
import type { Database } from '$lib/server/db';
import {
	catalogueArtifactInvalidation,
	catalogueBasePlace,
	catalogueCategoryMigration,
	catalogueChange,
	catalogueIssueReport,
	catalogueListPlaceSupersession,
	cataloguePlaceOverride,
	cataloguePlaceRedirect,
	cataloguePlaceTombstone,
	catalogueRankingRepair,
	catalogueRoleAssignment,
	catalogueSourceMapping,
	comparisonEvidence,
	effectivePlace,
	personalPlaceComment,
	place,
	rankingListPlace,
	rankingRevision,
	rankingRevisionPlace,
	rankingSession,
	session,
	user
} from '$lib/server/db/schema';
import {
	AuthorizationError,
	ConflictError,
	DomainValidationError,
	NotFoundError
} from '$lib/server/domain/errors';
import { projectionValues, resolvedProjectionRow } from '$lib/server/repositories/catalogue';

type CatalogueRole = 'admin' | 'catalogue_curator';
type ActorRole = 'admin' | 'catalogue_curator';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

const ISSUE_LIMIT = 5;
const ISSUE_WINDOW_MS = 60 * 60 * 1000;

export interface IssueReportInput {
	id?: string;
	placeId: string;
	type:
		| 'wrong-name'
		| 'wrong-location'
		| 'wrong-category'
		| 'duplicate'
		| 'closed-or-missing'
		| 'unsafe-content'
		| 'other';
	details?: string;
	evidenceReference?: string;
}

export interface ApplyOverrideInput {
	id?: string;
	placeId: string;
	patch: CatalogueOverridePatch;
	reasonCategory: string;
	evidenceReference: string;
	linkedReportId?: string;
	reviewAt: Date;
	expiresAt?: Date;
}

interface AuditInput {
	id?: string;
	action: typeof catalogueChange.$inferInsert.action;
	actorRole: typeof catalogueChange.$inferInsert.actorRole;
	actorUserId?: string;
	operatorReference?: string;
	targetPlaceId?: string;
	canonicalPlaceId?: string;
	before?: Record<string, unknown> | null;
	after?: Record<string, unknown> | null;
	reasonCategory: string;
	evidenceReferences?: string[];
	linkedReportId?: string;
	impact?: Record<string, number | boolean>;
	reversalOfActionId?: string;
}

function requiredText(value: string, label: string, maximum = 500) {
	const normalized = value.trim();
	if (!normalized) throw new DomainValidationError(`${label} is required`);
	if (normalized.length > maximum) {
		throw new DomainValidationError(`${label} must contain at most ${maximum} characters`);
	}
	return normalized;
}

function optionalText(value: string | undefined, label: string, maximum: number) {
	if (value === undefined) return undefined;
	const normalized = value.trim();
	if (!normalized) return undefined;
	if (normalized.length > maximum) {
		throw new DomainValidationError(`${label} must contain at most ${maximum} characters`);
	}
	return normalized;
}

export class CatalogueGovernanceService {
	constructor(
		private readonly database: Database,
		private readonly environment: AppEnvironment,
		private readonly now: () => Date = () => new Date(),
		private readonly id: () => string = randomUUID
	) {}

	async submitIssue(reporterUserId: string, input: IssueReportInput) {
		const now = this.now();
		const details = optionalText(input.details, 'Issue details', 1_000);
		const evidenceReference = optionalText(input.evidenceReference, 'Evidence reference', 500);
		return this.database.transaction(async (transaction) => {
			await transaction.execute(
				sql`select pg_advisory_xact_lock(hashtext(${`catalogue-issue:${reporterUserId}`}))`
			);
			await this.requireExistingUser(transaction, reporterUserId);
			await this.requirePlace(transaction, input.placeId);
			const [{ value }] = await transaction
				.select({ value: count() })
				.from(catalogueIssueReport)
				.where(
					and(
						eq(catalogueIssueReport.reporterUserId, reporterUserId),
						gte(catalogueIssueReport.createdAt, new Date(now.getTime() - ISSUE_WINDOW_MS))
					)
				);
			if (value >= ISSUE_LIMIT) {
				throw new ConflictError('Too many catalogue issue reports; try again later');
			}
			const [report] = await transaction
				.insert(catalogueIssueReport)
				.values({
					id: input.id ?? this.id(),
					reporterUserId,
					placeId: input.placeId,
					type: input.type,
					details,
					evidenceReference,
					createdAt: now,
					updatedAt: now
				})
				.returning();
			await this.audit(transaction, {
				action: 'issue-submitted',
				actorRole: 'user',
				actorUserId: reporterUserId,
				targetPlaceId: input.placeId,
				after: { reportId: report.id, type: report.type, status: report.status },
				reasonCategory: report.type,
				evidenceReferences: evidenceReference ? [evidenceReference] : [],
				linkedReportId: report.id
			});
			return report;
		});
	}

	async triageIssue(actorUserId: string, reportId: string) {
		const now = this.now();
		return this.database.transaction(async (transaction) => {
			const actorRole = await this.requireCurator(transaction, actorUserId);
			const [before] = await transaction
				.select()
				.from(catalogueIssueReport)
				.where(eq(catalogueIssueReport.id, reportId));
			if (!before) throw new NotFoundError('The catalogue issue report was not found');
			if (before.status !== 'submitted') {
				throw new ConflictError('Only submitted catalogue issues can be triaged');
			}
			const [report] = await transaction
				.update(catalogueIssueReport)
				.set({ status: 'triaged', assignedToUserId: actorUserId, updatedAt: now })
				.where(
					and(eq(catalogueIssueReport.id, reportId), eq(catalogueIssueReport.status, 'submitted'))
				)
				.returning();
			if (!report) throw new ConflictError('The catalogue issue was concurrently changed');
			await this.audit(transaction, {
				action: 'issue-triaged',
				actorRole,
				actorUserId,
				targetPlaceId: report.placeId,
				before: { status: before.status },
				after: { status: report.status, assignedToUserId: actorUserId },
				reasonCategory: report.type,
				linkedReportId: report.id
			});
			return report;
		});
	}

	async resolveIssue(
		actorUserId: string,
		reportId: string,
		resolution: 'resolved' | 'rejected',
		reason: string
	) {
		const now = this.now();
		const resolutionReason = requiredText(reason, 'Resolution reason', 1_000);
		return this.database.transaction(async (transaction) => {
			const actorRole = await this.requireCurator(transaction, actorUserId);
			const [before] = await transaction
				.select()
				.from(catalogueIssueReport)
				.where(eq(catalogueIssueReport.id, reportId));
			if (!before) throw new NotFoundError('The catalogue issue report was not found');
			if (before.status === 'resolved' || before.status === 'rejected') {
				throw new ConflictError('The catalogue issue is already closed');
			}
			const [report] = await transaction
				.update(catalogueIssueReport)
				.set({
					status: resolution,
					assignedToUserId: before.assignedToUserId ?? actorUserId,
					resolutionReason,
					resolvedAt: now,
					updatedAt: now
				})
				.where(
					and(
						eq(catalogueIssueReport.id, reportId),
						inArray(catalogueIssueReport.status, ['submitted', 'triaged'])
					)
				)
				.returning();
			if (!report) throw new ConflictError('The catalogue issue was concurrently changed');
			await this.audit(transaction, {
				action: resolution === 'resolved' ? 'issue-resolved' : 'issue-rejected',
				actorRole,
				actorUserId,
				targetPlaceId: report.placeId,
				before: { status: before.status },
				after: { status: report.status },
				reasonCategory: resolutionReason,
				linkedReportId: report.id
			});
			return report;
		});
	}

	async applyOverride(actorUserId: string, input: ApplyOverrideInput) {
		const now = this.now();
		const patch = validateCatalogueOverridePatch(input.patch);
		const reasonCategory = requiredText(input.reasonCategory, 'Override reason category');
		const evidenceReference = requiredText(input.evidenceReference, 'Evidence reference');
		if (input.reviewAt <= now) throw new DomainValidationError('Review date must be in the future');
		if (input.expiresAt && input.expiresAt <= now) {
			throw new DomainValidationError('Expiry date must be in the future');
		}
		return this.database.transaction(async (transaction) => {
			const actorRole = await this.requireCurator(transaction, actorUserId);
			const [base, effective, activeOverride, redirect] = await Promise.all([
				this.getBase(transaction, input.placeId),
				this.getEffective(transaction, input.placeId),
				transaction
					.select({ id: cataloguePlaceOverride.id })
					.from(cataloguePlaceOverride)
					.where(
						and(
							eq(cataloguePlaceOverride.placeId, input.placeId),
							isNull(cataloguePlaceOverride.retiredAt)
						)
					)
					.limit(1),
				transaction
					.select({ id: cataloguePlaceRedirect.id })
					.from(cataloguePlaceRedirect)
					.where(
						and(
							eq(cataloguePlaceRedirect.sourcePlaceId, input.placeId),
							isNull(cataloguePlaceRedirect.reversedAt)
						)
					)
					.limit(1)
			]);
			if (activeOverride[0]) throw new ConflictError('The place already has an active override');
			if (redirect[0]) throw new ConflictError('A redirected place cannot receive an override');
			if (input.linkedReportId) {
				const [report] = await transaction
					.select({ placeId: catalogueIssueReport.placeId })
					.from(catalogueIssueReport)
					.where(eq(catalogueIssueReport.id, input.linkedReportId));
				if (!report || report.placeId !== input.placeId) {
					throw new DomainValidationError('The linked report must belong to the same place');
				}
			}
			const baseValues = projectionValues(base);
			const resolved = applyCatalogueOverride(baseValues, patch);
			const [override] = await transaction
				.insert(cataloguePlaceOverride)
				.values({
					id: input.id ?? this.id(),
					placeId: input.placeId,
					patch,
					baseValues: selectOverriddenBaseValues(baseValues, patch),
					reasonCategory,
					evidenceReference,
					actorUserId,
					linkedReportId: input.linkedReportId,
					reviewStatus: 'approved',
					reviewAt: input.reviewAt,
					expiresAt: input.expiresAt,
					createdAt: now
				})
				.returning();
			await transaction
				.update(effectivePlace)
				.set(resolvedProjectionRow(base, resolved, effective.category))
				.where(eq(effectivePlace.placeId, input.placeId));
			const action =
				patch.visibility?.status === 'quarantined'
					? 'place-quarantined'
					: patch.visibility?.status === 'active'
						? 'place-unquarantined'
						: 'override-applied';
			const audit = await this.audit(transaction, {
				action,
				actorRole,
				actorUserId,
				targetPlaceId: input.placeId,
				before: publicProjection(effective),
				after: publicValues(resolved, effective.category),
				reasonCategory,
				evidenceReferences: [evidenceReference],
				linkedReportId: input.linkedReportId
			});
			await this.invalidate(transaction, effective.category, audit.id, reasonCategory, now);
			return override;
		});
	}

	async retireOverride(actorUserId: string, overrideId: string, reason: string) {
		const now = this.now();
		const retirementReason = requiredText(reason, 'Retirement reason');
		return this.database.transaction(async (transaction) => {
			const actorRole = await this.requireCurator(transaction, actorUserId);
			const [override] = await transaction
				.select()
				.from(cataloguePlaceOverride)
				.where(
					and(eq(cataloguePlaceOverride.id, overrideId), isNull(cataloguePlaceOverride.retiredAt))
				);
			if (!override) throw new NotFoundError('The active catalogue override was not found');
			const [base, effective, redirect, migration] = await Promise.all([
				this.getBase(transaction, override.placeId),
				this.getEffective(transaction, override.placeId),
				transaction
					.select()
					.from(cataloguePlaceRedirect)
					.where(
						and(
							eq(cataloguePlaceRedirect.sourcePlaceId, override.placeId),
							isNull(cataloguePlaceRedirect.reversedAt)
						)
					)
					.limit(1),
				transaction
					.select()
					.from(catalogueCategoryMigration)
					.where(
						and(
							eq(catalogueCategoryMigration.placeId, override.placeId),
							isNull(catalogueCategoryMigration.reversedAt)
						)
					)
					.limit(1)
			]);
			const resolved = projectionValues(base);
			if (redirect[0]) {
				resolved.visibility = {
					status: 'hidden',
					reason: `merged-into:${redirect[0].canonicalPlaceId}`
				};
			}
			await transaction
				.update(cataloguePlaceOverride)
				.set({
					reviewStatus: 'retired',
					retiredAt: now,
					retiredByUserId: actorUserId,
					retirementReason
				})
				.where(
					and(eq(cataloguePlaceOverride.id, overrideId), isNull(cataloguePlaceOverride.retiredAt))
				);
			await transaction
				.update(effectivePlace)
				.set(resolvedProjectionRow(base, resolved, migration[0]?.toCategory ?? base.category))
				.where(eq(effectivePlace.placeId, override.placeId));
			const audit = await this.audit(transaction, {
				action: 'override-retired',
				actorRole,
				actorUserId,
				targetPlaceId: override.placeId,
				before: publicProjection(effective),
				after: publicValues(resolved, migration[0]?.toCategory ?? base.category),
				reasonCategory: retirementReason,
				evidenceReferences: [override.evidenceReference],
				linkedReportId: override.linkedReportId ?? undefined
			});
			await this.invalidate(transaction, effective.category, audit.id, retirementReason, now);
			return { ...override, retiredAt: now };
		});
	}

	async mergePlaces(
		actorUserId: string,
		input: {
			sourcePlaceId: string;
			canonicalPlaceId: string;
			reasonCategory: string;
			evidenceReference: string;
			linkedReportId?: string;
		}
	) {
		const now = this.now();
		const reasonCategory = requiredText(input.reasonCategory, 'Merge reason category');
		const evidenceReference = requiredText(input.evidenceReference, 'Evidence reference');
		if (input.sourcePlaceId === input.canonicalPlaceId) {
			throw new DomainValidationError('A place cannot redirect to itself');
		}
		return this.database.transaction(async (transaction) => {
			await transaction.execute(
				sql`select pg_advisory_xact_lock(hashtext(${`catalogue-merge:${[input.sourcePlaceId, input.canonicalPlaceId].sort().join(':')}`}))`
			);
			await this.requireRole(transaction, actorUserId, 'admin');
			const [source, canonical] = await Promise.all([
				this.getEffective(transaction, input.sourcePlaceId),
				this.getEffective(transaction, input.canonicalPlaceId)
			]);
			if (source.category !== canonical.category) {
				throw new DomainValidationError('Merged places must have the same effective category');
			}
			const sourceRecord = await this.requirePlace(transaction, input.sourcePlaceId);
			const canonicalRecord = await this.requirePlace(transaction, input.canonicalPlaceId);
			if (sourceRecord.dataClass !== canonicalRecord.dataClass) {
				throw new DomainValidationError('Real and synthetic places cannot be merged');
			}
			await this.assertRedirectDoesNotCycle(
				transaction,
				input.sourcePlaceId,
				input.canonicalPlaceId
			);
			const actionId = this.id();
			const redirectId = this.id();
			await transaction.insert(cataloguePlaceRedirect).values({
				id: redirectId,
				sourcePlaceId: input.sourcePlaceId,
				canonicalPlaceId: input.canonicalPlaceId,
				actionId,
				createdAt: now
			});
			const memberships = await transaction
				.select()
				.from(rankingListPlace)
				.where(eq(rankingListPlace.placeId, input.sourcePlaceId));
			let createdCanonicalMemberships = 0;
			for (const membership of memberships) {
				const inserted = await transaction
					.insert(rankingListPlace)
					.values({
						listId: membership.listId,
						ownerId: membership.ownerId,
						placeId: input.canonicalPlaceId,
						addedAt: membership.addedAt
					})
					.onConflictDoNothing()
					.returning({ addedAt: rankingListPlace.addedAt });
				if (inserted[0]) createdCanonicalMemberships += 1;
				await transaction.insert(catalogueListPlaceSupersession).values({
					id: this.id(),
					listId: membership.listId,
					sourcePlaceId: input.sourcePlaceId,
					canonicalPlaceId: input.canonicalPlaceId,
					redirectId,
					canonicalMembershipCreated: inserted[0]?.addedAt,
					createdAt: now
				});
				await transaction.insert(catalogueRankingRepair).values({
					id: this.id(),
					listId: membership.listId,
					sourcePlaceId: input.sourcePlaceId,
					canonicalPlaceId: input.canonicalPlaceId,
					reason: 'duplicate-merge',
					actionId,
					createdAt: now
				});
			}
			await transaction
				.update(effectivePlace)
				.set({
					status: 'hidden',
					quarantineReason: `merged-into:${input.canonicalPlaceId}`,
					updatedAt: now
				})
				.where(eq(effectivePlace.placeId, input.sourcePlaceId));
			await this.invalidate(transaction, source.category, actionId, 'duplicate-merge', now);
			const audit = await this.audit(transaction, {
				id: actionId,
				action: 'merge-applied',
				actorRole: 'admin',
				actorUserId,
				targetPlaceId: input.sourcePlaceId,
				canonicalPlaceId: input.canonicalPlaceId,
				before: { sourceStatus: source.status },
				after: { sourceStatus: 'hidden', redirectId },
				reasonCategory,
				evidenceReferences: [evidenceReference],
				linkedReportId: input.linkedReportId,
				impact: {
					affectedLists: memberships.length,
					createdCanonicalMemberships,
					rankingRepairRequested: memberships.length > 0,
					artifactInvalidationRequested: true
				}
			});
			return { redirectId, actionId: audit.id, affectedLists: memberships.length };
		});
	}

	async reverseMerge(actorUserId: string, redirectId: string, reason: string) {
		const now = this.now();
		const reasonCategory = requiredText(reason, 'Merge reversal reason');
		return this.database.transaction(async (transaction) => {
			await this.requireRole(transaction, actorUserId, 'admin');
			const [redirect] = await transaction
				.select()
				.from(cataloguePlaceRedirect)
				.where(
					and(eq(cataloguePlaceRedirect.id, redirectId), isNull(cataloguePlaceRedirect.reversedAt))
				);
			if (!redirect) throw new NotFoundError('The active catalogue redirect was not found');
			const actionId = this.id();
			const supersessions = await transaction
				.update(catalogueListPlaceSupersession)
				.set({ reversedAt: now })
				.where(
					and(
						eq(catalogueListPlaceSupersession.redirectId, redirect.id),
						isNull(catalogueListPlaceSupersession.reversedAt)
					)
				)
				.returning();
			await transaction
				.update(cataloguePlaceRedirect)
				.set({ reversedAt: now, reversalActionId: actionId })
				.where(eq(cataloguePlaceRedirect.id, redirect.id));
			await transaction
				.update(catalogueRankingRepair)
				.set({ status: 'cancelled', completedAt: now })
				.where(
					and(
						eq(catalogueRankingRepair.actionId, redirect.actionId),
						eq(catalogueRankingRepair.status, 'pending')
					)
				);
			const [base, effective, override, migration] = await Promise.all([
				this.getBase(transaction, redirect.sourcePlaceId),
				this.getEffective(transaction, redirect.sourcePlaceId),
				transaction
					.select()
					.from(cataloguePlaceOverride)
					.where(
						and(
							eq(cataloguePlaceOverride.placeId, redirect.sourcePlaceId),
							isNull(cataloguePlaceOverride.retiredAt)
						)
					)
					.limit(1),
				transaction
					.select()
					.from(catalogueCategoryMigration)
					.where(
						and(
							eq(catalogueCategoryMigration.placeId, redirect.sourcePlaceId),
							isNull(catalogueCategoryMigration.reversedAt)
						)
					)
					.limit(1)
			]);
			const values = override[0]
				? applyCatalogueOverride(projectionValues(base), override[0].patch)
				: projectionValues(base);
			const category = migration[0]?.toCategory ?? base.category;
			await transaction
				.update(effectivePlace)
				.set(resolvedProjectionRow(base, values, category))
				.where(eq(effectivePlace.placeId, redirect.sourcePlaceId));
			let deletedCanonicalMemberships = 0;
			let requestedRepairs = 0;
			for (const supersession of supersessions) {
				const [comments, revisions, comparisons] = await Promise.all([
					transaction
						.select({ value: count() })
						.from(personalPlaceComment)
						.where(
							and(
								eq(personalPlaceComment.listId, supersession.listId),
								eq(personalPlaceComment.placeId, redirect.canonicalPlaceId)
							)
						),
					transaction
						.select({ value: count() })
						.from(rankingRevisionPlace)
						.innerJoin(rankingRevision, eq(rankingRevision.id, rankingRevisionPlace.revisionId))
						.where(
							and(
								eq(rankingRevision.listId, supersession.listId),
								eq(rankingRevisionPlace.placeId, redirect.canonicalPlaceId),
								gte(rankingRevision.publishedAt, supersession.createdAt)
							)
						),
					transaction
						.select({ value: count() })
						.from(comparisonEvidence)
						.innerJoin(rankingSession, eq(rankingSession.id, comparisonEvidence.sessionId))
						.where(
							and(
								eq(rankingSession.listId, supersession.listId),
								or(
									eq(comparisonEvidence.logicalFirstPlaceId, redirect.canonicalPlaceId),
									eq(comparisonEvidence.logicalSecondPlaceId, redirect.canonicalPlaceId)
								),
								gte(comparisonEvidence.capturedAt, supersession.createdAt)
							)
						)
				]);
				const canonicalMembershipCanBeRemoved =
					supersession.canonicalMembershipCreated !== null &&
					comments[0].value === 0 &&
					revisions[0].value === 0 &&
					comparisons[0].value === 0;
				if (canonicalMembershipCanBeRemoved) {
					const deleted = await transaction
						.delete(rankingListPlace)
						.where(
							and(
								eq(rankingListPlace.listId, supersession.listId),
								eq(rankingListPlace.placeId, redirect.canonicalPlaceId)
							)
						)
						.returning({ placeId: rankingListPlace.placeId });
					deletedCanonicalMemberships += deleted.length;
					continue;
				}
				await transaction.insert(catalogueRankingRepair).values({
					id: this.id(),
					listId: supersession.listId,
					sourcePlaceId: redirect.sourcePlaceId,
					canonicalPlaceId: redirect.canonicalPlaceId,
					reason: 'duplicate-merge-reversed',
					actionId,
					createdAt: now
				});
				requestedRepairs += 1;
			}
			await this.invalidate(transaction, category, actionId, reasonCategory, now);
			await this.audit(transaction, {
				id: actionId,
				action: 'merge-reversed',
				actorRole: 'admin',
				actorUserId,
				targetPlaceId: redirect.sourcePlaceId,
				canonicalPlaceId: redirect.canonicalPlaceId,
				before: publicProjection(effective),
				after: publicValues(values, category),
				reasonCategory,
				reversalOfActionId: redirect.actionId,
				impact: {
					affectedLists: supersessions.length,
					deletedCanonicalMemberships,
					rankingRepairRequested: requestedRepairs > 0,
					artifactInvalidationRequested: true
				}
			});
			return { actionId, affectedLists: supersessions.length };
		});
	}

	async exceptionalRemove(
		actorUserId: string,
		placeId: string,
		reason: string,
		evidenceReference: string
	) {
		const now = this.now();
		const reasonCategory = requiredText(reason, 'Exceptional removal reason');
		const evidence = requiredText(evidenceReference, 'Evidence reference');
		return this.database.transaction(async (transaction) => {
			await this.requireRole(transaction, actorUserId, 'admin');
			const effective = await this.getEffective(transaction, placeId);
			const [activeTombstone] = await transaction
				.select({ id: cataloguePlaceTombstone.id })
				.from(cataloguePlaceTombstone)
				.where(
					and(
						eq(cataloguePlaceTombstone.placeId, placeId),
						isNull(cataloguePlaceTombstone.reversedAt)
					)
				);
			if (activeTombstone) throw new ConflictError('The place is already exceptionally removed');
			const memberships = await transaction
				.select({ listId: rankingListPlace.listId })
				.from(rankingListPlace)
				.where(eq(rankingListPlace.placeId, placeId));
			const actionId = this.id();
			await transaction.insert(cataloguePlaceTombstone).values({
				id: this.id(),
				placeId,
				actionId,
				reason: reasonCategory,
				evidenceReference: evidence,
				createdAt: now
			});
			await transaction
				.update(effectivePlace)
				.set({
					status: 'hidden',
					quarantineReason: `exceptional-removal:${reasonCategory}`,
					updatedAt: now
				})
				.where(eq(effectivePlace.placeId, placeId));
			for (const membership of memberships) {
				await transaction.insert(catalogueRankingRepair).values({
					id: this.id(),
					listId: membership.listId,
					sourcePlaceId: placeId,
					reason: 'exceptional-removal',
					actionId,
					createdAt: now
				});
			}
			await this.invalidate(transaction, effective.category, actionId, reasonCategory, now);
			await this.audit(transaction, {
				id: actionId,
				action: 'exceptional-removal',
				actorRole: 'admin',
				actorUserId,
				targetPlaceId: placeId,
				before: { status: effective.status },
				after: { status: 'hidden', tombstoned: true },
				reasonCategory,
				evidenceReferences: [evidence],
				impact: {
					affectedLists: memberships.length,
					rankingRepairRequested: memberships.length > 0,
					artifactInvalidationRequested: true
				}
			});
			return { actionId, tombstoned: true, affectedLists: memberships.length };
		});
	}

	async reverseExceptionalRemoval(actorUserId: string, placeId: string, reason: string) {
		const now = this.now();
		const reasonCategory = requiredText(reason, 'Exceptional removal reversal reason');
		return this.database.transaction(async (transaction) => {
			await this.requireRole(transaction, actorUserId, 'admin');
			const [tombstone] = await transaction
				.select()
				.from(cataloguePlaceTombstone)
				.where(
					and(
						eq(cataloguePlaceTombstone.placeId, placeId),
						isNull(cataloguePlaceTombstone.reversedAt)
					)
				);
			if (!tombstone) throw new NotFoundError('The active exceptional removal was not found');
			const actionId = this.id();
			const [base, effective, override, redirect, migration] = await Promise.all([
				this.getBase(transaction, placeId),
				this.getEffective(transaction, placeId),
				transaction
					.select()
					.from(cataloguePlaceOverride)
					.where(
						and(
							eq(cataloguePlaceOverride.placeId, placeId),
							isNull(cataloguePlaceOverride.retiredAt)
						)
					)
					.limit(1),
				transaction
					.select()
					.from(cataloguePlaceRedirect)
					.where(
						and(
							eq(cataloguePlaceRedirect.sourcePlaceId, placeId),
							isNull(cataloguePlaceRedirect.reversedAt)
						)
					)
					.limit(1),
				transaction
					.select()
					.from(catalogueCategoryMigration)
					.where(
						and(
							eq(catalogueCategoryMigration.placeId, placeId),
							isNull(catalogueCategoryMigration.reversedAt)
						)
					)
					.limit(1)
			]);
			const values = override[0]
				? applyCatalogueOverride(projectionValues(base), override[0].patch)
				: projectionValues(base);
			if (redirect[0]) {
				values.visibility = {
					status: 'hidden',
					reason: `merged-into:${redirect[0].canonicalPlaceId}`
				};
			}
			const category = migration[0]?.toCategory ?? base.category;
			await transaction
				.update(cataloguePlaceTombstone)
				.set({ reversedAt: now, reversalActionId: actionId })
				.where(eq(cataloguePlaceTombstone.id, tombstone.id));
			await transaction
				.update(effectivePlace)
				.set(resolvedProjectionRow(base, values, category))
				.where(eq(effectivePlace.placeId, placeId));
			await this.invalidate(transaction, category, actionId, reasonCategory, now);
			await this.audit(transaction, {
				id: actionId,
				action: 'exceptional-removal-reversed',
				actorRole: 'admin',
				actorUserId,
				targetPlaceId: placeId,
				before: publicProjection(effective),
				after: publicValues(values, category),
				reasonCategory,
				evidenceReferences: [tombstone.evidenceReference],
				reversalOfActionId: tombstone.actionId,
				impact: { artifactInvalidationRequested: true }
			});
			return { actionId };
		});
	}

	async migrateCategory(
		actorUserId: string,
		input: {
			placeId: string;
			toCategory: 'restaurant' | 'hotel';
			impactPolicy: 'quarantine-and-repair';
			reasonCategory: string;
			evidenceReference: string;
		}
	) {
		const now = this.now();
		const reasonCategory = requiredText(input.reasonCategory, 'Category migration reason');
		const evidence = requiredText(input.evidenceReference, 'Evidence reference');
		if (input.impactPolicy !== 'quarantine-and-repair') {
			throw new DomainValidationError(
				'Category migration requires the quarantine-and-repair policy'
			);
		}
		return this.database.transaction(async (transaction) => {
			await this.requireRole(transaction, actorUserId, 'admin');
			const effective = await this.getEffective(transaction, input.placeId);
			if (effective.category === input.toCategory) {
				throw new ConflictError('The place is already in the requested category');
			}
			if (effective.status !== 'quarantined') {
				throw new ConflictError('A place must be quarantined before category migration');
			}
			const actionId = this.id();
			const memberships = await transaction
				.select({ listId: rankingListPlace.listId })
				.from(rankingListPlace)
				.where(eq(rankingListPlace.placeId, input.placeId));
			await transaction.insert(catalogueCategoryMigration).values({
				id: this.id(),
				placeId: input.placeId,
				fromCategory: effective.category,
				toCategory: input.toCategory,
				actionId,
				createdAt: now
			});
			await transaction
				.update(place)
				.set({ category: input.toCategory })
				.where(eq(place.id, input.placeId));
			await transaction
				.update(effectivePlace)
				.set({ category: input.toCategory, updatedAt: now })
				.where(eq(effectivePlace.placeId, input.placeId));
			for (const membership of memberships) {
				await transaction.insert(catalogueRankingRepair).values({
					id: this.id(),
					listId: membership.listId,
					sourcePlaceId: input.placeId,
					reason: 'category-migration',
					actionId,
					createdAt: now
				});
			}
			await Promise.all([
				this.invalidate(transaction, effective.category, actionId, reasonCategory, now),
				this.invalidate(transaction, input.toCategory, actionId, reasonCategory, now)
			]);
			await this.audit(transaction, {
				id: actionId,
				action: 'category-migrated',
				actorRole: 'admin',
				actorUserId,
				targetPlaceId: input.placeId,
				before: { category: effective.category, status: effective.status },
				after: { category: input.toCategory, status: effective.status },
				reasonCategory,
				evidenceReferences: [evidence],
				impact: {
					affectedLists: memberships.length,
					rankingRepairRequested: memberships.length > 0,
					artifactInvalidationRequested: true
				}
			});
			return { actionId, affectedLists: memberships.length };
		});
	}

	async bootstrapRole(input: {
		targetUserId: string;
		role: CatalogueRole;
		environment: AppEnvironment;
		operatorReference: string;
		reason: string;
	}) {
		this.requireLocalOperatorEnvironment(input.environment);
		const operatorReference = requiredText(input.operatorReference, 'Operator reference');
		const reason = requiredText(input.reason, 'Grant reason');
		return this.database.transaction(async (transaction) => {
			await this.lockRoleAssignments(transaction);
			await this.requireVerifiedUser(transaction, input.targetUserId);
			return this.insertRole(transaction, {
				targetUserId: input.targetUserId,
				role: input.role,
				grantSource: 'bootstrap',
				operatorReference,
				reason,
				action: 'role-granted'
			});
		});
	}

	async breakGlassAdmin(input: {
		targetUserId: string;
		environment: AppEnvironment;
		operatorReference: string;
		reason: string;
	}) {
		this.requireLocalOperatorEnvironment(input.environment);
		const operatorReference = requiredText(input.operatorReference, 'Operator reference');
		const reason = requiredText(input.reason, 'Break-glass reason');
		return this.database.transaction(async (transaction) => {
			await this.lockRoleAssignments(transaction);
			await this.requireVerifiedUser(transaction, input.targetUserId);
			return this.insertRole(transaction, {
				targetUserId: input.targetUserId,
				role: 'admin',
				grantSource: 'break-glass',
				operatorReference,
				reason,
				action: 'role-break-glass'
			});
		});
	}

	async grantRole(actorUserId: string, targetUserId: string, role: CatalogueRole, reason: string) {
		const grantReason = requiredText(reason, 'Grant reason');
		return this.database.transaction(async (transaction) => {
			await this.lockRoleAssignments(transaction);
			await this.requireRole(transaction, actorUserId, 'admin');
			await this.requireVerifiedUser(transaction, targetUserId);
			return this.insertRole(transaction, {
				targetUserId,
				role,
				grantSource: 'admin-grant',
				grantedByUserId: actorUserId,
				reason: grantReason,
				action: 'role-granted'
			});
		});
	}

	async revokeRole(actorUserId: string, targetUserId: string, role: CatalogueRole, reason: string) {
		const revocationReason = requiredText(reason, 'Revocation reason');
		const now = this.now();
		return this.database.transaction(async (transaction) => {
			await this.lockRoleAssignments(transaction);
			await this.requireRole(transaction, actorUserId, 'admin');
			const assignment = await this.activeRole(transaction, targetUserId, role);
			if (!assignment) throw new NotFoundError('The active catalogue role was not found');
			if (role === 'admin' && (await this.activeAdminCount(transaction)) <= 1) {
				throw new ConflictError('The last active administrator cannot be revoked');
			}
			await transaction
				.update(catalogueRoleAssignment)
				.set({
					revokedAt: now,
					revokedByUserId: actorUserId,
					revocationReason
				})
				.where(
					and(
						eq(catalogueRoleAssignment.id, assignment.id),
						isNull(catalogueRoleAssignment.revokedAt)
					)
				);
			const revokedSessions = await transaction
				.delete(session)
				.where(eq(session.userId, targetUserId))
				.returning({ id: session.id });
			await this.audit(transaction, {
				action: 'role-revoked',
				actorRole: 'admin',
				actorUserId,
				before: { targetUserId, role, active: true },
				after: { targetUserId, role, active: false },
				reasonCategory: revocationReason,
				impact: { revokedSessions: revokedSessions.length }
			});
			return { assignmentId: assignment.id, revokedSessions: revokedSessions.length };
		});
	}

	async rotateRole(input: {
		actorUserId: string;
		predecessorUserId: string;
		successorUserId: string;
		role: CatalogueRole;
		reason: string;
	}) {
		if (input.predecessorUserId === input.successorUserId) {
			throw new DomainValidationError('Role rotation requires a different successor');
		}
		const reason = requiredText(input.reason, 'Rotation reason');
		const now = this.now();
		return this.database.transaction(async (transaction) => {
			await this.lockRoleAssignments(transaction);
			await this.requireRole(transaction, input.actorUserId, 'admin');
			await this.requireVerifiedUser(transaction, input.successorUserId);
			const predecessor = await this.activeRole(transaction, input.predecessorUserId, input.role);
			if (!predecessor) throw new NotFoundError('The predecessor does not hold the active role');
			let successor = await this.activeRole(transaction, input.successorUserId, input.role);
			if (!successor) {
				successor = await this.insertRole(transaction, {
					targetUserId: input.successorUserId,
					role: input.role,
					grantSource: 'rotation',
					grantedByUserId: input.actorUserId,
					reason,
					action: 'role-granted'
				});
			}
			if (!(await this.activeRole(transaction, input.successorUserId, input.role))) {
				throw new ConflictError('The successor role could not be verified');
			}
			await transaction
				.update(catalogueRoleAssignment)
				.set({
					revokedAt: now,
					revokedByUserId: input.actorUserId,
					revocationReason: reason
				})
				.where(eq(catalogueRoleAssignment.id, predecessor.id));
			const revokedSessions = await transaction
				.delete(session)
				.where(eq(session.userId, input.predecessorUserId))
				.returning({ id: session.id });
			await this.audit(transaction, {
				action: 'role-rotated',
				actorRole: 'admin',
				actorUserId: input.actorUserId,
				before: { userId: input.predecessorUserId, role: input.role },
				after: { userId: input.successorUserId, role: input.role },
				reasonCategory: reason,
				impact: { revokedSessions: revokedSessions.length }
			});
			return {
				predecessorAssignmentId: predecessor.id,
				successorAssignmentId: successor.id,
				revokedSessions: revokedSessions.length
			};
		});
	}

	async listIssues(actorUserId: string) {
		await this.requireCurator(this.database, actorUserId);
		return this.database
			.select()
			.from(catalogueIssueReport)
			.orderBy(asc(catalogueIssueReport.createdAt));
	}

	async listAudit(actorUserId: string, placeId?: string) {
		await this.requireCurator(this.database, actorUserId);
		return this.database
			.select()
			.from(catalogueChange)
			.where(placeId ? eq(catalogueChange.targetPlaceId, placeId) : undefined)
			.orderBy(asc(catalogueChange.createdAt), asc(catalogueChange.id));
	}

	private async insertRole(
		transaction: Transaction,
		input: {
			targetUserId: string;
			role: CatalogueRole;
			grantSource: 'bootstrap' | 'admin-grant' | 'rotation' | 'break-glass';
			grantedByUserId?: string;
			operatorReference?: string;
			reason: string;
			action: 'role-granted' | 'role-break-glass';
		}
	) {
		if (await this.activeRole(transaction, input.targetUserId, input.role)) {
			throw new ConflictError('The user already holds the active role');
		}
		const now = this.now();
		const [assignment] = await transaction
			.insert(catalogueRoleAssignment)
			.values({
				id: this.id(),
				userId: input.targetUserId,
				role: input.role,
				environment: this.environment,
				grantSource: input.grantSource,
				grantedByUserId: input.grantedByUserId,
				operatorReference: input.operatorReference,
				grantReason: input.reason,
				grantedAt: now
			})
			.returning();
		await this.audit(transaction, {
			action: input.action,
			actorRole: input.operatorReference ? 'operator' : 'admin',
			actorUserId: input.grantedByUserId,
			operatorReference: input.operatorReference,
			after: { targetUserId: input.targetUserId, role: input.role, active: true },
			reasonCategory: input.reason
		});
		return assignment;
	}

	private async requireCurator(
		database: Database | Transaction,
		userId: string
	): Promise<ActorRole> {
		if (await this.activeRole(database, userId, 'admin')) return 'admin';
		if (await this.activeRole(database, userId, 'catalogue_curator')) return 'catalogue_curator';
		throw new AuthorizationError('A catalogue curator or administrator role is required');
	}

	private async requireRole(database: Database | Transaction, userId: string, role: CatalogueRole) {
		if (!(await this.activeRole(database, userId, role))) {
			throw new AuthorizationError(`The ${role} role is required`);
		}
	}

	private async activeRole(database: Database | Transaction, userId: string, role: CatalogueRole) {
		const [assignment] = await database
			.select()
			.from(catalogueRoleAssignment)
			.where(
				and(
					eq(catalogueRoleAssignment.userId, userId),
					eq(catalogueRoleAssignment.role, role),
					eq(catalogueRoleAssignment.environment, this.environment),
					isNull(catalogueRoleAssignment.revokedAt)
				)
			)
			.limit(1);
		return assignment;
	}

	private async activeAdminCount(transaction: Transaction) {
		const [{ value }] = await transaction
			.select({ value: count() })
			.from(catalogueRoleAssignment)
			.where(
				and(
					eq(catalogueRoleAssignment.role, 'admin'),
					eq(catalogueRoleAssignment.environment, this.environment),
					isNull(catalogueRoleAssignment.revokedAt)
				)
			);
		return value;
	}

	private async lockRoleAssignments(transaction: Transaction) {
		await transaction.execute(
			sql`select pg_advisory_xact_lock(hashtext(${`catalogue-roles:${this.environment}`}))`
		);
	}

	private requireLocalOperatorEnvironment(environment: AppEnvironment) {
		if (environment !== this.environment) {
			throw new AuthorizationError('The requested environment does not match APP_ENV');
		}
		if (environment === 'preview' || environment === 'production') {
			throw new AuthorizationError(
				'Local operator role commands are disabled in preview and production'
			);
		}
	}

	private async requireExistingUser(database: Database | Transaction, userId: string) {
		const [record] = await database.select().from(user).where(eq(user.id, userId)).limit(1);
		if (!record) throw new NotFoundError('The user was not found');
		return record;
	}

	private async requireVerifiedUser(database: Database | Transaction, userId: string) {
		const record = await this.requireExistingUser(database, userId);
		if (!record.emailVerified)
			throw new ConflictError('The target user must have a verified email');
		return record;
	}

	private async requirePlace(database: Database | Transaction, placeId: string) {
		const [record] = await database.select().from(place).where(eq(place.id, placeId)).limit(1);
		if (!record) throw new NotFoundError('The catalogue place was not found');
		return record;
	}

	private async getBase(database: Database | Transaction, placeId: string) {
		const [record] = await database
			.select()
			.from(catalogueBasePlace)
			.where(eq(catalogueBasePlace.placeId, placeId));
		if (!record) throw new NotFoundError('The catalogue base projection was not found');
		return record;
	}

	private async getEffective(database: Database | Transaction, placeId: string) {
		const [record] = await database
			.select()
			.from(effectivePlace)
			.where(eq(effectivePlace.placeId, placeId));
		if (!record) throw new NotFoundError('The effective catalogue place was not found');
		return record;
	}

	private async assertRedirectDoesNotCycle(
		transaction: Transaction,
		sourcePlaceId: string,
		canonicalPlaceId: string
	) {
		const [existingSource] = await transaction
			.select()
			.from(cataloguePlaceRedirect)
			.where(
				and(
					eq(cataloguePlaceRedirect.sourcePlaceId, sourcePlaceId),
					isNull(cataloguePlaceRedirect.reversedAt)
				)
			);
		if (existingSource) throw new ConflictError('The source place already has an active redirect');
		let current = canonicalPlaceId;
		const visited = new Set<string>();
		while (!visited.has(current)) {
			if (current === sourcePlaceId)
				throw new ConflictError('The catalogue redirect would create a cycle');
			visited.add(current);
			const [next] = await transaction
				.select({ canonicalPlaceId: cataloguePlaceRedirect.canonicalPlaceId })
				.from(cataloguePlaceRedirect)
				.where(
					and(
						eq(cataloguePlaceRedirect.sourcePlaceId, current),
						isNull(cataloguePlaceRedirect.reversedAt)
					)
				);
			if (!next) return;
			current = next.canonicalPlaceId;
		}
		throw new ConflictError('The catalogue redirect chain already contains a cycle');
	}

	private async invalidate(
		transaction: Transaction,
		category: 'restaurant' | 'hotel',
		actionId: string,
		reason: string,
		now: Date
	) {
		await transaction
			.insert(catalogueArtifactInvalidation)
			.values({ id: this.id(), category, actionId, reason, requestedAt: now })
			.onConflictDoNothing();
	}

	private async audit(transaction: Transaction, input: AuditInput) {
		const placeIds = [input.targetPlaceId, input.canonicalPlaceId].filter(
			(value): value is string => Boolean(value)
		);
		const mappings =
			placeIds.length > 0
				? await transaction
						.select({
							placeId: catalogueSourceMapping.placeId,
							provider: catalogueSourceMapping.provider,
							elementType: catalogueSourceMapping.elementType,
							elementId: catalogueSourceMapping.elementId
						})
						.from(catalogueSourceMapping)
						.where(inArray(catalogueSourceMapping.placeId, placeIds))
				: [];
		const [record] = await transaction
			.insert(catalogueChange)
			.values({
				id: input.id ?? this.id(),
				action: input.action,
				actorRole: input.actorRole,
				actorUserId: input.actorUserId,
				operatorReference: input.operatorReference,
				environment: this.environment,
				targetPlaceId: input.targetPlaceId,
				canonicalPlaceId: input.canonicalPlaceId,
				sourceIdentities: mappings,
				before: input.before,
				after: input.after,
				reasonCategory: input.reasonCategory,
				evidenceReferences: input.evidenceReferences ?? [],
				linkedReportId: input.linkedReportId,
				impact: input.impact ?? {},
				reversalOfActionId: input.reversalOfActionId,
				createdAt: this.now()
			})
			.returning();
		return record;
	}
}

function publicProjection(record: typeof effectivePlace.$inferSelect) {
	return {
		name: record.name,
		category: record.category,
		status: record.status,
		addressLabel: record.addressLabel,
		latitude: record.latitude,
		longitude: record.longitude,
		displayLocality: record.displayLocality
	};
}

function publicValues(
	values: ReturnType<typeof projectionValues>,
	category: 'restaurant' | 'hotel'
) {
	return {
		name: values.name,
		category,
		status: values.visibility.status,
		addressLabel: values.addressLabel,
		latitude: values.latitude,
		longitude: values.longitude,
		displayLocality: values.locality.displayLocality
	};
}
