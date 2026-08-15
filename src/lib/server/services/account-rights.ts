import { eq, inArray } from 'drizzle-orm';
import type { Database } from '$lib/server/db';
import {
	accountPreference,
	personalPlaceComment,
	placeReview,
	publicProfile,
	rankingList,
	rankingRevision,
	registrationAttestation,
	reviewCasePartySubmission,
	reviewDeclarationAcceptance,
	reviewEvidenceObject,
	reviewModerationDecision,
	reviewNotice,
	reviewPublication,
	reviewRedressRequest,
	reviewVersion,
	user
} from '$lib/server/db/schema';
import { NotFoundError } from '$lib/server/domain/errors';

export interface CanonicalAccountExport {
	format: 'gustimei-account-export';
	version: 1;
	generatedAt: string;
	account: unknown;
	registration: unknown;
	preferences: unknown;
	publicProfile: unknown;
	rankings: unknown[];
	privateComments: unknown[];
	reviews: unknown[];
	reviewDeclarations: unknown[];
	cases: unknown[];
	caseSubmissions: unknown[];
	caseEvidenceMetadata: unknown[];
	caseDecisions: unknown[];
	redressRequests: unknown[];
}

export class AccountRightsService {
	constructor(
		private readonly database: Database,
		private readonly clock: () => Date = () => new Date()
	) {}

	async exportAccount(userId: string): Promise<CanonicalAccountExport> {
		const [account] = await this.database.select().from(user).where(eq(user.id, userId)).limit(1);
		if (!account) throw new NotFoundError('Account was not found');
		const [registration, preferences, profile, lists, comments, reviews] = await Promise.all([
			this.database
				.select()
				.from(registrationAttestation)
				.where(eq(registrationAttestation.userId, userId))
				.limit(1),
			this.database
				.select()
				.from(accountPreference)
				.where(eq(accountPreference.userId, userId))
				.limit(1),
			this.database.select().from(publicProfile).where(eq(publicProfile.userId, userId)).limit(1),
			this.database.select().from(rankingList).where(eq(rankingList.ownerId, userId)),
			this.database
				.select()
				.from(personalPlaceComment)
				.where(eq(personalPlaceComment.ownerId, userId)),
			this.database.select().from(placeReview).where(eq(placeReview.authorId, userId))
		]);
		const listIds = lists.map((list) => list.id);
		const reviewIds = reviews.map((review) => review.id);
		const revisions = listIds.length
			? await this.database
					.select()
					.from(rankingRevision)
					.where(inArray(rankingRevision.listId, listIds))
			: [];
		const publications = reviewIds.length
			? await this.database
					.select()
					.from(reviewPublication)
					.where(inArray(reviewPublication.reviewId, reviewIds))
			: [];
		const publicationIds = publications.map((publication) => publication.id);
		const [versions, notices] = publicationIds.length
			? await Promise.all([
					this.database
						.select()
						.from(reviewVersion)
						.where(inArray(reviewVersion.publicationId, publicationIds)),
					this.database
						.select()
						.from(reviewNotice)
						.where(inArray(reviewNotice.publicationId, publicationIds))
				])
			: [[], []];
		const acceptanceIds = versions.map((version) => version.declarationAcceptanceId);
		const declarations = acceptanceIds.length
			? await this.database
					.select()
					.from(reviewDeclarationAcceptance)
					.where(inArray(reviewDeclarationAcceptance.id, acceptanceIds))
			: [];
		const noticeIds = notices.map((notice) => notice.id);
		const [submissions, evidence, decisions, redress] = noticeIds.length
			? await Promise.all([
					this.database
						.select()
						.from(reviewCasePartySubmission)
						.where(inArray(reviewCasePartySubmission.noticeId, noticeIds)),
					this.database
						.select({
							id: reviewEvidenceObject.id,
							noticeId: reviewEvidenceObject.noticeId,
							uploaderRole: reviewEvidenceObject.uploaderRole,
							originalFilename: reviewEvidenceObject.originalFilename,
							mediaType: reviewEvidenceObject.mediaType,
							sizeBytes: reviewEvidenceObject.sizeBytes,
							purpose: reviewEvidenceObject.purpose,
							expiresAt: reviewEvidenceObject.expiresAt,
							deletedAt: reviewEvidenceObject.deletedAt,
							createdAt: reviewEvidenceObject.createdAt
						})
						.from(reviewEvidenceObject)
						.where(inArray(reviewEvidenceObject.noticeId, noticeIds)),
					this.database
						.select()
						.from(reviewModerationDecision)
						.where(inArray(reviewModerationDecision.noticeId, noticeIds)),
					this.database
						.select()
						.from(reviewRedressRequest)
						.where(inArray(reviewRedressRequest.noticeId, noticeIds))
				])
			: [[], [], [], []];
		return {
			format: 'gustimei-account-export',
			version: 1,
			generatedAt: this.clock().toISOString(),
			account,
			registration: registration[0] ?? null,
			preferences: preferences[0] ?? null,
			publicProfile: profile[0] ?? null,
			rankings: lists.map((list) => ({
				...list,
				revisions: revisions.filter((revision) => revision.listId === list.id)
			})),
			privateComments: comments,
			reviews: reviews.map((review) => {
				const ownPublications = publications.filter(
					(publication) => publication.reviewId === review.id
				);
				const ownPublicationIds = ownPublications.map((publication) => publication.id);
				return {
					...review,
					publications: ownPublications,
					versions: versions.filter((version) => ownPublicationIds.includes(version.publicationId))
				};
			}),
			reviewDeclarations: declarations,
			cases: notices,
			caseSubmissions: submissions,
			caseEvidenceMetadata: evidence,
			caseDecisions: decisions,
			redressRequests: redress
		};
	}
}
