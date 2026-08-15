import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import {
	assertServiceDateEligible,
	deriveExpiresAt,
	derivePublicPresentation,
	normalizeReviewBody,
	publicServiceMonth,
	requireDeclarations,
	type ReviewClockPolicy,
	type ReviewDeclarations,
	provisionalReviewClockPolicy
} from '$lib/domain/reviews/policy';
import type { AppEnvironment } from '$lib/server/config/environment';
import type { Database } from '$lib/server/db';
import {
	cataloguePlaceRedirect,
	effectivePlace,
	placeReview,
	publicProfile,
	reviewDeclarationAcceptance,
	reviewDeclarationPolicy,
	reviewMutationReceipt,
	reviewNotice,
	reviewPolicyVersion,
	reviewPublication,
	reviewVersion,
	user
} from '$lib/server/db/schema';
import { ConflictError, DomainValidationError, NotFoundError } from '$lib/server/domain/errors';
import {
	MemoryFixedWindowRateLimiter,
	reviewRateLimitPolicies,
	type RateLimiter
} from '$lib/server/security/rate-limit';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type ReviewDatabase = Database | Transaction;

export interface ReviewPublicationInput {
	placeId: string;
	body: string;
	serviceDate: string;
	locale: 'en' | 'it';
	declarations: ReviewDeclarations;
	idempotencyKey: string;
}

interface PolicyConfiguration extends ReviewClockPolicy {
	publicServiceDatePrecision: 'month';
}

const defaultPolicyConfiguration: PolicyConfiguration = {
	...provisionalReviewClockPolicy,
	publicServiceDatePrecision: 'month'
};

export function normalizePseudonym(value: string): { display: string; key: string } {
	const display = value.normalize('NFC').replace(/\s+/g, ' ').trim();
	if (display.length < 3 || display.length > 40) {
		throw new DomainValidationError('Pseudonym must contain 3 to 40 characters');
	}
	if (!/^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u.test(display)) {
		throw new DomainValidationError('Pseudonym contains unsupported characters');
	}
	const key = display.toLocaleLowerCase('it-IT');
	if (/^(admin|administrator|moderator|gustimei|support)$/i.test(key)) {
		throw new DomainValidationError('Pseudonym is reserved');
	}
	return { display, key };
}

