# Phase 2C review operations

Phase 2C exposes server services and deterministic workers; product and moderator UI arrives in later phases. Do not collect genuine review, notice, or evidence data yet.

## Local setup and verification

Apply the reviewed migrations with `npm run db:migrate`. Validate a disposable isolated database with `npm run test:db`. The review tests use only synthetic place, account, review, notice, and evidence fixtures.

An approved policy record and localized declaration-policy records must exist before publication. The integration fixture demonstrates installation through `ReviewService.installPolicy`. Production policy installation requires the reviewed operations path added before beta; do not mark draft legal text approved merely to unblock UI development.

## Service boundaries

- `ReviewService`: policy installation, pseudonym setup, create/edit/substitute/withdraw, owner management, anonymous public reads, redirect resolution, query-time expiry.
- `ReviewModerationService`: exact-version notice intake, notifier tokens, party statements/evidence, owner/delegate assertion review, assignment, interim restriction, reasoned decision, redress, reinstatement, closure, expiry, and evidence deletion.
- `ReviewPrivacyService`: account erasure, immediate public removal, attribution removal, bounded case holds, and post-hold redaction.
- `ReviewOutboxWorker`: deterministic idempotent local delivery of acknowledgement, author notice, decision, reinstatement, redress, and retention messages.

Review author IDs, moderator permissions, and case-party access must be resolved by SvelteKit server hooks/actions. Never accept them from client form fields. Catalogue-curator permission does not imply review-moderator permission.

## Restricted evidence

Development and test use the ephemeral evidence adapter. It never writes to disk, the database, fixtures, snapshots, the general artifact store, or console output. Preview and production use the fail-closed adapter until Phase 9 supplies and validates a restricted encrypted provider.

Only allowlisted formats and bounded files are accepted. New objects remain unreadable while scan state is pending. Every read is audited, and a case party can read only evidence it uploaded. A case decision must not include or email the other party’s evidence.

## Workers

Run workers in bounded batches and retry safely:

1. deliver pending transactional outbox jobs;
2. expire publications whose stored expiry has passed;
3. delete evidence whose deletion deadline has passed;
4. release expired account-erasure holds and redact retained review text.

Public reads never depend on worker timing: expired, hidden/quarantined, withdrawn, removed, interim-restricted, account-erased, and collision-restricted publications are excluded at query time.

## Incident and privacy rules

- Never log review text, allegations, notifier email, case tokens, filenames, evidence bytes, or complete action URLs.
- Do not copy evidence into bug reports. Reproduce failures with synthetic fixtures.
- A notice alone does not hide a review. Any interim restriction needs an authorized actor and a documented reason code.
- Do not update immutable versions, acceptances, decisions, or events directly. The only database exception is the transaction-scoped account-erasure redaction path.
- Before restoring a backup, replay account-erasure and evidence-deletion facts before enabling public reads or worker delivery.
- Preview/production evidence failures are expected to fail closed until Phase 9 provider approval.
