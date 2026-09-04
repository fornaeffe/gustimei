import { closeDatabase } from '../src/lib/server/db';
import { recommendationArtifacts } from '../src/lib/server/services/recommendation-runtime';

const categoryArgument = process.argv[2] ?? 'restaurant';
if (categoryArgument !== 'restaurant') {
	throw new Error('Phase 8 rebuilds are restaurant-only; expected category "restaurant"');
}
const category = 'restaurant' as const;
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
