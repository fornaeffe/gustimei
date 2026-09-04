# Runtime boundary

Phases 0–8 run as a standalone SvelteKit Node application backed by PostgreSQL. They must not
provision, call, or require Koyeb, Neon, Brevo, Sentry, or hosted job/blob services. Phase 9 may
add hosted implementations behind the provider contracts in `src/lib/server/providers`.

## Environments and databases

`APP_ENV` is always one of `development`, `test`, `preview`, or `production`. Each deployed or
local environment receives its own `DATABASE_URL`, `ORIGIN`, and `BETTER_AUTH_SECRET`; credentials
must never be shared between environments.

| Environment | Configuration source                                     | Database boundary                                      |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------ |
| Development | `.env`, copied from `.env.example`                       | Persistent `db-development` Compose service, port 5432 |
| Test        | Checked-in non-secret `.env.test`                        | Tmpfs-backed `db-test` Compose service, port 5433      |
| Preview     | Runtime secrets, documented by `.env.preview.example`    | Isolated preview database                              |
| Production  | Runtime secrets, documented by `.env.production.example` | Isolated production database                           |

The checked-in `db-test` service is the default database for all local database integration and
browser tests. Start it with `docker compose up -d db-test`; `npm run test:db` and
`npm run db:test:reset` validate that destructive resets target only its expected local port and
database name.

Production rejects a non-HTTPS origin. Runtime configuration is validated when the Node process
starts. Placeholder values are used only while SvelteKit analyzes and bundles server modules, so
a production artifact can be built without embedding runtime secrets.

## Provider seams

Application code depends on narrow interfaces for transactional email, background jobs, job locks,
artifact/blob storage, restricted evidence, error reporting, and operational monitoring. Local/test
adapters retain data in process or under ignored `.data` roots and never make provider network calls.
Preview/production artifact and evidence adapters fail closed. Deployment configuration is represented
by `RuntimeConfig` plus the separately validated production provider/credential contract. Hosted
adapters are intentionally deferred to Phase 9.

The Node artifact is built with `npm run build` and started with `npm run start`. The process
expects `HOST`, `PORT`, and proxy/origin settings supported by SvelteKit's Node adapter; trusted
proxy headers must only be enabled once the deployment topology is known.

The end-to-end runner starts the built server as a direct child process and always terminates it
after Playwright exits. This explicit lifecycle avoids orphaned Node servers on Windows.

Phase 8 adds separate app/operations container targets, the Caddy/PostgreSQL topology, least-privilege
role bootstrap, immutable GitHub workflows, and local operational rehearsal. See
[`phase-8-architecture.md`](phase-8-architecture.md) and the mandatory
[`phase-8-readiness-checklist.md`](phase-8-readiness-checklist.md).
