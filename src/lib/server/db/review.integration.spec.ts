import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { normalizeOsmPlace } from '$lib/domain/catalogue/normalization';
import { createDatabase } from '$lib/server/db/connection';
import {
	comparisonEvidence,
	placeReview,
	rankingList,
	rankingRevision,
	reviewCatalogueConflict,
	reviewDeclarationAcceptance,
	reviewModerationDecision,
	reviewModerationEvent,
	reviewNotification,
	reviewNotice,
	reviewPublication,
	reviewRedressRequest,
	reviewRetentionHold,
	reviewRoleEvent,
	reviewVersion,
	transactionalOutbox,
	user
} from '$lib/server/db/schema';
import { EphemeralEvidenceStore } from '$lib/server/providers/evidence';
import { LocalEmailProvider } from '$lib/server/providers/local';
import { CatalogueRepository } from '$lib/server/repositories/catalogue';
import { CatalogueGovernanceService } from '$lib/server/services/catalogue-governance';
import { ReviewModerationService } from '$lib/server/services/review-moderation';
import { ReviewOutboxWorker } from '$lib/server/services/review-outbox';
import { ReviewPrivacyService } from '$lib/server/services/review-privacy';
import { ReviewService } from '$lib/server/services/reviews';

const connection = createDatabase(process.env.DATABASE_URL!);
const { db } = connection;
let now = new Date('2026-08-15T10:00:00.000Z');
const clock = () => now;
const evidence = new EphemeralEvidenceStore();

function fixturePlace(id: number, name: string) {
	return normalizeOsmPlace({
		provider: 'openstreetmap',
		elementType: 'node',
		elementId: id,
		category: 'restaurant',
		dataClass: 'synthetic',
		sourceVersion: 1,
		sourceTimestamp: now,
		tags: { amenity: 'restaurant', name, 'addr:city': 'Torino' },
		latitude: 45.07 + id / 10_000,
		longitude: 7.68 + id / 10_000
	});
}

const declarations = {
	personallyUsedService: true,
	contentConcernsExperience: true,
	noIncentive: true
};

async function setup() {
	now = new Date('2026-08-15T10:00:00.000Z');
	await db.execute(
		sql`truncate table "user", "catalogue_import", "place", "review_policy_version" cascade`
	);
	await db.insert(user).values([
		{ id: 'author', name: 'Private auth name', email: 'author@example.test', emailVerified: true },
		{ id: 'other', name: 'Other', email: 'other@example.test', emailVerified: true },
		{ id: 'moderator', name: 'Moderator', email: 'moderator@example.test', emailVerified: true },
		{ id: 'admin', name: 'Admin', email: 'admin@example.test', emailVerified: true },
		{ id: 'unverified', name: 'Unverified', email: 'u@example.test', emailVerified: false }
	]);
	const catalogue = new CatalogueRepository(db, 'test');
	await catalogue.startImport({
		id: 'review-import',
		category: 'restaurant',
		dataClass: 'synthetic',
		sourceUri: 'fixture://reviews',
		sourceChecksum: 'reviews',
		normalizerVersion: 'test-v1',
		localityIndexVersion: 'test-v1',
		startedAt: now
	});
	const places = [fixturePlace(1, 'First'), fixturePlace(2, 'Second')];
	await catalogue.stagePlaces('review-import', places);
	await catalogue.promote('review-import', places, [], { normalized: 2 }, now);
	const reviews = new ReviewService(db, 'test', clock);
	await reviews.installPolicy({
		version: 'local-v1',
		body: 'Synthetic local review rules',
		legalReviewStatus: 'approved',
		declarations: {
			en: { used: 'I used the service', relevant: 'This is relevant', incentive: 'No incentive' },
			it: { used: 'Ho usato il servizio', relevant: 'È pertinente', incentive: 'Nessun incentivo' }
		}
	});
	await reviews.setPseudonym('author', 'Taste Memory');
	await reviews.setPseudonym('other', 'Other Guest');
	return { reviews, catalogue };
}

async function publish(reviews: ReviewService, placeId = 'osm:node:1', authorId = 'author') {
	return reviews.create(authorId, {
		placeId,
		body: 'A concrete and useful account of the visit.',
		serviceDate: '2026-08-01',
		locale: 'en',
		declarations,
		idempotencyKey: `create-${authorId}-${placeId}`
	});
}

