import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import {
	addDays,
	approvedReviewClockPolicy,
	evidenceDeletionDeadline,
	normalizeCaseText,
	normalizeNoticeExplanation
} from '$lib/domain/reviews/policy';
import {
	EVIDENCE_MAX_FILES_PER_CASE,
	validateEvidenceMetadata
} from '$lib/domain/reviews/evidence';
import type { AppEnvironment } from '$lib/server/config/environment';
import type { Database } from '$lib/server/db';
import {
	catalogueRoleAssignment,
	placeReview,
	reviewCaseAccessToken,
	reviewCasePartySubmission,
	reviewEvidenceAccess,
	reviewEvidenceObject,
	reviewModerationDecision,
	reviewModerationEvent,
	reviewModeratorAssignment,
	reviewNotice,
	reviewNotification,
	reviewPolicyVersion,
	reviewPublication,
	reviewRedressRequest,
	reviewRoleEvent,
	reviewVersion,
	session,
	transactionalOutbox,
	user
} from '$lib/server/db/schema';
import {
	AuthorizationError,
	ConflictError,
	DomainValidationError,
	NotFoundError
} from '$lib/server/domain/errors';
import type { RestrictedEvidenceStore } from '$lib/server/providers/evidence';
import type { ReviewOutboxPurpose } from '$lib/server/providers/contracts';
import {
	MemoryFixedWindowRateLimiter,
	reviewRateLimitPolicies,
	type RateLimiter
} from '$lib/server/security/rate-limit';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type ReviewDatabase = Database | Transaction;
type PartyRole = 'author' | 'notifier';
type ModeratorRole = 'review_moderator' | 'admin';

function sha256(value: string | Uint8Array): string {
	return createHash('sha256').update(value).digest('hex');
}

function required(value: string, label: string, minimum = 1, maximum = 500): string {
	const normalized = value.normalize('NFC').trim();
	if (normalized.length < minimum || normalized.length > maximum) {
		throw new DomainValidationError(`${label} must contain ${minimum} to ${maximum} characters`);
	}
	return normalized;
}

export interface NoticeInput {
	publicationId: string;
	versionId: string;
	exactPublicUrl: string;
	kind: 'alleged-illegality' | 'terms-or-policy' | 'authenticity' | 'authority-order';
	allegedGround: string;
	explanation: string;
	notifierName: string;
	notifierEmail: string;
	anonymous?: boolean;
	ownerOrDelegate: boolean;
	goodFaithAccepted: boolean;
	idempotencyKey: string;
}

export class ReviewModerationService {
	constructor(
		private readonly database: Database,
		private readonly environment: AppEnvironment,
		private readonly evidence: RestrictedEvidenceStore,
		private readonly clock: () => Date = () => new Date(),
		private readonly id: () => string = randomUUID,
		private readonly limiter: RateLimiter = new MemoryFixedWindowRateLimiter(clock)
	) {}

	async listModeratorQueue(actorUserId: string) {
		await this.requireModerator(actorUserId);
		const now = this.clock();
		const rows = await this.database
			.select({
				id: reviewNotice.id,
				status: reviewNotice.status,
				kind: reviewNotice.kind,
				allegedGround: reviewNotice.allegedGround,
				ownerAssertion: reviewNotice.ownerAssertion,
				priority: reviewNotice.priority,
				assignedModeratorId: reviewNotice.assignedModeratorId,
				assignedModeratorName: user.name,
				assignedModeratorEmail: user.email,
				submissionDeadline: reviewNotice.submissionDeadline,
				decisionDueAt: reviewNotice.decisionDueAt,
				createdAt: reviewNotice.createdAt,
				versionId: reviewNotice.versionId
			})
			.from(reviewNotice)
			.leftJoin(user, eq(user.id, reviewNotice.assignedModeratorId))
			.where(
				inArray(reviewNotice.status, [
					'received',
					'awaiting-submissions',
					'under-review',
					'decided'
				])
			)
			.orderBy(desc(reviewNotice.priority), asc(reviewNotice.createdAt));
		const redressRows = await this.database
			.select({
				noticeId: reviewRedressRequest.noticeId,
				decisionDueAt: reviewRedressRequest.decisionDueAt
			})
			.from(reviewRedressRequest)
			.where(
				and(
					inArray(reviewRedressRequest.status, ['submitted', 'under-review']),
					isNull(reviewRedressRequest.duplicateOfId)
				)
			)
			.orderBy(asc(reviewRedressRequest.decisionDueAt));
		const redressDueByNotice = new Map<string, Date>();
		for (const redress of redressRows) {
			if (!redressDueByNotice.has(redress.noticeId)) {
				redressDueByNotice.set(redress.noticeId, redress.decisionDueAt);
			}
		}
		return rows.map((row) => ({
			...row,
			assignedToActor: row.assignedModeratorId === actorUserId,
			redressDecisionDueAt: redressDueByNotice.get(row.id),
			overdue: Boolean(
				(row.status === 'awaiting-submissions' &&
					row.submissionDeadline &&
					row.submissionDeadline <= now) ||
				(row.status === 'under-review' && row.decisionDueAt && row.decisionDueAt <= now) ||
				(redressDueByNotice.get(row.id) && redressDueByNotice.get(row.id)! <= now)
			)
		}));
	}

	async getModeratorAssignmentContext(actorUserId: string) {
		const actorRole = await this.requireModerator(actorUserId);
		if (actorRole !== 'admin') {
			return { actorUserId, actorRole, assignableModerators: [] };
		}
		const rows = await this.database
			.select({
				userId: reviewModeratorAssignment.userId,
				role: reviewModeratorAssignment.role,
				name: user.name,
				email: user.email
			})
			.from(reviewModeratorAssignment)
			.innerJoin(user, eq(user.id, reviewModeratorAssignment.userId))
			.where(
				and(
					eq(reviewModeratorAssignment.environment, this.environment),
					isNull(reviewModeratorAssignment.revokedAt)
				)
			)
			.orderBy(asc(user.name), asc(user.email));
		const byUser = new Map<string, (typeof rows)[number]>();
		for (const row of rows) {
			const existing = byUser.get(row.userId);
			if (!existing || row.role === 'admin') byUser.set(row.userId, row);
		}
		return { actorUserId, actorRole, assignableModerators: [...byUser.values()] };
	}

