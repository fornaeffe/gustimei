import { resolve } from 'node:path';
import { runtimeConfig } from '$lib/server/config';
import { db } from '$lib/server/db';
import { createArtifactStore } from '$lib/server/providers/local';
import { RankingRepository } from '$lib/server/repositories/rankings';
import { DatabaseRecommendationEvidenceSource } from '$lib/server/repositories/recommendation-evidence';
import { RecommendationRepository } from '$lib/server/repositories/recommendations';
import { RecommendationArtifactService, RecommendationService } from './recommendations';

const rankings = new RankingRepository(db);
const evidence = new DatabaseRecommendationEvidenceSource(
	db,
	rankings,
	runtimeConfig.appEnvironment
);
const repository = new RecommendationRepository(db);
const artifactStore = createArtifactStore(
	runtimeConfig.appEnvironment,
	resolve('.data', 'recommendation-artifacts')
);

export const recommendationArtifacts = new RecommendationArtifactService(
	evidence,
	repository,
	artifactStore,
	runtimeConfig.appEnvironment
);

export const recommendations = new RecommendationService(
	evidence,
	repository,
	recommendationArtifacts
);
