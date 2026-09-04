# Phase 8 restaurant beta architecture

Date: 2026-09-03

This document fixes the deployable restaurant-beta boundary without provisioning or calling Phase 9
providers. Hosted email, R2, Better Stack, durable scheduling, DNS, and the VPS remain disabled until
their owners, budgets, legal terms, and credentials are approved.

## Category-boundary audit

The beta surface is restaurant-only. Existing `RankingCategory` support remains a domain seam because
earlier ranking experiments intentionally proved that separate future categories are possible; it is
not a hotel feature. The production rebuild CLI now rejects every category except `restaurant`.

| Area                      | Category invariant                                                                                                                                          | Phase 8 result                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Catalogue identity/import | Every place, import, projection, redirect, issue, migration, and invalidation either stores category or derives it from the stable place                    | Explicit; importer and map API are restaurant-only                             |
| Ranking and comments      | Lists, revisions, visited membership, comments, restrictions, and deletion select by owner plus category; place category must match list category           | Explicit and database-constrained                                              |
| Reviews and cases         | A review is attached to one stable place; publications, notices, evidence, decisions, and redress derive category through that immutable place relationship | Derived, avoiding a second mutable category copy                               |
| Recommendations           | Evidence, engine version, candidates, artifacts, cursors, attribution, cache/storage keys, and rebuild locks include environment, data class, and category  | Explicit; artifacts use `recommendations/{environment}/{dataClass}/{category}` |
| Routes/localization       | Restaurant routes and copy are concrete beta product routes; shared UI primitives contain no hotel behavior                                                 | Restaurant-only                                                                |
| Analytics                 | Allowlisted records carry category; review/case operations remain outside product analytics                                                                 | Explicit                                                                       |
| Export/deletion           | Ranking and comments carry category; review/case scope derives it from place; category deletion accepts an explicit category and does not delete reviews    | Explicit or immutable derivation                                               |
| Jobs                      | Category-owned jobs require an explicit category scope; global review/outbox jobs derive the category from their target records                             | Contract-enforced                                                              |

No hotel import, copy, route, metadata, artifact, workflow, fixture, or beta measure was added.

## Runtime and credential topology

`Dockerfile` produces two targets from the same reviewed commit:

- `app`: a non-root, read-only SvelteKit Node image with only production dependencies and the
  read-only migration-parity startup guard;
- `ops`: a separately published image containing migration and runner tooling. It is never exposed
  through Caddy and is invoked only by an approved operation.

`compose.production.yaml` defines Caddy, the app, one PostgreSQL server, a one-shot migration
container, and a disabled-until-Phase-9 review worker profile. PostgreSQL is not published to the
host. The app can reach the private database and outbound providers; Caddy cannot reach PostgreSQL.
Co-hosted applications must use different Compose projects, networks, database names, volumes,
Unix accounts, environment files, and credentials. They must not join `gustimei-production_private`.

Database and host principals are separate:

- runtime: DML only, used by the web app and ordinary workers;
- migration: schema ownership/change, used only by the one-shot migration container;
- backup: read-only dump access;
- operator: audited repair/data-rights execution, never used by the app;
- deployment: restricted SSH/host principal that can update immutable image references and run the
  deployment wrapper, but has no database password.

`deploy/postgres-roles.sql` is idempotent and provisions the four database roles. Run it only from a
trusted administration session and pass passwords as `psql` variables. Store runtime, migration,
backup, worker, and database environment files mode `0600` under `/opt/gustimei/env`; never place
them in the checkout.

## Provider and object-storage contracts

Local email, evidence, job, monitoring, and artifact adapters are limited to development/test.
Preview/production evidence and recommendation artifacts fail closed until Phase 9 installs hosted
adapters. `npm run deployment:validate` rejects mutable images, shared database users, mixed object
buckets, a non-EU R2 contract, missing provider selections, and absent secret-bearing settings. It
prints only non-secret contract metadata.

R2 must be configured with three private, production-only, EU-jurisdiction buckets:

- `evidence/{environment}/{noticeId}/{evidenceId}/{opaqueVersion}`: no public URL, server-side
  encryption, checksums, malware state, audited reads, and verified idempotent deletion;
- `recommendations/{environment}/{dataClass}/{category}/{artifactId}.json` plus an atomic current
  pointer: immutable artifacts and no review/comment data;