	async getCaseForModerator(actorUserId: string, noticeId: string) {
		await this.requireModerator(actorUserId);
		const [record] = await this.database
			.select({
				id: reviewNotice.id,
				status: reviewNotice.status,
				kind: reviewNotice.kind,
				allegedGround: reviewNotice.allegedGround,
				explanation: reviewNotice.explanation,
				notifierName: reviewNotice.notifierName,
				notifierEmail: reviewNotice.notifierEmail,
				ownerAssertion: reviewNotice.ownerAssertion,
				assignedModeratorId: reviewNotice.assignedModeratorId,
				submissionDeadline: reviewNotice.submissionDeadline,
				decisionDueAt: reviewNotice.decisionDueAt,
				createdAt: reviewNotice.createdAt,
				versionId: reviewNotice.versionId,
				versionBody: reviewVersion.body,
				pseudonym: reviewVersion.pseudonymSnapshot,
				interimRestrictedAt: reviewPublication.interimRestrictedAt
			})
			.from(reviewNotice)
			.innerJoin(reviewVersion, eq(reviewVersion.id, reviewNotice.versionId))
			.innerJoin(reviewPublication, eq(reviewPublication.id, reviewNotice.publicationId))
			.where(eq(reviewNotice.id, noticeId))
			.limit(1);
		if (!record) throw new NotFoundError('Review case was not found');
		const [submissions, evidence, decisions, redress, events] = await Promise.all([
			this.database
				.select()
				.from(reviewCasePartySubmission)
				.where(eq(reviewCasePartySubmission.noticeId, noticeId))
				.orderBy(asc(reviewCasePartySubmission.createdAt)),
			this.database
				.select({
					id: reviewEvidenceObject.id,
					uploaderRole: reviewEvidenceObject.uploaderRole,
					originalFilename: reviewEvidenceObject.originalFilename,
					mediaType: reviewEvidenceObject.mediaType,
					sizeBytes: reviewEvidenceObject.sizeBytes,
					scanState: reviewEvidenceObject.scanState,
					expiresAt: reviewEvidenceObject.expiresAt,
					deletedAt: reviewEvidenceObject.deletedAt,
					createdAt: reviewEvidenceObject.createdAt
				})
				.from(reviewEvidenceObject)
				.where(eq(reviewEvidenceObject.noticeId, noticeId))
				.orderBy(asc(reviewEvidenceObject.createdAt)),
			this.database
				.select()
				.from(reviewModerationDecision)
				.where(eq(reviewModerationDecision.noticeId, noticeId))
				.orderBy(asc(reviewModerationDecision.decisionVersion)),
			this.database
				.select()
				.from(reviewRedressRequest)
				.where(eq(reviewRedressRequest.noticeId, noticeId))
				.orderBy(asc(reviewRedressRequest.createdAt)),
			this.database
				.select()
				.from(reviewModerationEvent)
				.where(eq(reviewModerationEvent.noticeId, noticeId))
				.orderBy(asc(reviewModerationEvent.createdAt))
		]);
		const assignmentUserIds = events
			.map((item) => item.reasonCode.match(/^assigned-to:(.+)$/)?.[1])
			.filter((value): value is string => Boolean(value));
		const identities = assignmentUserIds.length
			? await this.database
					.select({ id: user.id, name: user.name, email: user.email })
					.from(user)
					.where(inArray(user.id, assignmentUserIds))
			: [];
		const identityById = new Map(identities.map((identity) => [identity.id, identity]));
		return {
			...record,
			submissions,
			evidence,
			decisions,
			redress,
			events: events.map((item) => {
				const targetId = item.reasonCode.match(/^assigned-to:(.+)$/)?.[1];
				const identity = targetId ? identityById.get(targetId) : undefined;
				return {
					...item,
					presentationReason: identity
						? `Assigned to ${identity.name} (${identity.email})`
						: item.reasonCode
				};
			})
		};
	}

	async bootstrapModerator(input: {
		userId: string;
		role?: ModeratorRole;
		environment: AppEnvironment;
		operatorReference: string;
		reason: string;
	}) {
		if (
			input.environment !== this.environment ||
			['preview', 'production'].includes(this.environment)
		) {
			throw new AuthorizationError('Local review-role bootstrap is disabled for this environment');
		}
		const now = this.clock();
		const operatorReference = required(input.operatorReference, 'Operator reference');
		const reason = required(input.reason, 'Grant reason');
		return this.database.transaction(async (transaction) => {
			const assignmentId = this.id();
			const [record] = await transaction
				.insert(reviewModeratorAssignment)
				.values({
					id: assignmentId,
					userId: input.userId,
					role: input.role ?? 'review_moderator',
					environment: input.environment,
					operatorReference,
					grantReason: reason,
					grantedAt: now
				})
				.returning();
			await transaction.insert(reviewRoleEvent).values({
				id: this.id(),
				assignmentId,
				targetUserId: input.userId,
				role: record.role,
				action: 'granted',
				operatorReference,
				reason,
				createdAt: now
			});
			return record;
		});
	}

	async grantModerator(
		actorUserId: string,
		targetUserId: string,
		role: ModeratorRole,
		reasonValue: string
	) {
		if ((await this.requireModerator(actorUserId)) !== 'admin') {
			throw new AuthorizationError('Review administrator permission is required');
		}
		const reason = required(reasonValue, 'Grant reason');
		const now = this.clock();
		return this.database.transaction(async (transaction) => {
			const assignmentId = this.id();
			const [record] = await transaction
				.insert(reviewModeratorAssignment)
				.values({
					id: assignmentId,
					userId: targetUserId,
					role,
					environment: this.environment,
					grantedByUserId: actorUserId,
					grantReason: reason,
					grantedAt: now
				})
				.returning();
			await transaction.insert(reviewRoleEvent).values({
				id: this.id(),
				assignmentId,
				targetUserId,
				role,
				action: 'granted',
				actorUserId,
				reason,
				createdAt: now
			});
			return record;
		});
	}

	async revokeModerator(
		actorUserId: string,
		targetUserId: string,
		role: ModeratorRole,
		reasonValue: string
	) {
		if ((await this.requireModerator(actorUserId)) !== 'admin') {
			throw new AuthorizationError('Review administrator permission is required');
		}
		const reason = required(reasonValue, 'Revocation reason');
		const now = this.clock();
		return this.database.transaction(async (transaction) => {
			const [assignment] = await transaction
				.select()
				.from(reviewModeratorAssignment)
				.where(
					and(
						eq(reviewModeratorAssignment.userId, targetUserId),
						eq(reviewModeratorAssignment.role, role),
						eq(reviewModeratorAssignment.environment, this.environment),
						isNull(reviewModeratorAssignment.revokedAt)
					)
				)
				.limit(1);
			if (!assignment) throw new NotFoundError('Active review role was not found');
			await transaction
				.update(reviewModeratorAssignment)
				.set({ revokedByUserId: actorUserId, revocationReason: reason, revokedAt: now })
				.where(eq(reviewModeratorAssignment.id, assignment.id));
			const revokedSessions = await transaction
				.delete(session)
				.where(eq(session.userId, targetUserId))
				.returning({ id: session.id });
			await transaction.insert(reviewRoleEvent).values({
				id: this.id(),
				assignmentId: assignment.id,
				targetUserId,
				role,
				action: 'revoked',
				actorUserId,
				reason,
				createdAt: now
			});
			return { assignmentId: assignment.id, revokedSessions: revokedSessions.length };
		});
	}

