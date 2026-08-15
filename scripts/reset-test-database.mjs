import { spawn } from 'node:child_process';
import path from 'node:path';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const parsed = new URL(databaseUrl);
const allowedHosts = new Set(['localhost', '127.0.0.1', '::1']);
if (
	!allowedHosts.has(parsed.hostname) ||
	parsed.port !== '5433' ||
	parsed.pathname.replace(/^\//, '') !== 'gustimei_test'
) {
	throw new Error(
		'Refusing to reset anything except the local gustimei_test database on port 5433'
	);
}

const client = postgres(databaseUrl, { max: 1 });
try {
	await client.unsafe('drop schema if exists public cascade');
	await client.unsafe('drop schema if exists drizzle cascade');
	await client.unsafe('create schema public');
	if (process.argv.includes('--legacy-auth')) {
		await client.unsafe(`
			create table "user" (
				id text primary key, name text not null, email text not null unique,
				email_verified boolean not null default false, image text,
				created_at timestamp not null default now(), updated_at timestamp not null default now()
			);
			create table account (
				id text primary key, account_id text not null, provider_id text not null,
				user_id text not null references "user"(id) on delete cascade,
				access_token text, refresh_token text, id_token text,
				access_token_expires_at timestamp, refresh_token_expires_at timestamp,
				scope text, password text, created_at timestamp not null default now(),
				updated_at timestamp not null
			);
			create table session (
				id text primary key, expires_at timestamp not null, token text not null unique,
				created_at timestamp not null default now(), updated_at timestamp not null,
				ip_address text, user_agent text,
				user_id text not null references "user"(id) on delete cascade
			);
			create table verification (
				id text primary key, identifier text not null, value text not null,
				expires_at timestamp not null, created_at timestamp not null default now(),
				updated_at timestamp not null default now()
			);
			create table task (id serial primary key, description text not null, done boolean not null default false);
		`);
	}
} finally {
	await client.end();
}

await new Promise((resolve, reject) => {
	const drizzleKit = path.resolve('node_modules/drizzle-kit/bin.cjs');
	const child = spawn(process.execPath, [drizzleKit, 'migrate'], {
		cwd: process.cwd(),
		env: process.env,
		stdio: 'inherit'
	});
	child.on('error', reject);
	child.on('exit', (code) =>
		code === 0 ? resolve() : reject(new Error(`Migration exited ${code}`))
	);
});
