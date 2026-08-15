import { createHash, randomUUID } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import {
	contributionDisclosure,
	legalContent,
	policyVersions,
	type ProductLocale
} from '$lib/content/policies';
import type { Database } from '$lib/server/db';
import {
	accountPreference,
	documentVersion,
	privacyRequest,
	pseudonymChange,
	pseudonymReservation,
	publicProfile,
	registrationAttestation
} from '$lib/server/db/schema';
import { user } from '$lib/server/db/schema';
import { ConflictError, NotFoundError } from '$lib/server/domain/errors';
import { normalizePseudonym } from '$lib/domain/reviews/public-profile';

const DAY_MS = 86_400_000;
const CHANGE_COOLDOWN_DAYS = 30;
const RESERVATION_DAYS = 180;

function hash(value: string) {
	return createHash('sha256').update(value).digest('hex');
}

export class AccountService {
	constructor(
		private readonly database: Database,
		private readonly clock: () => Date = () => new Date(),
		private readonly id: () => string = randomUUID
	) {}

	async recordRegistration(userId: string, locale: ProductLocale) {
		const now = this.clock();
		await this.ensureDocuments(locale, now);
		await this.database.transaction(async (transaction) => {
			await transaction
				.insert(accountPreference)
				.values({ userId, locale, createdAt: now, updatedAt: now })
				.onConflictDoNothing();
			await transaction
				.insert(registrationAttestation)
				.values({
					id: this.id(),
					userId,
					locale,
					termsVersion: policyVersions.terms,
					ageDeclarationVersion: policyVersions.ageDeclaration,
					privacyNoticeVersion: policyVersions.privacyNotice,
					contributionDisclosureVersion: policyVersions.contributionDisclosure,
					createdAt: now
				})
				.onConflictDoNothing();
		});
	}

	async getAccountProjection(userId: string) {
		const [preference] = await this.database
			.select()
			.from(accountPreference)
			.where(eq(accountPreference.userId, userId))
			.limit(1);
		const [profile] = await this.database
			.select()
			.from(publicProfile)
			.where(eq(publicProfile.userId, userId))
			.limit(1);
		return { preference, publicProfile: profile };
	}

	async setLocale(userId: string, locale: ProductLocale) {
		const now = this.clock();
		await this.database
			.insert(accountPreference)
			.values({ userId, locale, createdAt: now, updatedAt: now })
			.onConflictDoUpdate({ target: accountPreference.userId, set: { locale, updatedAt: now } });
	}

	async setPseudonym(userId: string, value: string) {
		const normalized = normalizePseudonym(value);
		const now = this.clock();
		return this.database.transaction(async (transaction) => {
			const [account] = await transaction
				.select({ emailVerified: user.emailVerified })
				.from(user)
				.where(eq(user.id, userId))
				.limit(1);
			if (!account) throw new NotFoundError('User was not found');
			if (!account.emailVerified) throw new ConflictError('A verified account is required');
			const [current] = await transaction
				.select()
				.from(publicProfile)
				.where(eq(publicProfile.userId, userId))
				.limit(1);
			if (current?.normalizedPseudonym === normalized.key) return current;
			if (
				current &&
				now.getTime() < current.lastChangedAt.getTime() + CHANGE_COOLDOWN_DAYS * DAY_MS
			) {
				throw new ConflictError('Public pseudonyms can be changed once every 30 days');
			}
			const [reserved] = await transaction
				.select({ ownerId: pseudonymReservation.ownerId })
				.from(pseudonymReservation)
				.where(
					and(
						eq(pseudonymReservation.normalizedPseudonym, normalized.key),
						gt(pseudonymReservation.reservedUntil, now)
					)
				)
				.limit(1);
			if (reserved && reserved.ownerId !== userId) {
				throw new ConflictError('That public pseudonym is unavailable');
			}
			if (current) {
				await transaction
					.insert(pseudonymReservation)
					.values({
						normalizedPseudonym: current.normalizedPseudonym,
						ownerId: userId,
						reservedUntil: new Date(now.getTime() + RESERVATION_DAYS * DAY_MS),
						createdAt: now
					})
					.onConflictDoUpdate({
						target: [pseudonymReservation.normalizedPseudonym, pseudonymReservation.ownerId],
						set: { reservedUntil: new Date(now.getTime() + RESERVATION_DAYS * DAY_MS) }
					});
			}
			const [record] = await transaction
				.insert(publicProfile)
				.values({
					userId,
					pseudonym: normalized.display,
					normalizedPseudonym: normalized.key,
					createdAt: now,
					updatedAt: now,
					lastChangedAt: now
				})
				.onConflictDoUpdate({
					target: publicProfile.userId,
					set: {
						pseudonym: normalized.display,
						normalizedPseudonym: normalized.key,
						lifecycle: 'active',
						updatedAt: now,
						lastChangedAt: now
					}
				})
				.returning();
			await transaction.insert(pseudonymChange).values({
				id: this.id(),
				userId,
				previousNormalizedPseudonym: current?.normalizedPseudonym,
				newNormalizedPseudonym: normalized.key,
				createdAt: now
			});
			return record;
		});
	}

	async beginPrivacyRequest(input: {
		userId: string;
		type: typeof privacyRequest.$inferInsert.type;
		scope: string;
		operatorReference: string;
	}) {
		const [record] = await this.database
			.insert(privacyRequest)
			.values({
				id: this.id(),
				userId: input.userId,
				requesterReference: hash(input.userId),
				type: input.type,
				scope: input.scope,
				operatorReference: input.operatorReference,
				createdAt: this.clock()
			})
			.returning();
		return record;
	}

	private async ensureDocuments(locale: ProductLocale, now: Date) {
		const values = [
			['terms', policyVersions.terms, JSON.stringify(legalContent[locale].terms)],
			[
				'privacy-notice',
				policyVersions.privacyNotice,
				JSON.stringify(legalContent[locale].privacy)
			],
			[
				'contribution-disclosure',
				policyVersions.contributionDisclosure,
				contributionDisclosure[locale]
			],
			['age-declaration', policyVersions.ageDeclaration, '18+'],
			['review-rules', policyVersions.reviewRules, JSON.stringify(legalContent[locale].reviews)],
			[
				'moderation-explanation',
				policyVersions.moderationExplanation,
				JSON.stringify(legalContent[locale].moderation)
			]
		] as const;
		for (const [type, version, content] of values) {
			await this.database
				.insert(documentVersion)
				.values({
					id: `${type}:${version}:${locale}`,
					type,
					version,
					locale,
					contentHash: hash(content),
					effectiveFrom: now,
					createdAt: now
				})
				.onConflictDoNothing();
		}
	}
}