	async submitNotice(input: NoticeInput) {
		if (!input.goodFaithAccepted) {
			throw new DomainValidationError('The good-faith declaration is required');
		}
		if (!['alleged-illegality', 'terms-or-policy', 'authenticity'].includes(input.kind)) {
			throw new DomainValidationError('Notice kind is invalid');
		}
		const anonymous = input.anonymous === true;
		const suppliedEmail = input.notifierEmail.trim().toLocaleLowerCase('en-US');
		const email =
			anonymous && !suppliedEmail ? '' : required(suppliedEmail, 'Notifier email', 3, 320);
		if (email && !/^\S+@\S+\.\S+$/.test(email))
			throw new DomainValidationError('Notifier email is invalid');
		const rate = await this.limiter.consume({
			purpose: 'review-notice',
			key: `${this.environment}:${email ? sha256(email) : `anonymous:${input.versionId}`}`,
			policy: reviewRateLimitPolicies['review-notice']
		});
		if (!rate.allowed) throw new ConflictError('Too many notices; try again later');
		const now = this.clock();
		const rawToken = randomBytes(24).toString('base64url');
		return this.database.transaction(async (transaction) => {
			const [duplicate] = await transaction
				.select({ id: reviewNotice.id })
				.from(reviewNotice)
				.where(eq(reviewNotice.idempotencyKey, required(input.idempotencyKey, 'Idempotency key')))
				.limit(1);
			if (duplicate) return { noticeId: duplicate.id, caseToken: undefined, duplicate: true };
			const [target] = await transaction
				.select({
					versionId: reviewVersion.id,
					publicationId: reviewVersion.publicationId,
					reviewId: reviewPublication.reviewId,
					authorId: placeReview.authorId
				})
				.from(reviewVersion)
				.innerJoin(reviewPublication, eq(reviewPublication.id, reviewVersion.publicationId))
				.innerJoin(placeReview, eq(placeReview.id, reviewPublication.reviewId))
				.where(eq(reviewVersion.id, input.versionId))
				.limit(1);
			if (!target || target.publicationId !== input.publicationId) {
				throw new DomainValidationError('Notice must target an exact publication version');
			}
			if (!target.authorId) throw new ConflictError('The review author account has been erased');
			const allegedGround = required(input.allegedGround, 'Alleged ground', 3, 500);
			let explanation: string;
			try {
				explanation = normalizeNoticeExplanation(input.explanation);
			} catch (cause) {
				throw new DomainValidationError(
					cause instanceof Error ? cause.message : 'Notice explanation is invalid'
				);
			}
			const notifierName = anonymous
				? 'anonymous'
				: required(input.notifierName, 'Notifier name', 2, 200);
			let exactUrl: URL;
			try {
				exactUrl = new URL(input.exactPublicUrl);
			} catch {
				throw new DomainValidationError('Exact public URL is invalid');
			}
			if (!['http:', 'https:'].includes(exactUrl.protocol)) {
				throw new DomainValidationError('Exact public URL must use HTTP or HTTPS');
			}
			const deduplicationKey = sha256(
				`${input.versionId}:${input.kind}:${allegedGround}:${email || 'anonymous'}`
			);
			await transaction.execute(
				sql`select pg_advisory_xact_lock(hashtextextended(${deduplicationKey}, 0))`
			);
			const [semanticDuplicate] = await transaction
				.select({ id: reviewNotice.id })
				.from(reviewNotice)
				.where(
					and(
						eq(reviewNotice.deduplicationKey, deduplicationKey),
						sql`${reviewNotice.status} <> 'closed'`
					)
				)
				.orderBy(desc(reviewNotice.createdAt))
				.limit(1);
			if (semanticDuplicate) {
				if (email) {
					await transaction.insert(reviewCaseAccessToken).values({
						id: this.id(),
						noticeId: semanticDuplicate.id,
						partyRole: 'notifier',
						tokenHash: sha256(rawToken),
						expiresAt: addDays(now, approvedReviewClockPolicy.notifierTokenLifetimeDays),
						createdAt: now
					});
				}
				return {
					noticeId: semanticDuplicate.id,
					caseToken: email ? rawToken : undefined,
					duplicate: true
				};
			}
			const noticeId = this.id();
			await transaction.insert(reviewNotice).values({
				id: noticeId,
				publicationId: input.publicationId,
				versionId: input.versionId,
				exactPublicUrl: exactUrl.toString(),
				kind: input.kind,
				allegedGround,
				explanation,
				notifierName,
				notifierEmail: email,
				notifierEmailHash: email ? sha256(email) : sha256(`anonymous:${noticeId}`),
				ownerAssertion: !anonymous && input.ownerOrDelegate ? 'asserted' : 'none',
				goodFaithAccepted: true,
				status: 'awaiting-submissions',
				priority: !anonymous && input.ownerOrDelegate ? 10 : 0,
				idempotencyKey: input.idempotencyKey,
				deduplicationKey,
				acknowledgedAt: now,
				submissionDeadline: addDays(now, approvedReviewClockPolicy.partySubmissionWindowDays),
				decisionDueAt: addDays(now, approvedReviewClockPolicy.initialDecisionDays),
				createdAt: now,
				updatedAt: now
			});
			if (email) {
				await transaction.insert(reviewCaseAccessToken).values({
					id: this.id(),
					noticeId,
					partyRole: 'notifier',
					tokenHash: sha256(rawToken),
					expiresAt: addDays(now, approvedReviewClockPolicy.notifierTokenLifetimeDays),
					createdAt: now
				});
			}
			await this.event(transaction, {
				noticeId,
				reviewId: target.reviewId,
				publicationId: target.publicationId,
				versionId: target.versionId,
				actorType: 'notifier',
				actorReference: email ? sha256(email) : 'anonymous',
				action: 'notice-received',
				reasonCode: input.kind
			});
			if (email) {
				await this.queueNotification(transaction, {
					noticeId,
					reviewId: target.reviewId,
					recipientRole: 'notifier',
					recipientReference: email,
					purpose: 'review-acknowledgement',
					variables: { caseReference: noticeId, caseToken: rawToken }
				});
			}
			await this.queueNotification(transaction, {
				noticeId,
				reviewId: target.reviewId,
				recipientRole: 'author',
				recipientReference: target.authorId,
				purpose: 'review-author-notice',
				variables: { caseReference: noticeId }
			});
			return { noticeId, caseToken: email ? rawToken : undefined, duplicate: false };
		});
	}

	async getCaseForAuthor(authorId: string, noticeId: string) {
		const record = await this.caseTarget(noticeId);
		if (record.authorId !== authorId) throw new NotFoundError('Review case was not found');
		return this.caseProjection(record, 'author');
	}

