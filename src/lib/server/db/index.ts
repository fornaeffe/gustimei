import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { runtimeConfig } from '$lib/server/config';

const client = postgres(runtimeConfig.databaseUrl);

export const db = drizzle(client, { schema });
