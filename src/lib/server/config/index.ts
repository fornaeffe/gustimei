import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { loadEnvironment } from './environment';

export const runtimeConfig = loadEnvironment(env, { building });

export type { AppEnvironment, RuntimeConfig } from './environment';