	async listCasesForAuthor(authorId: string) {
		return this.database
			.select({
				id: reviewNotice.id,
				status: reviewNotice.status,
				kind: reviewNotice.kind,
				createdAt: reviewNotice.createdAt
			})
			.from(reviewNotice)
			.innerJoin(reviewPublication, eq(reviewPublication.id, reviewNotice.publicationId))
			.innerJoin(placeReview, eq(placeReview.id, reviewPublication.reviewId))
			.where(eq(placeReview.authorId, authorId))
			.orderBy(desc(reviewNotice.createdAt));
	}

	async getCaseForNotifier(noticeId: string, rawToken: string) {
		await this.requireNotifierToken(noticeId, rawToken);
		return this.caseProjection(await this.caseTarget(noticeId), 'notifier');
	}

	async requestNotifierCaseAccess(input: {
		noticeId: string;
		email: string;
		caseActionUrl: (token: string) => string;
	}) {
		const email = input.email.trim().toLocaleLowerCase('en-US');
		const rate = await this.limiter.consume({
			purpose: 'review-case-access',
			key: `${this.environment}:${input.noticeId}:${sha256(email)}`,
			policy: reviewRateLimitPolicies['review-case-access']
		});
		if (!rate.allowed || !/^\S+@\S+\.\S+$/.test(email)) return { accepted: true };
		const [target] = await this.database
			.select({ id: reviewNotice.id, reviewId: reviewPublication.reviewId })
			.from(reviewNotice)
			.innerJoin(reviewPublication, eq(reviewPublication.id, reviewNotice.publicationId))
			.where(
				and(eq(reviewNotice.id, input.noticeId), eq(reviewNotice.notifierEmailHash, sha256(email)))
			)
			.limit(1);
		if (!target) return { accepted: true };
		const now = this.clock();
		const rawToken = randomBytes(24).toString('base64url');
		const tokenId = this.id();
		await this.database.transaction(async (transaction) => {
			await transaction.insert(reviewCaseAccessToken).values({
				id: tokenId,
				noticeId: target.id,
				partyRole: 'notifier',
				tokenHash: sha256(rawToken),
				expiresAt: addDays(now, approvedReviewClockPolicy.notifierTokenLifetimeDays),
				createdAt: now
			});
			await this.queueNotification(transaction, {
				noticeId: target.id,
				reviewId: target.reviewId,
				recipientRole: 'notifier',
				recipientReference: email,
				purpose: 'review-case-access',
				deliveryKey: tokenId,
				variables: {
					caseReference: target.id,
					actionUrl: input.caseActionUrl(rawToken)
				}
			});
		});
		return { accepted: true };
	}

	async submitPartyStatement(input: {
		noticeId: string;
		partyRole: PartyRole;
		statement: string;
		idempotencyKey: string;
		authorUserId?: string;
		notifierToken?: string;
	}) {
		await this.authorizeParty(input);
		const rate = await this.limiter.consume({
			purpose: 'review-case-message',
			key: `${input.noticeId}:${input.partyRole}`,
			policy: reviewRateLimitPolicies['review-case-message']
		});
		if (!rate.allowed) throw new ConflictError('Too many case submissions');
		const now = this.clock();
		const target = await this.caseTarget(input.noticeId);
		if (target.status === 'decided' || target.status === 'closed') {
			throw new ConflictError('Statements cannot be added after a case decision');
		}
		if (!target.submissionDeadline || target.submissionDeadline < now) {
			throw new ConflictError('The case submission window has closed');
		}
		const [record] = await this.database
			.insert(reviewCasePartySubmission)
			.values({
				id: this.id(),
				noticeId: input.noticeId,
				partyRole: input.partyRole,
				submitterUserId: input.partyRole === 'author' ? input.authorUserId : undefined,
				statement: normalizeCaseText(input.statement),
				idempotencyKey: required(input.idempotencyKey, 'Idempotency key'),
				submissionWindowEndsAt: target.submissionDeadline,
				createdAt: now
			})
			.onConflictDoNothing()
			.returning();
		return record;
	}

	async uploadEvidence(input: {
		noticeId: string;
		partyRole: PartyRole;
		bytes: Uint8Array;
		mediaType: string;
		filename?: string;
		purpose: string;
		authorUserId?: string;
		notifierToken?: string;
	}) {
		await this.authorizeParty(input);
		const target = await this.caseTarget(input.noticeId);
		if (target.status === 'closed')
			throw new ConflictError('Evidence cannot be added to a closed case');
		let metadata: ReturnType<typeof validateEvidenceMetadata>;
		try {
			metadata = validateEvidenceMetadata({
				mediaType: input.mediaType,
				sizeBytes: input.bytes.byteLength,
				filename: input.filename
			});
		} catch (cause) {
			throw new DomainValidationError(
				cause instanceof Error ? cause.message : 'Evidence file is invalid'
			);
		}
		const [{ value }] = await this.database
			.select({ value: count() })
			.from(reviewEvidenceObject)
			.where(
				and(
					eq(reviewEvidenceObject.noticeId, input.noticeId),
					isNull(reviewEvidenceObject.deletedAt)
				)
			);
		if (value >= EVIDENCE_MAX_FILES_PER_CASE)
			throw new ConflictError('Evidence file limit reached');
		const rate = await this.limiter.consume({
			purpose: 'review-evidence-upload',
			key: `${input.noticeId}:${input.partyRole}`,
			policy: reviewRateLimitPolicies['review-evidence-upload']
		});
		if (!rate.allowed) throw new ConflictError('Too many evidence uploads');
		const now = this.clock();
		const id = this.id();
		const handle = `case-evidence/${this.environment}/${id}`;
		await this.evidence.put({ handle, bytes: input.bytes, mediaType: input.mediaType });
		try {
			const [record] = await this.database
				.insert(reviewEvidenceObject)
				.values({
					id,
					noticeId: input.noticeId,
					uploaderRole: input.partyRole,
					blobHandle: handle,
					originalFilename: metadata.filename,
					mediaType: input.mediaType,
					sizeBytes: input.bytes.byteLength,
					checksum: sha256(input.bytes),
					scanState: 'pending',
					purpose: required(input.purpose, 'Evidence purpose', 3, 200),
					accessClassification: 'restricted-case-evidence',
					expiresAt: null,
					createdAt: now
				})
				.returning();
			return record;
		} catch (error) {
			await this.evidence.delete(handle);
			throw error;
		}
	}

	async markEvidenceScan(actorUserId: string, evidenceId: string, clean: boolean) {
		await this.requireModerator(actorUserId);
		const [record] = await this.database
			.update(reviewEvidenceObject)
			.set({ scanState: clean ? 'clean' : 'rejected' })
			.where(and(eq(reviewEvidenceObject.id, evidenceId), isNull(reviewEvidenceObject.deletedAt)))
			.returning();
		if (!record) throw new NotFoundError('Evidence object was not found');
		if (!clean) await this.evidence.delete(record.blobHandle);
		return record;
	}

