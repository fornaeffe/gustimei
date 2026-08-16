import { runtimeConfig } from '$lib/server/config';
import { db } from '$lib/server/db';
import { createEvidenceStore } from '$lib/server/providers/evidence';
import { ReviewModerationService } from './review-moderation';

export const reviewEvidenceStore = createEvidenceStore(runtimeConfig.appEnvironment);
export const reviewModeration = new ReviewModerationService(
	db,
	runtimeConfig.appEnvironment,
	reviewEvidenceStore
);
