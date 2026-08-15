# Phase 2B catalogue governance and repair operations

Phase 2B is intentionally exposed through server-only services and local operator commands, not a
curator web UI. Public application code must call `CatalogueGovernanceService`; it must never write
governance tables or trust a role supplied by a cookie, profile field, request parameter, or email
allowlist.

## Effective catalogue resolution

`catalogue_base_place` stores the latest provider-derived projection. `effective_place` is rebuilt
from that base plus, in order, the active field override, active category migration, and active
canonical redirect. Search and recommendation eligibility continue to read only
`effective_place`.

Ordinary overrides accept only these shaped fields:

- name and address label;
- an atomic latitude/longitude pair;
- explicit locality fields with a required display label;
- active, quarantined, or hidden visibility with a reason for non-active states.

Provider identity, source snapshot/version/tags, application place ID, category, and ranking facts
cannot be patched. Every override needs a structured reason, evidence reference, future review date,
and optional expiry. Expiry changes the review state; it never silently removes the override.

On import, the source projection is updated first. An upstream value matching the override marks it
`upstream-match`; a different upstream change marks it `conflict`; an expired override becomes
`review-required`. The local effective decision remains in force until an authorized curator
retires it. Each review-state transition is audited.

## Roles and operator commands

Roles are application-owned, environment-specific assignments linked to verified Better Auth user
IDs. Only active database assignments are authoritative. Bootstrap and break-glass commands are
blocked in preview and production and require an explicit environment matching `APP_ENV`.

After the target Better Auth account exists and has a verified email, bootstrap a local admin:

```powershell
npm run catalogue:roles -- bootstrap --environment development --target-user-id USER_ID --role admin --operator LOCAL_OPERATOR --reason "initial local administrator"
```

Then grant a curator through that administrator:

```powershell
npm run catalogue:roles -- grant --environment development --actor-user-id ADMIN_ID --target-user-id CURATOR_ID --role catalogue_curator --reason "catalogue operations"
```

Rotation grants and verifies the successor before revoking the predecessor and all predecessor
Better Auth database sessions:

```powershell
npm run catalogue:roles -- rotate --environment development --actor-user-id ADMIN_ID --predecessor-user-id OLD_ID --successor-user-id NEW_ID --role admin --reason "operator rotation"
```

`revoke` uses the same actor/target/role arguments and refuses to remove the last active admin.
`break-glass` accepts the bootstrap-style operator arguments, always grants `admin`, and produces a
distinct audit action. Phase 9 must replace these local guards with the approved hosted maintenance
procedure before external beta access.

## Issue and moderation workflow

Any authenticated user may submit one of the allowlisted issue types. Intake is private and limited
to five reports per user in a rolling hour, enforced transactionally with a per-user advisory lock.
Optional details are limited to 1,000 characters and evidence references to 500. Curators and admins
may triage, correct, quarantine/unquarantine, and close reports. Only admins may merge/reverse,
exceptionally remove, or migrate category.

Category migration requires quarantine first and the explicit `quarantine-and-repair` impact
policy. Exceptional removal uses a persistent, explicitly reversible hidden tombstone for imported
or referenced identities so later imports cannot restore it and source/ranking history remain
intelligible. Physical deletion remains reserved for a later narrowly validated unreferenced
synthetic-record cleanup command.

## Merge and repair invariants

A merge creates a cycle-checked canonical redirect, hides the duplicate from new search and serving,
adds the canonical visited membership where needed, and supersedes the duplicate only in the active
visited projection. It does not rewrite immutable revisions or comparisons. Every affected list gets
a targeted repair request, and source membership, private comments, and historical evidence remain
stored.

Reversal disables the redirect and membership supersessions. A canonical membership created only by
the merge is removed when no later comment, comparison, or revision depends on it; otherwise it is
preserved and a targeted repair is requested. Both merge and reversal enqueue category artifact
invalidation records.

## Audit and testing

`catalogue_change` is append-only at the database level. Entries include actor/role or local operator
reference, environment, source identities, before/after effective fields, structured reason and
evidence, linked report, impact counts, and reversal lineage. Personal-comment content is never
copied into this audit.

Run the Phase 2B database suite against the isolated PostgreSQL service:

```powershell
docker compose up -d db-test
npm run test:db
```

The suite covers environment/verification guards, last-admin protection, session revocation,
private issue rate limiting, allowlisted overlays, upstream reconciliation, append-only audit,
authorization, merge projection and cycle prevention, reversal, category migration, exceptional
removal, and the Phase 2A persistence invariants.