	async deleteEvidence(input: {
		evidenceId: string;
		partyRole: PartyRole;
		authorUserId?: string;
		notifierToken?: string;
	}) {
		const [record] = await this.database
			.select()
			.from(reviewEvidenceObject)
			.where(
				and(eq(reviewEvidenceObject.id, input.evidenceId), isNull(reviewEvidenceObject.deletedAt))
			)
			.limit(1);
		if (!record || record.uploaderRole !== input.partyRole) {
			throw new NotFoundError('Evidence object was not found');
		}
		await this.authorizeParty({ noticeId: record.noticeId, ...input });
		await this.evidence.delete(record.blobHandle);
		const now = this.clock();
		const [deleted] = await this.database
			.update(reviewEvidenceObject)
			.set({ deletedAt: now })
			.where(
				and(eq(reviewEvidenceObject.id, input.evidenceId), isNull(reviewEvidenceObject.deletedAt))
			)
			.returning();
		if (!deleted) throw new ConflictError('Evidence was deleted concurrently');
		await this.database.insert(reviewEvidenceAccess).values({
			id: this.id(),
			evidenceId: record.id,
			actorType: input.partyRole,
			actorReference: input.authorUserId ?? sha256(input.notifierToken ?? ''),
			purpose: 'uploader-deletion',
			accessedAt: now
		});
		return deleted;
	}

	async readEvidence(input: {
		evidenceId: string;
		actorType: 'author' | 'notifier' | 'review_moderator' | 'admin';
		actorReference: string;
		notifierToken?: string;
	}) {
		return (await this.readEvidenceFile(input)).bytes;
	}

	async readEvidenceFile(input: {
		evidenceId: string;
		noticeId?: string;
		actorType: 'author' | 'notifier' | 'review_moderator' | 'admin';
		actorReference: string;
		notifierToken?: string;
	}) {
		const [record] = await this.database
			.select()
			.from(reviewEvidenceObject)
			.where(
				and(eq(reviewEvidenceObject.id, input.evidenceId), isNull(reviewEvidenceObject.deletedAt))
			)
			.limit(1);
		if (
			!record ||
			(input.noticeId && record.noticeId !== input.noticeId) ||
			record.scanState !== 'clean'
		)
			throw new NotFoundError('Evidence object was not found');
		if (input.actorType === 'review_moderator' || input.actorType === 'admin') {
			await this.requireModerator(input.actorReference);
		} else {
			await this.authorizeParty({
				noticeId: record.noticeId,
				partyRole: input.actorType,
				authorUserId: input.actorType === 'author' ? input.actorReference : undefined,
				notifierToken: input.notifierToken
			});
			if (record.uploaderRole !== input.actorType) {
				throw new AuthorizationError("A case party cannot access the other party's evidence");
			}
		}
		const bytes = await this.evidence.get(record.blobHandle);
		if (!bytes) throw new NotFoundError('Evidence bytes were not found');
		await this.database.insert(reviewEvidenceAccess).values({
			id: this.id(),
			evidenceId: record.id,
			actorType: input.actorType,
			actorReference: input.actorReference,
			purpose: 'case-review',
			accessedAt: this.clock()
		});
		return {
			bytes,
			mediaType: record.mediaType,
			filename: record.originalFilename ?? 'case-evidence'
		};
	}

	async assign(actorUserId: string, noticeId: string, moderatorUserId = actorUserId) {
		const actorRole = await this.requireModerator(actorUserId);
		if (moderatorUserId !== actorUserId && actorRole !== 'admin') {
			throw new AuthorizationError(
				'Review administrator permission is required to assign another moderator'
			);
		}
		await this.requireModerator(moderatorUserId);
		const now = this.clock();
		return this.database.transaction(async (transaction) => {
			const target = await this.caseTarget(noticeId, transaction);
			const initialAssignment =
				!target.assignedModeratorId &&
				(target.status === 'received' || target.status === 'awaiting-submissions');
			const administrativeReassignment =
				actorRole === 'admin' &&
				target.status === 'under-review' &&
				target.assignedModeratorId !== moderatorUserId;
			if (!initialAssignment && !administrativeReassignment) {
				throw new ConflictError('Review case cannot be assigned in its current state');
			}
			const [record] = await transaction
				.update(reviewNotice)
				.set({ assignedModeratorId: moderatorUserId, status: 'under-review', updatedAt: now })
				.where(
					and(
						eq(reviewNotice.id, noticeId),
						eq(reviewNotice.status, target.status),
						target.assignedModeratorId
							? eq(reviewNotice.assignedModeratorId, target.assignedModeratorId)
							: isNull(reviewNotice.assignedModeratorId)
					)
				)
				.returning();
			if (!record) throw new ConflictError('Review case assignment changed; reload and try again');
			await this.event(transaction, {
				noticeId,
				reviewId: target.reviewId,
				publicationId: target.publicationId,
				versionId: target.versionId,
				actorType: actorRole,
				actorReference: actorUserId,
				action: initialAssignment ? 'case-assigned' : 'case-reassigned',
				reasonCode: `assigned-to:${moderatorUserId}`
			});
			return record;
		});
	}

	async verifyOwnerAssertion(
		actorUserId: string,
		noticeId: string,
		verified: boolean,
		reasonCode: string
	) {
		const actorRole = await this.requireModerator(actorUserId);
		const now = this.clock();
		return this.database.transaction(async (transaction) => {
			const target = await this.caseTarget(noticeId, transaction);
			const [notice] = await transaction
				.select({ ownerAssertion: reviewNotice.ownerAssertion })
				.from(reviewNotice)
				.where(eq(reviewNotice.id, noticeId));
			if (!notice || notice.ownerAssertion === 'none') {
				throw new ConflictError('The notice contains no owner or delegate assertion');
			}
			await transaction
				.update(reviewNotice)
				.set({ ownerAssertion: verified ? 'verified' : 'rejected', updatedAt: now })
				.where(eq(reviewNotice.id, noticeId));
			await this.event(transaction, {
				noticeId,
				reviewId: target.reviewId,
				publicationId: target.publicationId,
				versionId: target.versionId,
				actorType: actorRole,
				actorReference: actorUserId,
				action: verified ? 'owner-assertion-verified' : 'owner-assertion-rejected',
				reasonCode: required(reasonCode, 'Assertion decision reason')
			});
			return { verified };
		});
	}

	async setInterimRestriction(actorUserId: string, noticeId: string, reasonCode: string) {
		const actorRole = await this.requireModerator(actorUserId);
		const now = this.clock();
		return this.database.transaction(async (transaction) => {
			const target = await this.caseTarget(noticeId, transaction);
			if (target.interimRestrictedAt) {
				throw new ConflictError('This review already has an active interim restriction');
			}
			await transaction
				.update(reviewPublication)
				.set({
					interimRestrictedAt: now,
					visibilityReason: required(reasonCode, 'Restriction reason')
				})
				.where(eq(reviewPublication.id, target.publicationId));
			await this.event(transaction, {
				noticeId,
				reviewId: target.reviewId,
				publicationId: target.publicationId,
				versionId: target.versionId,
				actorType: actorRole,
				actorReference: actorUserId,
				action: 'interim-restriction',
				reasonCode
			});
			return { restrictedAt: now };
		});
	}