afterAll(async () => {
	await connection.close();
});

afterEach(async () => {
	await db.execute(sql`truncate table "catalogue_change" cascade`);
});

describe('review author lifecycle and isolation', () => {
	it('versions, substitutes, withdraws, and remains independent from ranking data', async () => {
		const { reviews } = await setup();
		await db.insert(rankingList).values({
			id: 'list',
			ownerId: 'author',
			category: 'restaurant',
			createdAt: now,
			updatedAt: now
		});
		const before = {
			lists: await db.select().from(rankingList),
			revisions: await db.select().from(rankingRevision),
			comparisons: await db.select().from(comparisonEvidence)
		};
		await expect(
			reviews.create('unverified', {
				placeId: 'osm:node:1',
				body: 'Not eligible',
				serviceDate: '2026-08-01',
				locale: 'en',
				declarations,
				idempotencyKey: 'unverified-create'
			})
		).rejects.toThrow('verified');

		const created = await publish(reviews);
		expect(await publish(reviews)).toEqual(created);
		expect(await reviews.listPublic('osm:node:1', 'en')).toMatchObject([
			{ body: 'A concrete and useful account of the visit.', pseudonym: 'Taste Memory' }
		]);
		const edited = await reviews.edit('author', created.reviewId, {
			body: 'Edited plain text\r\nwith useful detail.',
			locale: 'en',
			declarations,
			idempotencyKey: 'edit-1',
			expectedVersion: 1
		});
		expect((await reviews.listPublic('osm:node:1'))[0]).toMatchObject({
			body: 'Edited plain text\nwith useful detail.',
			presentation: 'edited'
		});
		await expect(
			reviews.edit('author', created.reviewId, {
				body: 'Stale edit',
				locale: 'en',
				declarations,
				idempotencyKey: 'edit-stale',
				expectedVersion: 1
			})
		).rejects.toThrow('changed');
		const substituted = await reviews.substitute('author', created.reviewId, {
			body: 'A later visit replaces the public generation.',
			serviceDate: '2026-08-10',
			locale: 'en',
			declarations,
			idempotencyKey: 'substitute-1'
		});
		expect(substituted.publicationId).not.toBe(edited.publicationId);
		expect(await db.select().from(reviewPublication)).toHaveLength(2);
		expect(await db.select().from(reviewVersion)).toHaveLength(3);
		expect(await db.select().from(reviewDeclarationAcceptance)).toHaveLength(3);
		await expect(
			db
				.update(reviewVersion)
				.set({ body: 'tampered' })
				.where(eq(reviewVersion.id, substituted.versionId!))
		).rejects.toThrow();
		await reviews.withdraw('author', created.reviewId, 'withdraw-1');
		expect(await reviews.listPublic('osm:node:1')).toEqual([]);
		expect(await db.select().from(rankingList)).toEqual(before.lists);
		expect(await db.select().from(rankingRevision)).toEqual(before.revisions);
		expect(await db.select().from(comparisonEvidence)).toEqual(before.comparisons);
	});

	it('enforces one aggregate per author/place while keeping different places independent', async () => {
		const { reviews } = await setup();
		await publish(reviews);
		await expect(
			reviews.create('author', {
				placeId: 'osm:node:1',
				body: 'A duplicate aggregate.',
				serviceDate: '2026-08-02',
				locale: 'en',
				declarations,
				idempotencyKey: 'duplicate'
			})
		).rejects.toThrow('already exists');
		await publish(reviews, 'osm:node:2');
		expect(await reviews.listForAuthor('author')).toHaveLength(2);
	});

	it('paginates public reviews with an opaque stable cursor', async () => {
		const { reviews } = await setup();
		await publish(reviews, 'osm:node:1', 'author');
		await publish(reviews, 'osm:node:1', 'other');
		const first = await reviews.listPublicPage('osm:node:1', 'en', { limit: 1 });
		expect(first.items).toHaveLength(1);
		expect(first.nextCursor).toBeTruthy();
		const second = await reviews.listPublicPage('osm:node:1', 'en', {
			limit: 1,
			cursor: first.nextCursor
		});
		expect(second.items).toHaveLength(1);
		expect(second.items[0].reviewId).not.toBe(first.items[0].reviewId);
		expect(second.nextCursor).toBeUndefined();
	});
});

