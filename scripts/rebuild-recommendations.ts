import { closeDatabase } from '../src/lib/server/db';
import { recommendationArtifacts } from '../src/lib/server/services/recommendation-runtime';

const category = process.argv[2] === 'hotel' ? 'hotel' : 'restaurant';
const dataClass = process.argv.includes('--synthetic') ? 'synthetic' : 'real';

try {
	const artifact = await recommendationArtifacts.rebuild(category, dataClass);
	console.log(
		JSON.stringify(
			{
				artifactId: artifact.id,
				category: artifact.category,
				dataClass: artifact.dataClass,
				contributors: artifact.contributorCount,
				observations: artifact.observationCount,
				generatedAt: artifact.generatedAt
			},
			null,
			2
		)
	);
} finally {
	await closeDatabase();
}
