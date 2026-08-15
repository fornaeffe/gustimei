import { error } from '@sveltejs/kit';
import { getLocale } from '$lib/paraglide/runtime';
import { legalContent, policyVersions } from '$lib/content/policies';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	const locale = getLocale();
	const mapping = {
		terms: { content: legalContent[locale].terms, version: policyVersions.terms },
		privacy: { content: legalContent[locale].privacy, version: policyVersions.privacyNotice },
		'review-rules': { content: legalContent[locale].reviews, version: policyVersions.reviewRules },
		moderation: {
			content: legalContent[locale].moderation,
			version: policyVersions.moderationExplanation
		}
	} as const;
	const record = mapping[params.document as keyof typeof mapping];
	if (!record) error(404, 'Document not found');
	return record;
};
