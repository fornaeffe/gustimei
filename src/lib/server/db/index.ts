import { runtimeConfig } from '$lib/server/config';
import { createDatabase } from './connection';

const connection = createDatabase(runtimeConfig.databaseUrl);

export const db = connection.db;
export const closeDatabase = connection.close;
export { createDatabase } from './connection';
export type { Database } from './connection';
