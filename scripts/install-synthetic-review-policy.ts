import { loadEnvironment } from '$lib/server/config/environment';
import { createDatabase } from '$lib/server/db/connection';
import { ReviewService } from '$lib/server/services/reviews';

const runtimeConfig = loadEnvironment(process.env);
if (!['development', 'test'].includes(runtimeConfig.appEnvironment)) {
	throw new Error('Synthetic review-policy installation is limited to development and test');
}

const connection = createDatabase(runtimeConfig.databaseUrl);
try {
	const service = new ReviewService(connection.db, runtimeConfig.appEnvironment);
	const result = await service.installPolicy({
		version: `synthetic-local-${new Date().toISOString()}`,
		body: 'Synthetic local review rules for non-production human exercises only.',
		legalReviewStatus: 'approved',
		declarations: {
			en: {
				used: 'I personally used the service.',
				relevant: 'This review concerns that service or relevant place characteristics.',
				incentive: 'No benefit, payment, promise, or other incentive produced this review.'
			},
			it: {
				used: 'Dichiaro di avere utilizzato personalmente il servizio.',
				relevant: 'La recensione riguarda il servizio o caratteristiche pertinenti del luogo.',
				incentive:
					'Nessun vantaggio, pagamento, promessa o altro incentivo ha prodotto questa recensione.'
			}
		}
	});
	process.stdout.write(`${JSON.stringify({ ...result, synthetic: true }, null, 2)}\n`);
} finally {
	await connection.close();
}