	async clearInterimRestriction(actorUserId: string, noticeId: string, reasonCode: string) {
		const actorRole = await this.requireModerator(actorUserId);
		const now = this.clock();
		return this.database.transaction(async (transaction) => {
			const target = await this.caseTarget(noticeId, transaction);
			if (!target.interimRestrictedAt) {
				throw new ConflictError('This review has no active interim restriction');
			}
			await transaction
				.update(reviewPublication)
				.set({
					interimRestrictedAt: null,
					visibilityReason: required(reasonCode, 'Restriction removal reason')
				})
				.where(eq(reviewPublication.id, target.publicationId));
			await this.event(transaction, {
				noticeId,
				reviewId: target.reviewId,
				publicationId: target.publicationId,
				versionId: target.versionId,
				actorType: actorRole,
				actorReference: actorUserId,
				action: 'interim-restriction-lifted',
				reasonCode
			});
			return { unrestrictedAt: now };
		});
	}

	async decide(
		actorUserId: string,
		input: {
			noticeId: string;
			outcome: 'no-action' | 'restrict' | 'remove' | 'restore';
			scope: string;
			duration?: string;
			ground: string;
			reasonedExplanation: string;
			factsReliedOn: string;
			automationDisclosure: string;
			reviewedByUserId?: string;
		}
	) {
		const actorRole = await this.requireModerator(actorUserId);
		if (input.reviewedByUserId) {
			await this.requireModerator(input.reviewedByUserId);
			if (input.reviewedByUserId === actorUserId) {
				throw new DomainValidationError('Second review requires a different moderator');
			}
		}
		const now = this.clock();
		return this.database.transaction(async (transaction) => {
			const target = await this.caseTarget(input.noticeId, transaction);
			if (
				target.assignedModeratorId &&
				target.assignedModeratorId !== actorUserId &&
				actorRole !== 'admin'
			) {
				throw new AuthorizationError('The case is assigned to another moderator');
			}
			const [policy] = await transaction
				.select({ id: reviewPolicyVersion.id })
				.from(reviewPolicyVersion)
				.where(eq(reviewPolicyVersion.legalReviewStatus, 'approved'))
				.orderBy(asc(reviewPolicyVersion.effectiveFrom))
				.limit(1);
			if (!policy) throw new ConflictError('No approved review policy is active');
			const [{ value: previousCount }] = await transaction
				.select({ value: count() })
				.from(reviewModerationDecision)
				.where(eq(reviewModerationDecision.noticeId, input.noticeId));
			const [previous] = await transaction
				.select({ id: reviewModerationDecision.id })
				.from(reviewModerationDecision)
				.where(eq(reviewModerationDecision.noticeId, input.noticeId))
				.orderBy(sql`${reviewModerationDecision.decisionVersion} desc`)
				.limit(1);
			const decisionId = this.id();
			await transaction.insert(reviewModerationDecision).values({
				id: decisionId,
				noticeId: input.noticeId,
				decisionVersion: previousCount + 1,
				outcome: input.outcome,
				scope: required(input.scope, 'Decision scope'),
				duration: input.duration,
				ground: required(input.ground, 'Decision ground'),
				policyVersionId: policy.id,
				reasonedExplanation: normalizeCaseText(input.reasonedExplanation, 'Reasoned explanation'),
				factsReliedOn: normalizeCaseText(input.factsReliedOn, 'Facts relied on'),
				automationDisclosure: required(input.automationDisclosure, 'Automation disclosure', 3, 500),
				decidedByUserId: actorUserId,
				reviewedByUserId: input.reviewedByUserId,
				supersedesDecisionId: previous?.id,
				decidedAt: now,
				redressSubmissionDeadline: addDays(
					now,
					approvedReviewClockPolicy.redressSubmissionWindowDays
				)
			});
			const publicationChange =
				input.outcome === 'remove'
					? { lifecycle: 'removed' as const, removedAt: now, interimRestrictedAt: null }
					: input.outcome === 'restrict'
						? { interimRestrictedAt: now }
						: input.outcome === 'restore'
							? target.expiresAt <= now
								? { lifecycle: 'expired' as const, expiredAt: now, interimRestrictedAt: null }
								: { lifecycle: 'published' as const, removedAt: null, interimRestrictedAt: null }
							: { interimRestrictedAt: null };
			await transaction
				.update(reviewPublication)
				.set({ ...publicationChange, visibilityReason: `decision:${decisionId}` })
				.where(eq(reviewPublication.id, target.publicationId));
			await transaction
				.update(reviewNotice)
				.set({ status: 'decided', decidedAt: now, updatedAt: now })
				.where(eq(reviewNotice.id, input.noticeId));
			if (previous) {
				await transaction
					.update(reviewRedressRequest)
					.set({ status: 'decided', decidedAt: now })
					.where(
						and(
							eq(reviewRedressRequest.noticeId, input.noticeId),
							inArray(reviewRedressRequest.status, ['submitted', 'under-review'])
						)
					);
			}
			await this.event(transaction, {
				noticeId: input.noticeId,
				reviewId: target.reviewId,
				publicationId: target.publicationId,
				versionId: target.versionId,
				actorType: actorRole,
				actorReference: actorUserId,
				action: `decision-${input.outcome}`,
				reasonCode: input.ground,
				sourceDecisionId: decisionId
			});
			for (const role of ['author', 'notifier'] as const) {
				if (
					(role === 'author' && !target.authorId) ||
					(role === 'notifier' && !target.notifierEmail)
				)
					continue;
				await this.queueNotification(transaction, {
					noticeId: input.noticeId,
					reviewId: target.reviewId,
					recipientRole: role,
					recipientReference: role === 'author' ? target.authorId! : target.notifierEmail,
					purpose: input.outcome === 'restore' ? 'review-reinstatement' : 'review-decision',
					variables: {
						caseReference: input.noticeId,
						outcome: input.outcome,
						decisionReference: decisionId
					}
				});
			}
			return { decisionId };
		});
	}

