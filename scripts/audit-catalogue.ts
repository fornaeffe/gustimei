import { loadEnvironment } from '$lib/server/config/environment';
import { createDatabase } from '$lib/server/db/connection';
import { CatalogueRepository } from '$lib/server/repositories/catalogue';

const runtimeConfig = loadEnvironment(process.env);
const connection = createDatabase(runtimeConfig.databaseUrl);
if (runtimeConfig.appEnvironment === 'preview' || runtimeConfig.appEnvironment === 'production') {
	throw new Error('Phase 2A coverage audits are intentionally local/on-demand only');
}

try {
	const audit = await new CatalogueRepository(connection.db).auditLatest('restaurant');
	if (!audit || audit.total === 0) {
		throw new Error('No imported restaurant catalogue is available to audit');
	}
	const percentages = {
		active: audit.active / audit.total,
		quarantined: audit.quarantined / audit.total,
		missingMunicipalityIdentity: audit.missingMunicipalityIdentity / audit.total,
		missingSettlement: audit.missingSettlement / audit.total,
		missingPostalCode: audit.missingPostalCode / audit.total
	};
	process.stdout.write(
		`${JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				category: 'restaurant',
				note: 'Loose audit: only identity-breaking or deeply biasing defects block Phase 2A.',
				counts: audit,
				percentages
			},
			null,
			2
		)}\n`
	);
} finally {
	await connection.close();
}