describe('notice, moderation, evidence, expiry, and erasure', () => {
	it('rejects a short notice explanation before persistence with a useful domain error', async () => {
		const { reviews } = await setup();
		const created = await publish(reviews);
		const moderation = new ReviewModerationService(db, 'test', evidence, clock);
		await expect(
			moderation.submitNotice({
				publicationId: created.publicationId!,
				versionId: created.versionId!,
				exactPublicUrl: 'https://example.test/places/1#review',
				kind: 'authenticity',
				allegedGround: 'Synthetic authenticity concern',
				explanation: 'fake review',
				notifierName: 'Owner',
				notifierEmail: 'owner@example.test',
				ownerOrDelegate: true,
				goodFaithAccepted: true,
				idempotencyKey: 'short-notice-explanation'
			})
		).rejects.toThrow('Notice explanation must be at least 20 characters');
		expect(await db.select().from(reviewNotice)).toEqual([]);
	});

	it('accepts the narrow anonymous notice branch without case access or owner priority', async () => {
		const { reviews } = await setup();
		const created = await publish(reviews);
		const moderation = new ReviewModerationService(db, 'test', evidence, clock);
		const notice = await moderation.submitNotice({
			publicationId: created.publicationId!,
			versionId: created.versionId!,
			exactPublicUrl: `https://example.test/places/1#review-${created.versionId}`,
			kind: 'alleged-illegality',
			allegedGround: 'Synthetic anonymous legal ground',
			explanation: 'A sufficiently detailed anonymous synthetic legal notice explanation.',
			notifierName: '',
			notifierEmail: '',
			anonymous: true,
			ownerOrDelegate: true,
			goodFaithAccepted: true,
			idempotencyKey: 'anonymous-notice'
		});
		expect(notice.caseToken).toBeUndefined();
		expect((await db.select().from(reviewNotice))[0]).toMatchObject({
			notifierName: 'anonymous',
			notifierEmail: '',
			ownerAssertion: 'none',
			priority: 0
		});
		const email = new LocalEmailProvider();
		const worker = new ReviewOutboxWorker(db, email, clock);
		expect(await worker.runBatch()).toBe(1);
		expect(email.outbox.map((message) => message.template)).toEqual(['review-author-notice:v1']);
		await moderation.bootstrapModerator({
			userId: 'moderator',
			environment: 'test',
			operatorReference: 'local-test',
			reason: 'synthetic anonymous notice decision'
		});
		await moderation.decide('moderator', {
			noticeId: notice.noticeId,
			outcome: 'no-action',
			scope: 'exact publication',
			ground: 'synthetic-policy-ground',
			reasonedExplanation: 'The anonymous synthetic notice does not support removal.',
			factsReliedOn: 'The notice and available synthetic case record.',
			automationDisclosure: 'No automation made the decision.'
		});
		expect(await worker.runBatch()).toBe(1);
		expect(email.outbox.map((message) => message.template)).toEqual([
			'review-author-notice:v1',
			'review-decision:v1'
		]);
		expect(
			(await db.select().from(reviewNotification)).filter(
				(item) => item.recipientRole === 'notifier' && item.purpose === 'review-decision'
			)
		).toEqual([]);
	});

	it('isolates terminal recipient failures and continues delivering the batch', async () => {
		await setup();
		await db.insert(transactionalOutbox).values([
			{
				id: 'a-invalid-recipient',
				purpose: 'review-decision',
				recipientReference: '',
				payload: { caseReference: 'anonymous-case' },
				idempotencyKey: 'invalid-recipient-job',
				availableAt: now,
				createdAt: now
			},
			{
				id: 'b-missing-recipient',
				purpose: 'review-decision',
				recipientReference: 'deleted-user',
				payload: { caseReference: 'erased-author-case' },
				idempotencyKey: 'missing-recipient-job',
				availableAt: now,
				createdAt: now
			},
			{
				id: 'c-valid-recipient',
				purpose: 'review-decision',
				recipientReference: 'valid@example.test',
				payload: { caseReference: 'valid-case' },
				idempotencyKey: 'valid-recipient-job',
				availableAt: now,
				createdAt: now
			}
		]);
		await db.insert(reviewNotification).values([
			{
				id: 'invalid-recipient-notification',
				recipientRole: 'notifier',
				purpose: 'review-decision',
				templateVersion: 'v1',
				outboxJobId: 'a-invalid-recipient',
				createdAt: now
			},
			{
				id: 'missing-recipient-notification',
				recipientRole: 'author',
				purpose: 'review-decision',
				templateVersion: 'v1',
				outboxJobId: 'b-missing-recipient',
				createdAt: now
			}
		]);
		const email = new LocalEmailProvider();
		const worker = new ReviewOutboxWorker(db, email, clock);
		expect(await worker.runBatch()).toBe(1);
		expect(email.outbox).toMatchObject([
			{ recipient: 'valid@example.test', template: 'review-decision:v1' }
		]);
		const jobs = await db.select().from(transactionalOutbox);
		expect(jobs.find((item) => item.id === 'a-invalid-recipient')).toMatchObject({
			attemptCount: 1,
			lastErrorCode: 'recipient-invalid',
			deliveredAt: null
		});
		expect(jobs.find((item) => item.id === 'b-missing-recipient')).toMatchObject({
			attemptCount: 1,
			lastErrorCode: 'recipient-not-found',
			deliveredAt: null
		});
		expect((await db.select().from(reviewNotification)).map((item) => item.state)).toEqual([
			'failed',
			'failed'
		]);
		expect(await worker.runBatch()).toBe(0);
		const terminalJobs = await db.select().from(transactionalOutbox);
		expect(terminalJobs.find((item) => item.id === 'a-invalid-recipient')?.attemptCount).toBe(1);
		expect(terminalJobs.find((item) => item.id === 'b-missing-recipient')?.attemptCount).toBe(1);
	});

	it('keeps reports non-dispositive, isolates party evidence, and supports human redress', async () => {
		const { reviews } = await setup();
		const created = await publish(reviews);
		const moderation = new ReviewModerationService(db, 'test', evidence, clock);
		await moderation.bootstrapModerator({
			userId: 'moderator',
			environment: 'test',
			operatorReference: 'local-test',
			reason: 'synthetic moderation test'
		});
		await moderation.bootstrapModerator({
			userId: 'admin',
			role: 'admin',
			environment: 'test',
			operatorReference: 'local-test',
			reason: 'synthetic review administration test'
		});
		await moderation.grantModerator('admin', 'other', 'review_moderator', 'temporary coverage');
		await moderation.revokeModerator('admin', 'other', 'review_moderator', 'coverage ended');
		expect(await db.select().from(reviewRoleEvent)).toHaveLength(4);
		expect(await moderation.getModeratorAssignmentContext('moderator')).toMatchObject({
			actorRole: 'review_moderator',
			assignableModerators: []
		});
		expect(
			(await moderation.getModeratorAssignmentContext('admin')).assignableModerators.map(
				(item) => item.userId
			)
		).toEqual(['admin', 'moderator']);
		const notice = await moderation.submitNotice({
			publicationId: created.publicationId!,
			versionId: created.versionId!,
			exactPublicUrl: `https://example.test/places/1#review-${created.versionId}`,
			kind: 'alleged-illegality',
			allegedGround: 'Synthetic alleged legal issue',
			explanation: 'A sufficiently detailed synthetic explanation for moderation.',
			notifierName: 'Notifier',
			notifierEmail: 'notifier@example.test',
			ownerOrDelegate: true,
			goodFaithAccepted: true,
			idempotencyKey: 'notice-1'
		});
		const email = new LocalEmailProvider();
		expect(await new ReviewOutboxWorker(db, email, clock).runBatch()).toBe(2);
		expect(email.outbox.map((message) => message.template).sort()).toEqual([
			'review-acknowledgement:v1',
			'review-author-notice:v1'
		]);
		const [storedNotice] = await db.select().from(reviewNotice);
		expect(storedNotice.submissionDeadline).toEqual(new Date('2026-08-29T10:00:00.000Z'));
		expect(storedNotice.decisionDueAt).toEqual(new Date('2026-09-14T10:00:00.000Z'));
		await moderation.requestNotifierCaseAccess({
			noticeId: notice.noticeId,
			email: 'notifier@example.test',
			caseActionUrl: (token) =>
				`https://example.test/reviews/cases/${notice.noticeId}?token=${encodeURIComponent(token)}`
		});
		expect(await new ReviewOutboxWorker(db, email, clock).runBatch()).toBe(1);
		const recoveredUrl = email.outbox.at(-1)?.variables.actionUrl;
		expect(email.outbox.at(-1)?.template).toBe('review-case-access:v1');
		expect(recoveredUrl).toBeTruthy();
		await expect(
			moderation.getCaseForNotifier(
				notice.noticeId,
				new URL(recoveredUrl!).searchParams.get('token')!
			)
		).resolves.toMatchObject({ id: notice.noticeId });
		const duplicateNotice = await moderation.submitNotice({
			publicationId: created.publicationId!,
			versionId: created.versionId!,
			exactPublicUrl: `https://example.test/places/1#review-${created.versionId}`,
			kind: 'alleged-illegality',
			allegedGround: 'Synthetic alleged legal issue',
			explanation: 'A sufficiently detailed synthetic explanation for moderation.',
			notifierName: 'Notifier',
			notifierEmail: 'notifier@example.test',
			ownerOrDelegate: true,
			goodFaithAccepted: true,
			idempotencyKey: 'notice-duplicate-browser-submit'
		});
		expect(duplicateNotice).toMatchObject({
			noticeId: notice.noticeId,
			duplicate: true
		});
		expect(duplicateNotice.caseToken).toBeTruthy();
		expect(await db.select().from(reviewNotice)).toHaveLength(1);
		expect(await new ReviewOutboxWorker(db, email, clock).runBatch()).toBe(0);
		expect((await reviews.listPublic('osm:node:1'))[0].presentation).toBe('disputed');
		await moderation.submitPartyStatement({
			noticeId: notice.noticeId,
			partyRole: 'notifier',
			statement: 'Notifier-only case statement.',
			idempotencyKey: 'notifier-statement',
			notifierToken: notice.caseToken
		});
		await moderation.submitPartyStatement({
			noticeId: notice.noticeId,
			partyRole: 'author',
			statement: 'Author-only response statement.',
			idempotencyKey: 'author-statement',
			authorUserId: 'author'
		});
		const authorObject = await moderation.uploadEvidence({
			noticeId: notice.noticeId,
			partyRole: 'author',
			authorUserId: 'author',
			bytes: new TextEncoder().encode('synthetic author evidence'),
			mediaType: 'text/plain',
			filename: 'author-evidence.txt',
			purpose: 'support the synthetic author response'
		});
		await moderation.markEvidenceScan('moderator', authorObject.id, true);
		expect((await moderation.getCaseForAuthor('author', notice.noticeId)).evidence).toMatchObject([
			{ id: authorObject.id, originalFilename: 'author-evidence.txt', scanState: 'clean' }
		]);
		await moderation.deleteEvidence({
			evidenceId: authorObject.id,
			partyRole: 'author',
			authorUserId: 'author'
		});
		expect((await moderation.getCaseForAuthor('author', notice.noticeId)).evidence).toEqual([]);
		expect(
			(await moderation.getCaseForAuthor('author', notice.noticeId)).submissions
		).toMatchObject([{ statement: 'Author-only response statement.' }]);
		const object = await moderation.uploadEvidence({
			noticeId: notice.noticeId,
			partyRole: 'notifier',
			bytes: new TextEncoder().encode('synthetic evidence'),
			mediaType: 'text/plain',
			filename: 'evidence.txt',
			purpose: 'support the synthetic notice',
			notifierToken: notice.caseToken
		});
		await moderation.markEvidenceScan('moderator', object.id, true);
		expect(await moderation.runEvidenceRetentionBatch()).toBe(0);
		expect(
			await moderation.readEvidenceFile({
				evidenceId: object.id,
				noticeId: notice.noticeId,
				actorType: 'review_moderator',
				actorReference: 'moderator'
			})
		).toMatchObject({ mediaType: 'text/plain', filename: 'evidence.txt' });
		await expect(
			moderation.readEvidenceFile({
				evidenceId: object.id,
				noticeId: 'a-different-case',
				actorType: 'review_moderator',
				actorReference: 'moderator'
			})
		).rejects.toThrow('Evidence object was not found');
		await expect(
			moderation.readEvidence({
				evidenceId: object.id,
				actorType: 'author',
				actorReference: 'author'
			})
		).rejects.toThrow("other party's evidence");
		expect(
			new TextDecoder().decode(
				await moderation.readEvidence({
					evidenceId: object.id,
					actorType: 'notifier',
					actorReference: 'notifier@example.test',
					notifierToken: notice.caseToken
				})
			)
		).toBe('synthetic evidence');
		expect(
			(await moderation.getCaseForNotifier(notice.noticeId, notice.caseToken!)).evidence
		).toMatchObject([{ id: object.id, originalFilename: 'evidence.txt', scanState: 'clean' }]);
		await expect(moderation.assign('moderator', notice.noticeId, 'admin')).rejects.toThrow(
			'administrator permission'
		);
		await moderation.assign('admin', notice.noticeId, 'moderator');
		expect(
			(await moderation.listModeratorQueue('moderator')).find((item) => item.id === notice.noticeId)
		).toMatchObject({ assignedToActor: true, assignedModeratorEmail: 'moderator@example.test' });
		await moderation.grantModerator('admin', 'other', 'review_moderator', 'absence coverage');
		await moderation.assign('admin', notice.noticeId, 'other');
		expect(
			(await moderation.getCaseForModerator('admin', notice.noticeId)).assignedModeratorId
		).toBe('other');
		await moderation.assign('admin', notice.noticeId, 'moderator');
		expect(
			(await db.select().from(reviewModerationEvent)).filter((event) =>
				['case-assigned', 'case-reassigned'].includes(event.action)
			)
		).toHaveLength(3);
		await expect(
			moderation.verifyOwnerAssertion('moderator', notice.noticeId, true, 'synthetic-authority')
		).resolves.toEqual({ verified: true });
		await moderation.setInterimRestriction('moderator', notice.noticeId, 'documented-risk');
		expect(await reviews.listPublic('osm:node:1')).toEqual([]);
		await moderation.clearInterimRestriction('moderator', notice.noticeId, 'risk-resolved');
		expect(await reviews.listPublic('osm:node:1')).toHaveLength(1);
		await moderation.setInterimRestriction('moderator', notice.noticeId, 'documented-risk');
		const removed = await moderation.decide('moderator', {
			noticeId: notice.noticeId,
			outcome: 'remove',
			scope: 'exact publication',
			ground: 'synthetic-policy-ground',
			reasonedExplanation: 'The synthetic facts support removal under the test policy.',
			factsReliedOn: 'The notice, author response, and clean synthetic evidence.',
			automationDisclosure: 'Automation only routed and scanned the file.'
		});
		const redress = await moderation.requestRedress({
			noticeId: notice.noticeId,
			decisionId: removed.decisionId,
			partyRole: 'author',
			statement: 'Please reconsider the synthetic decision and restore the review.',
			idempotencyKey: 'redress-1',
			authorUserId: 'author'
		});
		expect(redress).toMatchObject({
			noticeId: notice.noticeId,
			status: 'submitted',
			decisionDueAt: new Date('2026-09-14T10:00:00.000Z')
		});
		await expect(
			moderation.requestRedress({
				noticeId: notice.noticeId,
				decisionId: removed.decisionId,
				partyRole: 'author',
				statement: 'A concurrent duplicate reconsideration request.',
				idempotencyKey: 'redress-concurrent-tab',
				authorUserId: 'author'
			})
		).rejects.toThrow('already requested');
		expect(await moderation.getCaseForAuthor('author', notice.noticeId)).toMatchObject({
			decisions: [
				{
					id: removed.decisionId,
					scope: 'exact publication',
					ground: 'synthetic-policy-ground',
					factsReliedOn: 'The notice, author response, and clean synthetic evidence.',
					automationDisclosure: 'Automation only routed and scanned the file.',
					redressOpen: false,
					redressSubmissionDeadline: new Date('2026-09-14T10:00:00.000Z')
				}
			]
		});
		await moderation.decide('moderator', {
			noticeId: notice.noticeId,
			outcome: 'restore',
			scope: 'exact publication',
			ground: 'synthetic-reconsideration',
			reasonedExplanation: 'Reconsideration supports reinstatement on the synthetic facts.',
			factsReliedOn: 'The redress statement corrected the material synthetic fact.',
			automationDisclosure: 'No automation made the decision.'
		});
		expect(await reviews.listPublic('osm:node:1')).toHaveLength(1);
		expect(await db.select().from(reviewModerationDecision)).toHaveLength(2);
		expect(await db.select().from(reviewRedressRequest)).toHaveLength(1);
		await expect(moderation.closeCase('moderator', notice.noticeId)).resolves.toMatchObject({
			closedAt: now
		});
		now = new Date('2026-11-14T10:00:00.000Z');
		expect(await moderation.runEvidenceRetentionBatch()).toBe(1);
		await expect(
			db.delete(reviewModerationEvent).where(eq(reviewModerationEvent.noticeId, notice.noticeId))
		).rejects.toThrow();
	});

	it('enforces query-time expiry and retains only held content during account erasure', async () => {
		const { reviews } = await setup();
		const created = await publish(reviews);
		const moderation = new ReviewModerationService(db, 'test', evidence, clock);
		const notice = await moderation.submitNotice({
			publicationId: created.publicationId!,
			versionId: created.versionId!,
			exactPublicUrl: 'https://example.test/places/1#review',
			kind: 'authenticity',
			allegedGround: 'Synthetic authenticity question',
			explanation: 'A sufficiently detailed synthetic authenticity explanation.',
			notifierName: 'Notifier',
			notifierEmail: 'hold@example.test',
			ownerOrDelegate: false,
			goodFaithAccepted: true,
			idempotencyKey: 'hold-notice'
		});
		expect(notice.caseToken).toBeTruthy();
		const privacy = new ReviewPrivacyService(db, clock);
		const erased = await privacy.eraseAccount('author');
		expect(erased.heldReviewIds).toEqual([created.reviewId]);
		expect(await db.select().from(user).where(eq(user.id, 'author'))).toEqual([]);
		expect((await db.select().from(placeReview))[0].authorId).toBeNull();
		expect((await db.select().from(reviewVersion))[0].body).not.toBe('[erased]');
		expect(await db.select().from(reviewRetentionHold)).toHaveLength(1);
		now = new Date('2027-02-12T10:00:00.000Z');
		expect(await privacy.releaseExpiredHolds()).toBe(1);
		expect((await db.select().from(reviewVersion))[0]).toMatchObject({
			body: '[erased]',
			pseudonymSnapshot: 'Erased author'
		});

		const fresh = new ReviewService(db, 'test', clock);
		await fresh.setPseudonym('other', 'Other Guest');
		const otherReview = await fresh.create('other', {
			placeId: 'osm:node:2',
			body: 'A review used to test time expiry.',
			serviceDate: '2027-02-01',
			locale: 'en',
			declarations,
			idempotencyKey: 'other-expiry'
		});
		now = new Date('2029-02-13T10:00:00.000Z');
		expect(await fresh.listPublic('osm:node:2')).toEqual([]);
		expect(await moderation.runExpiryBatch()).toBe(1);
		expect(
			(await db.select().from(reviewPublication)).find(
				(item) => item.id === otherReview.publicationId
			)
		).toMatchObject({ lifecycle: 'expired' });
	});
});