function hash(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

function requiredKey(value: string): string {
	const normalized = value.trim();
	if (!normalized || normalized.length > 200) {
		throw new DomainValidationError('A valid idempotency key is required');
	}
	return normalized;
}

export class ReviewService {
	constructor(
		private readonly database: Database,
		private readonly environment: AppEnvironment,
		private readonly clock: () => Date = () => new Date(),
		private readonly id: () => string = randomUUID,
		private readonly limiter: RateLimiter = new MemoryFixedWindowRateLimiter(clock)
	) {}

	async installPolicy(input: {
		version: string;
		body: string;
		declarations: Record<'en' | 'it', Record<string, string>>;
		effectiveFrom?: Date;
		legalReviewStatus?: 'draft' | 'approved';
		configuration?: Partial<PolicyConfiguration>;
	}) {
		const now = this.clock();
		return this.database.transaction(async (transaction) => {
			const policyId = this.id();
			await transaction.insert(reviewPolicyVersion).values({
				id: policyId,
				version: input.version,
				bodyHash: hash(input.body),
				configuration: { ...defaultPolicyConfiguration, ...input.configuration },
				effectiveFrom: input.effectiveFrom ?? now,
				legalReviewStatus: input.legalReviewStatus ?? 'draft',
				createdAt: now
			});
			for (const locale of ['en', 'it'] as const) {
				const content = input.declarations[locale];
				await transaction.insert(reviewDeclarationPolicy).values({
					id: this.id(),
					policyVersionId: policyId,
					locale,
					content,
					contentHash: hash(JSON.stringify(content)),
					createdAt: now
				});
			}
			return { id: policyId };
		});
	}

	async setPseudonym(authorId: string, value: string) {
		await this.requireVerifiedUser(authorId);
		const normalized = normalizePseudonym(value);
		const now = this.clock();
		const [record] = await this.database
			.insert(publicProfile)
			.values({
				userId: authorId,
				pseudonym: normalized.display,
				normalizedPseudonym: normalized.key,
				createdAt: now,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: publicProfile.userId,
				set: {
					pseudonym: normalized.display,
					normalizedPseudonym: normalized.key,
					lifecycle: 'active',
					updatedAt: now
				}
			})
			.returning();
		return record;
	}

	async create(authorId: string, input: ReviewPublicationInput) {
		await this.consumeAuthorLimit(authorId);
		const key = requiredKey(input.idempotencyKey);
		const now = this.clock();
		const body = normalizeReviewBody(input.body);
		const declarations = requireDeclarations(input.declarations);
		return this.database.transaction(async (transaction) => {
			const existing = await this.receipt(transaction, authorId, key);
			if (existing) return existing;
			await this.requireVerifiedUser(authorId, transaction);
			await this.requireReviewablePlace(input.placeId, transaction);
			const profile = await this.requireProfile(authorId, transaction);
			const policy = await this.currentPolicy(input.locale, now, transaction);
			const configuration = policy.configuration as unknown as PolicyConfiguration;
			const serviceDate = assertServiceDateEligible(input.serviceDate, now, configuration);
			const existingReview = await transaction
				.select({ id: placeReview.id })
				.from(placeReview)
				.where(and(eq(placeReview.authorId, authorId), eq(placeReview.placeId, input.placeId)))
				.limit(1);
			if (existingReview[0])
				throw new ConflictError('A review aggregate already exists for this place');
			const reviewId = this.id();
			const publicationId = this.id();
			const versionId = this.id();
			const acceptanceId = this.id();
			await transaction.insert(placeReview).values({
				id: reviewId,
				authorId,
				placeId: input.placeId,
				currentPublicationId: publicationId,
				createdAt: now,
				updatedAt: now
			});
			await transaction.insert(reviewPublication).values({
				id: publicationId,
				reviewId,
				generation: 1,
				serviceDate,
				lifecycle: 'published',
				publishedAt: now,
				expiresAt: deriveExpiresAt(now, configuration),
				currentVersionId: versionId,
				policyVersionId: policy.policyVersionId,
				createdAt: now
			});
			await this.insertVersion(transaction, {
				authorId,
				publicationId,
				versionId,
				acceptanceId,
				declarationPolicyId: policy.declarationPolicyId,
				serviceDate,
				locale: input.locale,
				declarations,
				body,
				pseudonym: profile.pseudonym,
				changeKind: 'initial',
				version: 1,
				now
			});
			return this.insertReceipt(transaction, {
				authorId,
				key,
				operation: 'create',
				reviewId,
				publicationId,
				versionId,
				now
			});
		});
	}

	async edit(
		authorId: string,
		reviewId: string,
		input: Omit<ReviewPublicationInput, 'placeId' | 'serviceDate'> & {
			expectedVersion: number;
		}
	) {
		await this.consumeAuthorLimit(authorId);
		const key = requiredKey(input.idempotencyKey);
		const now = this.clock();
		const body = normalizeReviewBody(input.body);
		const declarations = requireDeclarations(input.declarations);
		return this.database.transaction(async (transaction) => {
			const existing = await this.receipt(transaction, authorId, key);
			if (existing) return existing;
			await this.requireVerifiedUser(authorId, transaction);
			const current = await this.currentAuthorReview(transaction, authorId, reviewId);
			if (current.lifecycle !== 'published')
				throw new ConflictError('Only a published review can be edited');
			if (current.version !== input.expectedVersion)
				throw new ConflictError('Review version has changed');
			const profile = await this.requireProfile(authorId, transaction);
			const policy = await this.currentPolicy(input.locale, now, transaction);
			const configuration = policy.configuration as unknown as PolicyConfiguration;
			assertServiceDateEligible(current.serviceDate, now, configuration);
			const versionId = this.id();
			await this.insertVersion(transaction, {
				authorId,
				publicationId: current.publicationId,
				versionId,
				acceptanceId: this.id(),
				declarationPolicyId: policy.declarationPolicyId,
				serviceDate: current.serviceDate,
				locale: input.locale,
				declarations,
				body,
				pseudonym: profile.pseudonym,
				changeKind: 'edit',
				version: current.version + 1,
				now
			});
			await transaction
				.update(reviewPublication)
				.set({ currentVersionId: versionId, editedAt: now })
				.where(eq(reviewPublication.id, current.publicationId));
			await transaction
				.update(placeReview)
				.set({ updatedAt: now })
				.where(eq(placeReview.id, reviewId));
			return this.insertReceipt(transaction, {
				authorId,
				key,
				operation: 'edit',
				reviewId,
				publicationId: current.publicationId,
				versionId,
				now
			});
		});
	}

	async substitute(
		authorId: string,
		reviewId: string,
		input: Omit<ReviewPublicationInput, 'placeId'>
	) {
		await this.consumeAuthorLimit(authorId);
		const key = requiredKey(input.idempotencyKey);
		const now = this.clock();
		const body = normalizeReviewBody(input.body);
		const declarations = requireDeclarations(input.declarations);
		return this.database.transaction(async (transaction) => {
			const existing = await this.receipt(transaction, authorId, key);
			if (existing) return existing;
			await this.requireVerifiedUser(authorId, transaction);
			const current = await this.currentAuthorReview(transaction, authorId, reviewId);
			await this.requireReviewablePlace(current.placeId, transaction);
			const profile = await this.requireProfile(authorId, transaction);
			const policy = await this.currentPolicy(input.locale, now, transaction);
			const configuration = policy.configuration as unknown as PolicyConfiguration;
			const serviceDate = assertServiceDateEligible(input.serviceDate, now, configuration);
			const publicationId = this.id();
			const versionId = this.id();
			await transaction
				.update(reviewPublication)
				.set({ lifecycle: 'superseded', supersededAt: now })
				.where(eq(reviewPublication.id, current.publicationId));
			await transaction.insert(reviewPublication).values({
				id: publicationId,
				reviewId,
				generation: current.generation + 1,
				serviceDate,
				lifecycle: 'published',
				publishedAt: now,
				expiresAt: deriveExpiresAt(now, configuration),
				currentVersionId: versionId,
				policyVersionId: policy.policyVersionId,
				createdAt: now
			});
			await this.insertVersion(transaction, {
				authorId,
				publicationId,
				versionId,
				acceptanceId: this.id(),
				declarationPolicyId: policy.declarationPolicyId,
				serviceDate,
				locale: input.locale,
				declarations,
				body,
				pseudonym: profile.pseudonym,
				changeKind: 'substitution',
				version: 1,
				now
			});
			await transaction
				.update(placeReview)
				.set({ currentPublicationId: publicationId, updatedAt: now })
				.where(eq(placeReview.id, reviewId));
			return this.insertReceipt(transaction, {
				authorId,
				key,
				operation: 'substitute',
				reviewId,
				publicationId,
				versionId,
				now
			});
		});
	}

	async withdraw(authorId: string, reviewId: string, idempotencyKey: string) {
		await this.consumeAuthorLimit(authorId);
		const key = requiredKey(idempotencyKey);
		const now = this.clock();
		return this.database.transaction(async (transaction) => {
			const existing = await this.receipt(transaction, authorId, key);
			if (existing) return existing;
			const current = await this.currentAuthorReview(transaction, authorId, reviewId);
			if (current.lifecycle !== 'published') throw new ConflictError('Review is not published');
			await transaction
				.update(reviewPublication)
				.set({ lifecycle: 'withdrawn', withdrawnAt: now, visibilityReason: 'author-withdrawal' })
				.where(eq(reviewPublication.id, current.publicationId));
			await transaction
				.update(placeReview)
				.set({ updatedAt: now })
				.where(eq(placeReview.id, reviewId));
			return this.insertReceipt(transaction, {
				authorId,
				key,
				operation: 'withdraw',
				reviewId,
				publicationId: current.publicationId,
				versionId: current.versionId,
				now
			});
		});
	}

	async listForAuthor(authorId: string) {
		return this.database
			.select()
			.from(placeReview)
			.where(eq(placeReview.authorId, authorId))
			.orderBy(desc(placeReview.updatedAt), desc(placeReview.id));
	}

	async listPublic(placeId: string, locale: 'en' | 'it' = 'it') {
		const now = this.clock();
		const canonicalPlaceId = await this.resolveCanonicalPlace(placeId);
		const [effective] = await this.database
			.select()
			.from(effectivePlace)
			.where(eq(effectivePlace.placeId, canonicalPlaceId));
		if (!effective || effective.status !== 'active') return [];
		const targetIds = await this.redirectSources(canonicalPlaceId);
		const rows = await this.database
			.select({
				reviewId: placeReview.id,
				originalPlaceId: placeReview.placeId,
				collisionRestrictedAt: placeReview.collisionRestrictedAt,
				publicationId: reviewPublication.id,
				lifecycle: reviewPublication.lifecycle,
				serviceDate: reviewPublication.serviceDate,
				publishedAt: reviewPublication.publishedAt,
				expiresAt: reviewPublication.expiresAt,
				editedAt: reviewPublication.editedAt,
				interimRestrictedAt: reviewPublication.interimRestrictedAt,
				versionId: reviewVersion.id,
				body: reviewVersion.body,
				pseudonym: reviewVersion.pseudonymSnapshot
			})
			.from(placeReview)
			.innerJoin(reviewPublication, eq(reviewPublication.id, placeReview.currentPublicationId))
			.innerJoin(reviewVersion, eq(reviewVersion.id, reviewPublication.currentVersionId))
			.where(inArray(placeReview.placeId, targetIds))
			.orderBy(desc(reviewPublication.publishedAt), desc(reviewPublication.id));
		const openNotices = await this.database
			.select({ publicationId: reviewNotice.publicationId, count: sql<number>`count(*)::int` })
			.from(reviewNotice)
			.where(
				and(
					inArray(
						reviewNotice.publicationId,
						rows.map((row) => row.publicationId)
					),
					inArray(reviewNotice.status, ['received', 'awaiting-submissions', 'under-review'])
				)
			)
			.groupBy(reviewNotice.publicationId);
		const noticeCounts = new Map(openNotices.map((item) => [item.publicationId, item.count]));
		return rows.flatMap((row) => {
			const visibility = derivePublicPresentation({
				lifecycle: row.lifecycle,
				expiresAt: row.expiresAt,
				now,
				editedAt: row.editedAt,
				interimRestrictedAt: row.interimRestrictedAt,
				openNoticeCount: noticeCounts.get(row.publicationId),
				placeIsPublic: true,
				collisionRestrictedAt: row.collisionRestrictedAt
			});
			return visibility.publiclyVisible
				? [{ ...row, ...visibility, serviceMonth: publicServiceMonth(row.serviceDate, locale) }]
				: [];
		});
	}

	private async consumeAuthorLimit(authorId: string) {
		const result = await this.limiter.consume({
			purpose: 'review-author-mutation',
			key: `${this.environment}:${authorId}`,
			policy: reviewRateLimitPolicies['review-author-mutation']
		});
		if (!result.allowed) throw new ConflictError('Too many review changes; try again later');
	}

	private async requireVerifiedUser(authorId: string, database: ReviewDatabase = this.database) {
		const [record] = await database.select().from(user).where(eq(user.id, authorId)).limit(1);
		if (!record) throw new NotFoundError('User was not found');
		if (!record.emailVerified) throw new ConflictError('A verified account is required');
		return record;
	}

	private async requireProfile(authorId: string, database: ReviewDatabase) {
		const [record] = await database
			.select()
			.from(publicProfile)
			.where(and(eq(publicProfile.userId, authorId), eq(publicProfile.lifecycle, 'active')))
			.limit(1);
		if (!record) throw new ConflictError('A public pseudonym is required');
		return record;
	}

	private async requireReviewablePlace(placeId: string, database: ReviewDatabase) {
		const [record] = await database
			.select()
			.from(effectivePlace)
			.where(and(eq(effectivePlace.placeId, placeId), eq(effectivePlace.status, 'active')))
			.limit(1);
		if (!record) throw new ConflictError('The place cannot accept reviews');
		const [redirect] = await database
			.select({ id: cataloguePlaceRedirect.id })
			.from(cataloguePlaceRedirect)
			.where(
				and(
					eq(cataloguePlaceRedirect.sourcePlaceId, placeId),
					isNull(cataloguePlaceRedirect.reversedAt)
				)
			)
			.limit(1);
		if (redirect) throw new ConflictError('Reviews must target the canonical place');
		return record;
	}

	private async currentPolicy(locale: 'en' | 'it', now: Date, database: ReviewDatabase) {
		const [record] = await database
			.select({
				policyVersionId: reviewPolicyVersion.id,
				configuration: reviewPolicyVersion.configuration,
				declarationPolicyId: reviewDeclarationPolicy.id
			})
			.from(reviewPolicyVersion)
			.innerJoin(
				reviewDeclarationPolicy,
				and(
					eq(reviewDeclarationPolicy.policyVersionId, reviewPolicyVersion.id),
					eq(reviewDeclarationPolicy.locale, locale)
				)
			)
			.where(
				and(
					eq(reviewPolicyVersion.legalReviewStatus, 'approved'),
					lte(reviewPolicyVersion.effectiveFrom, now),
					or(isNull(reviewPolicyVersion.effectiveTo), gt(reviewPolicyVersion.effectiveTo, now))
				)
			)
			.orderBy(desc(reviewPolicyVersion.effectiveFrom))
			.limit(1);
		if (!record) throw new ConflictError('No approved review policy is active');
		return record;
	}

	private async currentAuthorReview(database: ReviewDatabase, authorId: string, reviewId: string) {
		const [record] = await database
			.select({
				reviewId: placeReview.id,
				placeId: placeReview.placeId,
				publicationId: reviewPublication.id,
				generation: reviewPublication.generation,
				serviceDate: reviewPublication.serviceDate,
				lifecycle: reviewPublication.lifecycle,
				versionId: reviewVersion.id,
				version: reviewVersion.version
			})
			.from(placeReview)
			.innerJoin(reviewPublication, eq(reviewPublication.id, placeReview.currentPublicationId))
			.innerJoin(reviewVersion, eq(reviewVersion.id, reviewPublication.currentVersionId))
			.where(and(eq(placeReview.id, reviewId), eq(placeReview.authorId, authorId)))
			.limit(1);
		if (!record) throw new NotFoundError('Review was not found');
		return record;
	}

	private async insertVersion(
		database: ReviewDatabase,
		input: {
			authorId: string;
			publicationId: string;
			versionId: string;
			acceptanceId: string;
			declarationPolicyId: string;
			serviceDate: string;
			locale: 'en' | 'it';
			declarations: ReviewDeclarations;
			body: string;
			pseudonym: string;
			changeKind: 'initial' | 'edit' | 'substitution';
			version: number;
			now: Date;
		}
	) {
		await database.insert(reviewDeclarationAcceptance).values({
			id: input.acceptanceId,
			declarationPolicyId: input.declarationPolicyId,
			authorId: input.authorId,
			serviceDate: input.serviceDate,
			...input.declarations,
			locale: input.locale,
			acceptedAt: input.now
		});
		await database.insert(reviewVersion).values({
			id: input.versionId,
			publicationId: input.publicationId,
			version: input.version,
			body: input.body,
			pseudonymSnapshot: input.pseudonym,
			declarationAcceptanceId: input.acceptanceId,
			changeKind: input.changeKind,
			createdAt: input.now
		});
	}

	private async receipt(database: ReviewDatabase, authorId: string, key: string) {
		const [record] = await database
			.select()
			.from(reviewMutationReceipt)
			.where(
				and(
					eq(reviewMutationReceipt.authorId, authorId),
					eq(reviewMutationReceipt.idempotencyKey, key)
				)
			)
			.limit(1);
		return record;
	}

	private async insertReceipt(
		database: ReviewDatabase,
		input: {
			authorId: string;
			key: string;
			operation: string;
			reviewId: string;
			publicationId?: string;
			versionId?: string;
			now: Date;
		}
	) {
		const [record] = await database
			.insert(reviewMutationReceipt)
			.values({
				id: this.id(),
				authorId: input.authorId,
				idempotencyKey: input.key,
				operation: input.operation,
				reviewId: input.reviewId,
				publicationId: input.publicationId,
				versionId: input.versionId,
				createdAt: input.now
			})
			.returning();
		return record;
	}

	private async resolveCanonicalPlace(placeId: string): Promise<string> {
		let current = placeId;
		const seen = new Set<string>();
		while (!seen.has(current)) {
			seen.add(current);
			const [redirect] = await this.database
				.select({ canonicalPlaceId: cataloguePlaceRedirect.canonicalPlaceId })
				.from(cataloguePlaceRedirect)
				.where(
					and(
						eq(cataloguePlaceRedirect.sourcePlaceId, current),
						isNull(cataloguePlaceRedirect.reversedAt)
					)
				)
				.limit(1);
			if (!redirect) return current;
			current = redirect.canonicalPlaceId;
		}
		throw new ConflictError('Catalogue redirect cycle detected');
	}

	private async redirectSources(canonicalPlaceId: string): Promise<string[]> {
		const redirects = await this.database
			.select({
				source: cataloguePlaceRedirect.sourcePlaceId,
				target: cataloguePlaceRedirect.canonicalPlaceId
			})
			.from(cataloguePlaceRedirect)
			.where(isNull(cataloguePlaceRedirect.reversedAt));
		const result = new Set([canonicalPlaceId]);
		let changed = true;
		while (changed) {
			changed = false;
			for (const redirect of redirects) {
				if (result.has(redirect.target) && !result.has(redirect.source)) {
					result.add(redirect.source);
					changed = true;
				}
			}
		}
		return [...result];
	}
}