	async requestRedress(input: {
		noticeId: string;
		decisionId: string;
		partyRole: PartyRole;
		statement: string;
		idempotencyKey: string;
		authorUserId?: string;
		notifierToken?: string;
	}) {
		await this.authorizeParty(input);
		const rate = await this.limiter.consume({
			purpose: 'review-redress',
			key: `${input.noticeId}:${input.partyRole}`,
			policy: reviewRateLimitPolicies['review-redress']
		});
		if (!rate.allowed) throw new ConflictError('Redress attempt limit reached');
		const now = this.clock();
		const [decision] = await this.database
			.select({
				id: reviewModerationDecision.id,
				redressSubmissionDeadline: reviewModerationDecision.redressSubmissionDeadline
			})
			.from(reviewModerationDecision)
			.where(
				and(
					eq(reviewModerationDecision.id, input.decisionId),
					eq(reviewModerationDecision.noticeId, input.noticeId)
				)
			)
			.limit(1);
		if (!decision) throw new NotFoundError('Decision was not found');
		if (decision.redressSubmissionDeadline < now) {
			throw new ConflictError('The redress submission window has closed');
		}
		const [record] = await this.database
			.insert(reviewRedressRequest)
			.values({
				id: this.id(),
				noticeId: input.noticeId,
				decisionId: input.decisionId,
				partyRole: input.partyRole,
				statement: normalizeCaseText(input.statement, 'Redress statement'),
				idempotencyKey: required(input.idempotencyKey, 'Idempotency key'),
				createdAt: now,
				decisionDueAt: addDays(now, approvedReviewClockPolicy.redressDecisionDays)
			})
			.onConflictDoNothing()
			.returning();
		if (!record) {
			throw new ConflictError('Redress was already requested for this decision');
		}
		return record;
	}

	async closeCase(actorUserId: string, noticeId: string) {
		const actorRole = await this.requireModerator(actorUserId);
		const now = this.clock();
		return this.database.transaction(async (transaction) => {
			const target = await this.caseTarget(noticeId, transaction);
			if (target.status !== 'decided') throw new ConflictError('Only a decided case can be closed');
			const [openRedress] = await transaction
				.select({ id: reviewRedressRequest.id })
				.from(reviewRedressRequest)
				.where(
					and(
						eq(reviewRedressRequest.noticeId, noticeId),
						inArray(reviewRedressRequest.status, ['submitted', 'under-review'])
					)
				)
				.limit(1);
			if (openRedress) throw new ConflictError('Open redress must be decided before case closure');
			await transaction
				.update(reviewNotice)
				.set({ status: 'closed', closedAt: now, updatedAt: now })
				.where(eq(reviewNotice.id, noticeId));
			await transaction
				.update(reviewEvidenceObject)
				.set({ expiresAt: evidenceDeletionDeadline(now) })
				.where(
					and(eq(reviewEvidenceObject.noticeId, noticeId), isNull(reviewEvidenceObject.deletedAt))
				);
			await this.event(transaction, {
				noticeId,
				reviewId: target.reviewId,
				publicationId: target.publicationId,
				versionId: target.versionId,
				actorType: actorRole,
				actorReference: actorUserId,
				action: 'case-closed',
				reasonCode: 'decision-and-redress-complete'
			});
			return { closedAt: now };
		});
	}

	async runExpiryBatch(limit = 100) {
		const now = this.clock();
		return this.database.transaction(async (transaction) => {
			const records = await transaction
				.select({ id: reviewPublication.id, reviewId: reviewPublication.reviewId })
				.from(reviewPublication)
				.where(
					and(eq(reviewPublication.lifecycle, 'published'), lte(reviewPublication.expiresAt, now))
				)
				.orderBy(asc(reviewPublication.expiresAt), asc(reviewPublication.id))
				.limit(limit)
				.for('update', { skipLocked: true });
			for (const record of records) {
				await transaction
					.update(reviewPublication)
					.set({ lifecycle: 'expired', expiredAt: now, visibilityReason: 'time-expiry' })
					.where(
						and(eq(reviewPublication.id, record.id), eq(reviewPublication.lifecycle, 'published'))
					);
				await this.event(transaction, {
					reviewId: record.reviewId,
					publicationId: record.id,
					actorType: 'system',
					action: 'review-expired',
					reasonCode: 'publication-lifetime'
				});
			}
			return records.length;
		});
	}

	async runEvidenceRetentionBatch(limit = 100) {
		const now = this.clock();
		const records = await this.database
			.select()
			.from(reviewEvidenceObject)
			.where(and(isNull(reviewEvidenceObject.deletedAt), lte(reviewEvidenceObject.expiresAt, now)))
			.orderBy(asc(reviewEvidenceObject.expiresAt), asc(reviewEvidenceObject.id))
			.limit(limit);
		for (const record of records) {
			await this.evidence.delete(record.blobHandle);
			await this.database
				.update(reviewEvidenceObject)
				.set({ deletedAt: now })
				.where(and(eq(reviewEvidenceObject.id, record.id), isNull(reviewEvidenceObject.deletedAt)));
		}
		return records.length;
	}

	private async authorizeParty(input: {
		noticeId: string;
		partyRole: PartyRole;
		authorUserId?: string;
		notifierToken?: string;
	}) {
		if (input.partyRole === 'notifier') {
			if (!input.notifierToken) throw new AuthorizationError('Notifier case token is required');
			await this.requireNotifierToken(input.noticeId, input.notifierToken);
			return;
		}
		if (!input.authorUserId) throw new AuthorizationError('Author session is required');
		const target = await this.caseTarget(input.noticeId);
		if (target.authorId !== input.authorUserId)
			throw new NotFoundError('Review case was not found');
	}

	private async requireNotifierToken(noticeId: string, rawToken: string) {
		const now = this.clock();
		const [token] = await this.database
			.select()
			.from(reviewCaseAccessToken)
			.where(
				and(
					eq(reviewCaseAccessToken.noticeId, noticeId),
					eq(reviewCaseAccessToken.partyRole, 'notifier'),
					eq(reviewCaseAccessToken.tokenHash, sha256(rawToken)),
					gt(reviewCaseAccessToken.expiresAt, now)
				)
			)
			.limit(1);
		if (!token) throw new AuthorizationError('Notifier case token is invalid or expired');
		return token;
	}

	private async requireModerator(
		userId: string,
		database: ReviewDatabase = this.database
	): Promise<ModeratorRole> {
		const reviewRoles = await database
			.select({ role: reviewModeratorAssignment.role })
			.from(reviewModeratorAssignment)
			.where(
				and(
					eq(reviewModeratorAssignment.userId, userId),
					eq(reviewModeratorAssignment.environment, this.environment),
					isNull(reviewModeratorAssignment.revokedAt)
				)
			);
		if (reviewRoles.some((assignment) => assignment.role === 'admin')) return 'admin';
		if (reviewRoles.length > 0) return 'review_moderator';
		const [catalogueAdmin] = await database
			.select({ id: catalogueRoleAssignment.id })
			.from(catalogueRoleAssignment)
			.where(
				and(
					eq(catalogueRoleAssignment.userId, userId),
					eq(catalogueRoleAssignment.role, 'admin'),
					eq(catalogueRoleAssignment.environment, this.environment),
					isNull(catalogueRoleAssignment.revokedAt)
				)
			)
			.limit(1);
		if (catalogueAdmin) return 'admin';
		throw new AuthorizationError('Review moderator permission is required');
	}

