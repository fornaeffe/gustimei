import { stat } from 'node:fs/promises';
import path from 'node:path';
import { OsmRestaurantImporter } from '$lib/server/catalogue/osm-importer';
import { loadEnvironment } from '$lib/server/config/environment';
import { createDatabase } from '$lib/server/db/connection';
import { CatalogueRepository } from '$lib/server/repositories/catalogue';

const runtimeConfig = loadEnvironment(process.env);
const connection = createDatabase(runtimeConfig.databaseUrl);
const sourcePath = process.argv[2];
if (!sourcePath) {
	throw new Error('Usage: npm run catalogue:import:restaurants -- <italy-latest.osm.pbf>');
}
if (runtimeConfig.appEnvironment === 'preview' || runtimeConfig.appEnvironment === 'production') {
	throw new Error('Phase 2A catalogue imports are intentionally local/on-demand only');
}
const resolvedPath = path.resolve(sourcePath);
const source = await stat(resolvedPath);
if (!source.isFile() || !resolvedPath.endsWith('.osm.pbf')) {
	throw new Error('The import source must be an existing .osm.pbf file');
}

try {
	const result = await new OsmRestaurantImporter(new CatalogueRepository(connection.db)).importPbf(
		resolvedPath
	);
	process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
	await connection.close();
}
