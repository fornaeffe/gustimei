# ADR 0005: Public-review and notice/action foundation

- Status: accepted for local synthetic implementation
- Date: 2026-08-15
- Legal status: provisional; the policy gates below require counsel approval before genuine review or case data is collected

## Context

Public reviews are optional text publications, separate from private rankings, private personal comments, and recommendation evidence. They need stable author, publication, moderation, redress, retention, and catalogue-redirect contracts before Phase 3 and Phase 4 add product routes.

## Decision

### Aggregate and publication model

`place_review` is the author-management aggregate. The database keeps one aggregate per author and original stable place. A later visit creates a new `review_publication` generation; it does not overwrite or merge the earlier generation. An ordinary edit creates an immutable `review_version` in the same generation. Declaration acceptances and pseudonym snapshots are immutable per version.

The aggregate and publication use deferred current pointers so the complete graph can be inserted atomically. Database constraint triggers prove that a current publication belongs to its aggregate and a current version belongs to its publication. Publication identity, service date, policy, publication time, and expiry are immutable.

The strict one-author/place rule remains inexpensive and is retained. If a catalogue merge causes one author to have a review at both the source and canonical place, both aggregates are restricted from public reads and an explicit `review_catalogue_conflict` is recorded. Text is never combined or discarded. Reversing the merge reverses an unresolved collision restriction.

### Time and policy

Calendar arithmetic is centralized in `src/lib/domain/reviews/policy.ts`. The provisional local policy accepts an Italian-local service date up to 30 calendar days old, derives expiry two calendar years from publication, displays only month/year publicly, gives parties 14 days to submit, and initially schedules evidence deletion after 90 days. These values are stored in a versioned policy record and are not legal conclusions.

Public queries enforce expiry and every other visibility condition at read time. The bounded expiry worker records lifecycle/audit facts but is not required for correctness.

### Identity and authorization

The public pseudonym is application-owned and never reuses Better Auth's name or provider profile. Versions retain a pseudonym snapshot. Author service methods resolve the user ID at the server boundary, require a verified account, and never accept an author ID from review form data. Phase 3 must add its established 18+/Terms session fact before exposing publication actions.

Review moderation has a separate environment-scoped `review_moderator_assignment`. Catalogue curators receive no review permission. An application administrator may perform audited emergency review actions, but Better Auth admin/impersonation is not enabled.

### Notice, evidence, decisions, and redress

A notice targets an exact immutable version and records the exact public URL. General and owner/delegate reports share the same service. Owner/delegate status begins as an assertion and requires an explicit moderator decision. Submitting a report adds a disputed presentation label but does not remove or reorder the review.

Notifier access uses a short-lived hashed, case-scoped token. Author access is derived from the review aggregate. Each party sees only its own private submissions and evidence. Final decisions require an authorized human actor and a reasoned explanation; automation may route, deduplicate, rate-limit, or scan but cannot be the deciding actor. Reconsideration can supersede a decision, including reinstatement.

Evidence bytes use a dedicated restricted provider, never the general artifact store. Development and tests use an ephemeral in-memory adapter; preview and production fail closed. File type, size, count, checksum, scan state, access audit, and deletion deadline are enforced. The current adapter preserves bytes; format-aware metadata removal and malware tooling are Phase 9 provider-validation gates. Synthetic tests use plain text without embedded metadata.

### Privacy and isolation

Review tables have no foreign keys to rankings, comparison evidence, recommendation datasets, scores, or model artifacts. Lifecycle integration tests snapshot ranking evidence before review mutations and prove it is unchanged.

Account erasure immediately removes publications from public reads and removes account attribution. Content without a documented hold is redacted through a narrowly scoped database erasure context; immutable provenance columns remain protected. An active case creates a bounded retention hold, keeps content restricted, and redacts it when the hold expires. Restored backups must replay the same erasure/hold records before serving.

### Outbox and rate limits

All review/case communication is represented by idempotent transactional-outbox and notification records. Payloads contain case references and short-lived case tokens, not evidence or full allegations. Local delivery is deterministic. Purpose-scoped rate-limit contracts share result semantics but keep author mutation, notice, party message, evidence, moderator action, and redress budgets distinct.

## Consequences

- Phase 3 and Phase 4 can build forms and public reads without changing review persistence.
- Review policy/copy changes create new versioned policy and declaration records.
- Catalogue merge completion can expose an explicit review conflict that needs author/moderator resolution.
- Preview/production evidence upload remains unavailable until a restricted provider passes Phase 9 operational validation.
- Public pseudonym governance, final legal time arithmetic, moderation grounds/severity, anonymous-notice handling, and final retention periods remain launch gates.

## Rejected alternatives

- Storing review text on ranking membership: rejected because review publication must not require or affect a ranking.
- Mutable review rows: rejected because notices and decisions must target exact historical text and declarations.
- Combining reviews after a catalogue merge: rejected because it destroys provenance and can misrepresent the author.
- Removing a review automatically when reported: rejected because a report is an allegation, not a decision.
- Reusing Better Auth admin or profile fields: rejected because authentication, public identity, and least-privilege moderation are separate concerns.