describe('catalogue redirect impact', () => {
	it('restricts same-author canonical collisions non-destructively and reverses them', async () => {
		const { reviews } = await setup();
		await publish(reviews, 'osm:node:1');
		await publish(reviews, 'osm:node:2');
		const governance = new CatalogueGovernanceService(db, 'test', clock);
		await governance.bootstrapRole({
			targetUserId: 'admin',
			role: 'admin',
			environment: 'test',
			operatorReference: 'local-test',
			reason: 'synthetic merge test'
		});
		const merge = await governance.mergePlaces('admin', {
			sourcePlaceId: 'osm:node:1',
			canonicalPlaceId: 'osm:node:2',
			reasonCategory: 'synthetic-duplicate',
			evidenceReference: 'fixture://duplicate'
		});
		expect(merge.reviewCollisions).toBe(1);
		expect(await reviews.listPublic('osm:node:2')).toEqual([]);
		expect(await db.select().from(reviewCatalogueConflict)).toMatchObject([{ status: 'open' }]);
		expect(await db.select().from(reviewVersion)).toHaveLength(2);
		await governance.reverseMerge('admin', merge.redirectId, 'not duplicates');
		expect(await reviews.listPublic('osm:node:1')).toHaveLength(1);
		expect(await reviews.listPublic('osm:node:2')).toHaveLength(1);
		expect(await db.select().from(reviewCatalogueConflict)).toMatchObject([{ status: 'reversed' }]);
	});
});
