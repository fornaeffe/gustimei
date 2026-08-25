import { loadEnvironment, type AppEnvironment } from '$lib/server/config/environment';
import { createDatabase } from '$lib/server/db/connection';
import { CatalogueGovernanceService } from '$lib/server/services/catalogue-governance';
import { parseOperatorArguments } from '$lib/server/cli/operator-arguments';

const runtimeConfig = loadEnvironment(process.env);
const connection = createDatabase(runtimeConfig.databaseUrl);
const [command, ...rawArguments] = process.argv.slice(2);
const argumentsByName = parseOperatorArguments(rawArguments);

function required(name: string) {
	const value = argumentsByName.get(name)?.trim();
	if (!value) throw new Error(`--${name} is required`);
	return value;
}

function environment() {
	const value = required('environment');
	if (!['development', 'test', 'preview', 'production'].includes(value)) {
		throw new Error('--environment must be development, test, preview, or production');
	}
	return value as AppEnvironment;
}

function role() {
	const value = required('role');
	if (value !== 'admin' && value !== 'catalogue_curator') {
		throw new Error('--role must be admin or catalogue_curator');
	}
	return value;
}

const service = new CatalogueGovernanceService(connection.db, runtimeConfig.appEnvironment);

try {
	let result: unknown;
	switch (command) {
		case 'bootstrap':
			result = await service.bootstrapRole({
				targetUserId: required('target-user-id'),
				role: role(),
				environment: environment(),
				operatorReference: required('operator'),
				reason: required('reason')
			});
			break;
		case 'break-glass':
			result = await service.breakGlassAdmin({
				targetUserId: required('target-user-id'),
				environment: environment(),
				operatorReference: required('operator'),
				reason: required('reason')
			});
			break;
		case 'grant':
			if (environment() !== runtimeConfig.appEnvironment) {
				throw new Error('--environment must match APP_ENV');
			}
			result = await service.grantRole(
				required('actor-user-id'),
				required('target-user-id'),
				role(),
				required('reason')
			);
			break;
		case 'revoke':
			if (environment() !== runtimeConfig.appEnvironment) {
				throw new Error('--environment must match APP_ENV');
			}
			result = await service.revokeRole(
				required('actor-user-id'),
				required('target-user-id'),
				role(),
				required('reason')
			);
			break;
		case 'rotate':
			if (environment() !== runtimeConfig.appEnvironment) {
				throw new Error('--environment must match APP_ENV');
			}
			result = await service.rotateRole({
				actorUserId: required('actor-user-id'),
				predecessorUserId: required('predecessor-user-id'),
				successorUserId: required('successor-user-id'),
				role: role(),
				reason: required('reason')
			});
			break;
		default:
			throw new Error(
				'Usage: npm run catalogue:roles -- <bootstrap|grant|revoke|rotate|break-glass> environment=<environment> ...'
			);
	}
	process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
	await connection.close();
}
