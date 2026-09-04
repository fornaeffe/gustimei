# Human gates and operations before Phase 9 implementation

Date: 2026-09-03

Do not begin Phase 9 implementation merely because automated Phase 8 checks pass. A named owner must
complete every applicable row below, attach dated evidence outside the repository when it may contain
personal/security data, and record an explicit pass, approved fallback, or blocking decision. Use
fictional data until the legal/research gates authorize real beta data.

## 1. Product journeys on real devices

- On current iOS Safari, Android Chrome, desktop Safari/Chrome/Firefox, and at 200% browser zoom,
  complete registration, verification, sign-in/reset, selecting two and many visited restaurants,
  pairwise ranking, tie/skip/undo, manual press-drag placement, click/tap/keyboard placement,
  insertion, removal, resume, concurrent-tab conflict, and session supersession. Confirm focus,
  scrolling, reduced motion, back navigation, refresh recovery, and Italian/English copy.
- Verify the picked-up ranking card stays aligned without list-height or scroll jumps, every allowed
  between/into-tier target is reachable by pointer and keyboard, cancellation changes no evidence,
  one successful placement dismisses move mode, and a later handle works without reloading.
- With screen readers (VoiceOver and NVDA or TalkBack), keyboard only, high contrast, dark mode, and
  200/400% zoom, verify landmarks, headings, names, errors, focus order, live feedback, dialogs,
  map alternatives, drag alternatives, touch targets, and that colour/position is never the only cue.
- Confirm the compact typography scale remains readable across the smallest phone and wide desktop,
  including captions, map labels, error feedback, and legal copy. Record any category-specific exception
  rather than adding an ad-hoc new size.

## 2. Map, catalogue, and recommendation comprehension

- Load the full local Italy restaurant candidate universe on representative low-end mobile hardware
  over throttled 4G. Record p50/p95 server latency, browser interaction latency, memory, payload,
  map clustering, list paging, and database query plans; compare them with approved invitation gates.
- Confirm marker density, touch-target comfort, dark-mode tile contrast, map-versus-list mental model,
  initial whole-candidate-universe framing, locality filtering, search wording, attribution visibility,
  and the path from an unseen restaurant to visited/insertion. Sparse locality results must clearly
  offer the unfiltered order.
- Test 24-result pages, deep cursor navigation, refresh mid-session, a retired artifact, catalogue
  change, ranking change, new unsupported visited place, and multiple tabs. The order must be stable
  or fail explicitly, never silently restart under a different snapshot.
- Ask participants to explain “predicted order,” “community-based,” and “insufficient evidence.” They
  must not interpret the result as their personal ranking, a public rating, certainty, or a function
  of review text/volume. Confirm explanations are useful without exposing raw support/confidence.
- Review leakage-safe diagnostics and the provisional five-place/three-tier/four-supported-place
  gate. Decide whether evidence justifies the restaurant model/gate for a private beta or requires a
  documented ADR change. External accuracy claims remain prohibited until Phase 9 beta evidence.
- Complete the OSM licence/attribution review, Geofabrik provenance/checksum audit, locality-boundary
  audit, import idempotency/atomic promotion/failure recovery test, and provider terms/capacity review.
  Choose an approved tile/geocoder provider or explicitly approve the documented low-traffic fallback.

## 3. Review, moderation, and non-arbitrary treatment

- With fictional reviews, repeat valid, owner/delegate, anonymous, invalid, and duplicate notices.
  Confirm rejected submissions identify the exact field and reason beside the action, anonymous copy
  promises no unavailable case link, and retries create neither duplicate cases nor messages.
- As author, notifier, unrelated user, moderator, conflicted moderator, revoked moderator, and admin,
  attempt direct URL/ID substitution and every case/evidence action. Each audience must see only its
  own permitted statements/evidence; unauthorized and cross-party access returns the intended
  non-enumerating response and creates no disclosure in UI, email, logs, or analytics.
- Upload valid, oversized, empty, disallowed, malicious-marked, and metadata-bearing evidence. Verify
  limits, quarantine/scan state, filename handling, metadata stripping decision, download headers,
  read audit, replacement/deletion, checksum, and no bytes in logs, snapshots, exports, or general
  artifact storage.
- Exercise assignment/reassignment, moderator absence, conflict/recusal, backlog ordering, overdue
  labels, interim restriction, and full retain/restrict/remove/restore decisions. Every party view
  must show outcome, scope, duration, ground, policy version, material facts, reasoning, automation
  disclosure, decision time, and redress deadline without presenting an allegation as fact.
- Remove then restore through author and notifier redress; try duplicate and concurrent redress and
  closing with redress open. Verify exactly one canonical request, human reassessment, both-party
  notification, transactional visibility, and that an expired publication never reappears.
- Give two moderators materially comparable fictional cases in different order. Independently record
  their decisions/reasons, reconcile discrepancies against policy, and have the moderation owner sign
  the non-arbitrary-treatment result. This previously postponed human test is mandatory.
- Use deterministic clock fixtures to inspect just-before/after 7-, 14-, 30-, 90-day and two-calendar-
  year boundaries, including leap/date display behavior. Human-readable Italian/English dates must
  agree with stored UTC deadlines. Hosted delivery/deletion lag is tested only after Phase 9 exists.

## 4. Rights, privacy, analytics, and recovery

