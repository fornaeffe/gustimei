import { db } from '$lib/server/db';
import { AuthEmailOutbox } from './auth-email';

export const authEmailOutbox = new AuthEmailOutbox(db);