	private async caseTarget(noticeId: string, database: ReviewDatabase = this.database) {
		const [record] = await database
			.select({
				id: reviewNotice.id,
				status: reviewNotice.status,
				kind: reviewNotice.kind,
				allegedGround: reviewNotice.allegedGround,
				notifierEmail: reviewNotice.notifierEmail,
				submissionDeadline: reviewNotice.submissionDeadline,
				assignedModeratorId: reviewNotice.assignedModeratorId,
				createdAt: reviewNotice.createdAt,
				publicationId: reviewNotice.publicationId,
				versionId: reviewNotice.versionId,
				reviewId: reviewPublication.reviewId,
				authorId: placeReview.authorId,
				expiresAt: reviewPublication.expiresAt,
				interimRestrictedAt: reviewPublication.interimRestrictedAt
			})
			.from(reviewNotice)
			.innerJoin(reviewPublication, eq(reviewPublication.id, reviewNotice.publicationId))
			.innerJoin(placeReview, eq(placeReview.id, reviewPublication.reviewId))
			.where(eq(reviewNotice.id, noticeId))
			.limit(1);
		if (!record) throw new NotFoundError('Review case was not found');
		return record;
	}

	private async caseProjection(
		record: Awaited<ReturnType<ReviewModerationService['caseTarget']>>,
		party: PartyRole
	) {
		const [submissions, evidence, decisions, redress] = await Promise.all([
			this.database
				.select({
					id: reviewCasePartySubmission.id,
					statement: reviewCasePartySubmission.statement,
					createdAt: reviewCasePartySubmission.createdAt
				})
				.from(reviewCasePartySubmission)
				.where(
					and(
						eq(reviewCasePartySubmission.noticeId, record.id),
						eq(reviewCasePartySubmission.partyRole, party)
					)
				)
				.orderBy(asc(reviewCasePartySubmission.createdAt)),
			this.database
				.select({
					id: reviewEvidenceObject.id,
					originalFilename: reviewEvidenceObject.originalFilename,
					mediaType: reviewEvidenceObject.mediaType,
					sizeBytes: reviewEvidenceObject.sizeBytes,
					scanState: reviewEvidenceObject.scanState,
					expiresAt: reviewEvidenceObject.expiresAt,
					createdAt: reviewEvidenceObject.createdAt
				})
				.from(reviewEvidenceObject)
				.where(
					and(
						eq(reviewEvidenceObject.noticeId, record.id),
						eq(reviewEvidenceObject.uploaderRole, party),
						isNull(reviewEvidenceObject.deletedAt)
					)
				)
				.orderBy(asc(reviewEvidenceObject.createdAt)),
			this.database
				.select({
					id: reviewModerationDecision.id,
					outcome: reviewModerationDecision.outcome,
					scope: reviewModerationDecision.scope,
					duration: reviewModerationDecision.duration,
					ground: reviewModerationDecision.ground,
					policyVersionId: reviewModerationDecision.policyVersionId,
					reasonedExplanation: reviewModerationDecision.reasonedExplanation,
					factsReliedOn: reviewModerationDecision.factsReliedOn,
					automationDisclosure: reviewModerationDecision.automationDisclosure,
					decidedAt: reviewModerationDecision.decidedAt,
					redressSubmissionDeadline: reviewModerationDecision.redressSubmissionDeadline
				})
				.from(reviewModerationDecision)
				.where(eq(reviewModerationDecision.noticeId, record.id))
				.orderBy(asc(reviewModerationDecision.decisionVersion)),
			this.database
				.select({
					id: reviewRedressRequest.id,
					decisionId: reviewRedressRequest.decisionId,
					statement: reviewRedressRequest.statement,
					status: reviewRedressRequest.status,
					createdAt: reviewRedressRequest.createdAt,
					decisionDueAt: reviewRedressRequest.decisionDueAt
				})
				.from(reviewRedressRequest)
				.where(
					and(
						eq(reviewRedressRequest.noticeId, record.id),
						eq(reviewRedressRequest.partyRole, party),
						isNull(reviewRedressRequest.duplicateOfId)
					)
				)
				.orderBy(asc(reviewRedressRequest.createdAt))
		]);
		return {
			id: record.id,
			status: record.status,
			kind: record.kind,
			allegedGround: record.allegedGround,
			createdAt: record.createdAt,
			submissionDeadline: record.submissionDeadline,
			submissionOpen:
				(record.status === 'received' ||
					record.status === 'awaiting-submissions' ||
					record.status === 'under-review') &&
				Boolean(record.submissionDeadline && record.submissionDeadline >= this.clock()),
			submissions,
			evidence,
			decisions: decisions.map((decision) => ({
				...decision,
				redressOpen:
					decision.redressSubmissionDeadline >= this.clock() &&
					!redress.some((request) => request.decisionId === decision.id)
			})),
			redress
		};
	}

	private async queueNotification(
		transaction: Transaction,
		input: {
			noticeId: string;
			reviewId: string;
			recipientRole: PartyRole;
			recipientReference: string;
			purpose: ReviewOutboxPurpose;
			deliveryKey?: string;
			variables: Record<string, string>;
		}
	) {
		const recipientReference = input.recipientReference.trim();
		if (!recipientReference) throw new Error('Review notification recipient is required');
		const now = this.clock();
		const outboxId = this.id();
		const deliveryKey = input.deliveryKey ?? input.variables.decisionReference ?? '';
		const idempotencyKey = `${input.noticeId}:${input.recipientRole}:${input.purpose}:${deliveryKey}`;
		const [queued] = await transaction
			.insert(transactionalOutbox)
			.values({
				id: outboxId,
				purpose: input.purpose,
				recipientReference,
				payload: input.variables,
				idempotencyKey,
				availableAt: now,
				createdAt: now
			})
			.onConflictDoNothing()
			.returning({ id: transactionalOutbox.id });
		if (!queued) return;
		await transaction
			.insert(reviewNotification)
			.values({
				id: this.id(),
				noticeId: input.noticeId,
				reviewId: input.reviewId,
				recipientRole: input.recipientRole,
				purpose: input.purpose,
				deliveryKey,
				templateVersion: 'v1',
				outboxJobId: outboxId,
				createdAt: now
			})
			.onConflictDoNothing();
	}

	private async event(
		transaction: Transaction,
		input: {
			noticeId?: string;
			reviewId?: string;
			publicationId?: string;
			versionId?: string;
			actorType: 'author' | 'notifier' | 'review_moderator' | 'admin' | 'system';
			actorReference?: string;
			action: string;
			reasonCode: string;
			sourceDecisionId?: string;
		}
	) {
		await transaction.insert(reviewModerationEvent).values({
			id: this.id(),
			...input,
			createdAt: this.clock()
		});
	}
}