- `backups/{environment}/{yyyy}/{mm}/{timestamp}-{databaseRevision}.dump.age`: encrypted before
  upload, no unencrypted local staging, and restore access separated from upload access.

Bucket credentials are purpose-scoped. Evidence credentials cannot read backups; app artifact
credentials cannot read evidence or backups. Lifecycle configuration retains the seven newest
nightly backups plus one weekly recovery point for one month. Because that policy cannot be expressed
safely as age alone, a locked retention job selects protected recovery points, deletes only surplus
objects, records object version/checksum, and verifies absence. Object-lock or provider-versioning
must not silently defeat approved evidence deletion; Phase 9 must test this with the final R2 account.

## Monitoring and logging contract

Better Stack receives redacted server errors, an HTTPS readiness check, and minimum-payload cron
check-ins. A check-in contains only monitor name, random run ID, state, timestamp, and allowlisted
counts/durations. It never contains user/place IDs, emails, tokens, URLs, review/case/evidence text,
filenames, coordinates, database URLs, or object keys. Monitoring failure must not roll back a
completed domain transaction; it does raise a local structured warning for the next operator run.

Alert ownership must name a primary and backup before beta. Page immediately on public readiness
failure, backup missed/failed, overdue evidence deletion, or repeated worker failure. Catalogue and
model rebuild failures preserve the previous promoted revision/artifact and page during the approved
operations window. Exact thresholds remain a human approval gate in the readiness checklist.

## Immutable deployment and rollback

CI runs static checks, unit/component tests, PostgreSQL integration tests, browser tests, the
reproducible benchmark, and both image builds. The image workflow publishes commit-addressed app and
ops images. Deployment accepts digest-qualified images only and is serialized through the
`restaurant-production` GitHub environment.

The host-side `/opt/gustimei/bin/deploy` wrapper, installed in Phase 9, must:

1. verify the requested commit, both image digests, signed approval, free space, backup freshness,
   migration compatibility, and `npm run deployment:validate`;
2. write a new versioned Compose environment, pull by digest, take a direct encrypted backup, and
   run the idempotent migration with the migration credential;
3. start the app, require liveness/readiness and a read-only smoke suite, then atomically switch the
   `current` symlink and record the audit entry;
4. on failure, restore the prior app digest. If a migration is not backward-compatible, stop and use
   the reviewed database restore procedure rather than attempting an automatic down migration.

Rollback uses the same workflow with `action=rollback`, an explicitly approved prior digest pair,
and expected revision. Never use `latest`, rebuild an old tag, edit the live Compose file, or print
environment files. Operations use a separate serialized workflow and a unique idempotency key; the
host wrapper must acquire a PostgreSQL advisory lock and preserve the last good import/artifact.

## Backup and restore contract

Production backup is `pg_dump --format=custom` from the backup role, streamed through authenticated
`age` encryption directly to R2. Capture database migration revision, encrypted-object checksum,
PostgreSQL major version, start/end times, and success state without row counts for sensitive tables.
The private key is offline from the server. Every deletion/erasure tombstone created after the
recovery point must be replayed before restored data can serve traffic or send email.

A restore drill uses a new isolated database and credentials, verifies the dump and migrations,
replays tombstones, runs integrity/read-only smoke tests, confirms reviews/evidence that should be
gone remain unavailable, and destroys the drill database after evidence is recorded. Never restore
over the live database. Local `npm run rehearse:phase8` performs a disposable `gustimei_phase8_restore`
round trip inside `db-test`; hosted RPO/RTO claims remain Phase 9 evidence.

## Local operational rehearsal

`npm run rehearse:phase8` is the canonical automated rehearsal. It uses only the checked-in local
test database and fictional fixtures. It runs CI, the full database lifecycle suite, review expiry,
evidence retention, expired-hold release, outbox delivery, recommendation benchmark, browser flows,
a dump/restore round trip into a fixed disposable database, and both container builds.

The review integration suite covers acknowledgement, author notification, isolated evidence,
assignment/absence boundaries, reasoned decision, redress, reinstatement, expiry, deletion, export,
erasure, and retry/terminal recipient behavior. Clock-driven portions remain deterministic tests;
the rehearsal does not wait for real deadlines. Any failed step blocks Phase 9 preparation.