- Following `docs/phase-3-rights-runbook.md`, authenticate a fictional requester and perform access
  export, restriction, restaurant-category deletion, review withdrawal, and account erasure. Verify
  exact scope: rankings/comments, review versions/declarations, the requester’s case records, minimized
  evidence metadata, public removal, session revocation, holds/redaction, and recommendation exclusion.
- Repeat export/erasure to prove idempotent behavior. Confirm another account cannot obtain it and no
  export lands in GitHub artifacts, logs, screenshots, shared storage, or the repository. Delete the
  operator copy after confirmed delivery.
- Restore a pre-erasure local backup into the isolated drill database, replay tombstones before reads
  or workers, and prove erased public review/content, personal comments, live data, evidence, and
  recommendation contribution do not return. Record table-level integrity without recording content.
- Inspect every product analytics event and report. Only the allowlisted coarse vocabulary, category,
  immutable environment/cohort provenance, and non-identifying operational measures may exist. Prove
  absence of place/search/review/case/evidence text, pairs, coordinates, email, URLs, pseudonyms,
  declarations, persistent review/case IDs, third-party trackers, marketing tags, and session replay.
- Run privacy/security scans and inspect browser/network logs for forbidden data leakage. Verify CSP/
  headers, CSRF/origin behavior, cookies, rate limits, evidence upload abuse limits, dependency and
  container scans, authorization query plans, and that preview/production local providers fail closed.

## 5. Local operations and release rehearsal

- From a clean clone, run `npm ci`, `npm run rehearse:phase8`, and `npm run deployment:validate` with a
  secret-free synthetic production environment. Archive only the pass/fail summary, commit SHA,
  image digests, durations, and test counts. A failure or flaky rerun blocks the handoff.
- Inspect both images as non-root users, verify the app filesystem is read-only, SIGTERM drains within
  the configured timeout, Caddy is the only public service, PostgreSQL has no host port, readiness
  fails when the database is unavailable, and logs contain no secrets or sensitive fixture content.
- Provision the four database roles in a disposable PostgreSQL instance. Prove runtime cannot DDL,
  backup cannot write, migration is not used by the app, operator is separately audited, the deploy
  principal has no database credential, and no co-hosted app/network/user/database/volume can access
  GustiMei resources.
- Simulate duplicate/concurrent catalogue, model, review-maintenance, backup, deploy, and rollback
  operations. Confirm locks/idempotency, bounded retry, minimum-payload monitoring, previous-good
  import/artifact preservation, no partially promoted state, and an actionable failure exit.
- Execute deploy and rollback in a disposable host directory using digest-qualified images. Verify
  approval/concurrency, migration compatibility check, pre-change backup, health/smoke gate, atomic
  current revision, audit record, and rollback to the exact prior digest. Test the incompatible-
  migration stop path; never improvise a down migration.
- Perform encrypted dump upload and isolated restore with the exact proposed `age`/R2 tools. Prove no
  plaintext staging, checksum verification, offline-key recovery, tombstone replay, seven-nightly plus
  four-weekly selection, safe retry, surplus deletion, and recovery within the proposed RPO/RTO.
- Disable Better Stack/network access during a successful domain job, then restore it. The domain
  result must remain correct, the check-in must be retryable without sensitive payload, and the owner
  must receive the expected missing/failed alert. Test uptime, backup, review maintenance, evidence
  deletion, catalogue, and recommendation monitors plus primary/backup escalation.

## 6. Decisions and approvals that block Phase 9

- Approve recurring beta budget with taxes/headroom for netcup, Cloudflare DNS/R2, Brevo, Better
  Stack, backups, and incident contingencies.
- Confirm VPS plan (approximately 4 vCPU, 8 GB RAM, 250 GB NVMe), region, Ubuntu/Debian and version,
  filesystem, patch/reboot window, firewall/SSH policy, disk/RAM/CPU reservations, and isolation from
  co-hosted apps.
- Approve numeric invitation gates for p50/p95 latency, uptime, email delivery, DB size/connections,
  disk headroom, backup RPO/RTO, restore time, object/evidence deletion lag, job lateness/failure,
  catalogue import, and model rebuild. Name warning/critical thresholds and who may waive them.
- Approve beta locality, cohort size/composition, recruitment, consent/research script, incentives,
  support route, stop criteria, success interpretation, and strict separation of internal/synthetic,
  research, private-beta, and general-release denominators.
- Obtain legal approval—or activate a written fallback before invitations—for reciprocal contribution,
  18+ approach, Terms/notices, controller/provider processing, EU R2 setup, retention, research/data
  procedures, final review/declaration/authenticity copy, date arithmetic, DSA classification/redress,
  owner/delegate verification, grounds/SLAs, transparency, evidence/audit retention, and final AGCM
  guidance. Any unresolved counsel gate blocks external invitations.
- Name primary and backup owners for netcup, Cloudflare, GitHub, Brevo, Better Stack, Google OAuth,
  billing, credential recovery/rotation, vulnerability patching, incident command, privacy requests,
  moderation escalation/recusal, deployment approval, backup restore, and rollback. Exercise account
  recovery and successor-before-predecessor role rotation without removing the last administrator.

When all rows are signed, update `IMPLEMENTATION_PLAN.md` with the evidence date, approved thresholds,
owners, fallbacks, and remaining Phase 9-only provider work. Until then, Phase 8 can be technically
complete while Phase 9 implementation remains gated.
