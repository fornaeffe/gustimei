export const REVIEW_BODY_MAX_LENGTH = 2_000;
export const NOTICE_EXPLANATION_MIN_LENGTH = 20;
export const NOTICE_EXPLANATION_MAX_LENGTH = 5_000;
export const CASE_SUBMISSION_MAX_LENGTH = 5_000;

export interface ReviewClockPolicy {
	serviceDateWindowDays: number;
	publicationLifetimeYears: number;
	partySubmissionWindowDays: number;
	evidenceRetentionDays: number;
}

export const provisionalReviewClockPolicy: Readonly<ReviewClockPolicy> = {
	serviceDateWindowDays: 30,
	publicationLifetimeYears: 2,
	partySubmissionWindowDays: 14,
	evidenceRetentionDays: 90
};

export interface ReviewDeclarations {
	personallyUsedService: boolean;
	contentConcernsExperience: boolean;
	noIncentive: boolean;
}

export type ReviewLifecycle = 'published' | 'withdrawn' | 'expired' | 'removed' | 'superseded';

export type PublicReviewPresentation =
	| 'visible'
	| 'edited'
	| 'disputed'
	| 'expired'
	| 'withdrawn'
	| 'restricted'
	| 'removed'
	| 'superseded'
	| 'catalogue-unavailable'
	| 'collision-restricted';

export interface PublicVisibilityInput {
	lifecycle: ReviewLifecycle;
	expiresAt: Date;
	now: Date;
	editedAt?: Date | null;
	interimRestrictedAt?: Date | null;
	openNoticeCount?: number;
	placeIsPublic?: boolean;
	collisionRestrictedAt?: Date | null;
}

export function normalizeReviewBody(value: string): string {
	const normalized = value.normalize('NFC').replace(/\r\n?/g, '\n').trim();
	if (!normalized) throw new Error('Review text is required');
	if (normalized.length > REVIEW_BODY_MAX_LENGTH) {
		throw new Error(`Review text must be at most ${REVIEW_BODY_MAX_LENGTH} characters`);
	}
	if (normalized.includes(String.fromCharCode(0)))
		throw new Error('Review text contains an invalid character');
	return normalized;
}

export function normalizeCaseText(value: string, label = 'Statement'): string {
	const normalized = value.normalize('NFC').replace(/\r\n?/g, '\n').trim();
	if (!normalized) throw new Error(`${label} is required`);
	if (normalized.length > CASE_SUBMISSION_MAX_LENGTH) {
		throw new Error(`${label} must be at most ${CASE_SUBMISSION_MAX_LENGTH} characters`);
	}
	if (normalized.includes(String.fromCharCode(0)))
		throw new Error(`${label} contains an invalid character`);
	return normalized;
}

export function normalizeNoticeExplanation(value: string): string {
	const normalized = value.normalize('NFC').replace(/\r\n?/g, '\n').trim();
	if (normalized.length < NOTICE_EXPLANATION_MIN_LENGTH) {
		throw new Error(
			`Notice explanation must be at least ${NOTICE_EXPLANATION_MIN_LENGTH} characters`
		);
	}
	if (normalized.length > NOTICE_EXPLANATION_MAX_LENGTH) {
		throw new Error(
			`Notice explanation must be at most ${NOTICE_EXPLANATION_MAX_LENGTH} characters`
		);
	}
	if (normalized.includes(String.fromCharCode(0))) {
		throw new Error('Notice explanation contains an invalid character');
	}
	return normalized;
}

export function requireDeclarations(input: ReviewDeclarations): ReviewDeclarations {
	if (!input.personallyUsedService || !input.contentConcernsExperience || !input.noIncentive) {
		throw new Error('Every review declaration must be accepted');
	}
	return { ...input };
}

export function parseItalianServiceDate(value: string): string {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Service date must use YYYY-MM-DD');
	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		throw new Error('Service date is not a valid calendar day');
	}
	return value;
}

export function italianCalendarDate(at: Date): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Europe/Rome',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(at);
	const get = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)?.value;
	return `${get('year')}-${get('month')}-${get('day')}`;
}

function epochDay(value: string): number {
	const [year, month, day] = parseItalianServiceDate(value).split('-').map(Number);
	return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function assertServiceDateEligible(
	serviceDate: string,
	now: Date,
	policy: Pick<ReviewClockPolicy, 'serviceDateWindowDays'> = provisionalReviewClockPolicy
): string {
	const normalized = parseItalianServiceDate(serviceDate);
	const age = epochDay(italianCalendarDate(now)) - epochDay(normalized);
	if (age < 0) throw new Error('Service date cannot be in the future');
	if (age > policy.serviceDateWindowDays) {
		throw new Error(`Service date must be within ${policy.serviceDateWindowDays} days`);
	}
	return normalized;
}

export function addCalendarYears(at: Date, years: number): Date {
	const result = new Date(at);
	result.setUTCFullYear(result.getUTCFullYear() + years);
	return result;
}

export function addDays(at: Date, days: number): Date {
	return new Date(at.getTime() + days * 86_400_000);
}

export function deriveExpiresAt(
	publishedAt: Date,
	policy: Pick<ReviewClockPolicy, 'publicationLifetimeYears'> = provisionalReviewClockPolicy
): Date {
	return addCalendarYears(publishedAt, policy.publicationLifetimeYears);
}

export function publicServiceMonth(serviceDate: string, locale: 'en' | 'it'): string {
	const [year, month] = parseItalianServiceDate(serviceDate).split('-').map(Number);
	return new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-GB', {
		timeZone: 'UTC',
		year: 'numeric',
		month: 'long'
	}).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function derivePublicPresentation(input: PublicVisibilityInput): {
	publiclyVisible: boolean;
	presentation: PublicReviewPresentation;
} {
	if (!input.placeIsPublic)
		return { publiclyVisible: false, presentation: 'catalogue-unavailable' };
	if (input.collisionRestrictedAt)
		return { publiclyVisible: false, presentation: 'collision-restricted' };
	if (input.interimRestrictedAt) return { publiclyVisible: false, presentation: 'restricted' };
	if (input.lifecycle === 'withdrawn') return { publiclyVisible: false, presentation: 'withdrawn' };
	if (input.lifecycle === 'removed') return { publiclyVisible: false, presentation: 'removed' };
	if (input.lifecycle === 'superseded')
		return { publiclyVisible: false, presentation: 'superseded' };
	if (input.lifecycle === 'expired' || input.expiresAt <= input.now) {
		return { publiclyVisible: false, presentation: 'expired' };
	}
	if (input.openNoticeCount && input.openNoticeCount > 0) {
		return { publiclyVisible: true, presentation: 'disputed' };
	}
	return { publiclyVisible: true, presentation: input.editedAt ? 'edited' : 'visible' };
}

export function assertExactReportedVersion(
	reportedPublicationId: string,
	reportedVersionId: string,
	version: { id: string; publicationId: string }
): void {
	if (version.id !== reportedVersionId || version.publicationId !== reportedPublicationId) {
		throw new Error('The notice must target an exact review publication version');
	}
}

export function evidenceDeletionDeadline(
	caseClosedAt: Date,
	policy: Pick<ReviewClockPolicy, 'evidenceRetentionDays'> = provisionalReviewClockPolicy
): Date {
	return addDays(caseClosedAt, policy.evidenceRetentionDays);
}
