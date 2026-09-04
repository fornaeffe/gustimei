import { loadProductionDeploymentEnvironment } from '../src/lib/server/config/deployment';

const config = loadProductionDeploymentEnvironment(process.env);

console.log(
	JSON.stringify({
		status: 'valid',
		appImage: config.appImage,
		opsImage: config.opsImage,
		databaseRoles: 4,
		storageJurisdiction: config.r2.jurisdiction,
		storagePurposes: 3,
		providers: config.providers
	})
);
