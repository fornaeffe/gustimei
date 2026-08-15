# Phase 3 local rights procedure

Status: operator-run procedure for local and test environments through Phase 8. Self-service UI and hosted archives remain Phase 9 work. Do not use genuine preference, comment, review, notice, or evidence data until this procedure has been exercised with synthetic fixtures.

## Identity and scope

1. Work only from an authenticated request made by the account holder. Confirm the current Better Auth session and re-confirm the account email out of band before an operator acts.
2. Resolve the immutable Better Auth user ID. Never select an account from a public pseudonym, display name, notice text, or partial email match.
3. Create a `privacy_request` record with a one-way requester reference, request type, narrow scope, operator reference, and `received` state. Do not copy request content into this audit row.
4. Use a dedicated local/test database backup and the same services listed below. Never print verification/reset links, case tokens, allegations, review/comment text, or evidence bytes to ordinary logs.

## Supported operations

- **Access/export:** call `AccountRightsService.exportAccount(userId)` and write its canonical JSON result directly to a requester-only destination. It includes account and registration records, rankings, private comments, review versions/declarations, and authored case records. Restricted evidence is represented by minimized metadata; evidence bytes require a separately authenticated case-party export.
- **Processing restriction:** call `ProcessingRestrictionRepository.restrict` once for each affected category and contribution purpose, then invalidate/rebuild affected recommendation artifacts through the existing contribution-policy boundary. Record only the requested scope and reason code in the audit.
- **Review withdrawal/redaction:** call `ReviewService.withdraw` as the authenticated author. Use `ReviewPrivacyService.eraseAccount` only for account erasure; it applies documented case holds and redacts unheld review content.
- **Evidence deletion:** call `ReviewModerationService.deleteEvidence` with the evidence ID and authenticated uploader role. The service checks case-party access, removes bytes, timestamps deletion, and appends an access-purpose record.
- **Ranking-category deletion:** call `RankingRepository.deleteCategory(userId, category)`. The database cascades that category's revisions, evidence links, memberships, and private comments; public reviews remain independent.
- **Account erasure:** first record the request, then call `ReviewPrivacyService.eraseAccount(userId)`. This removes the Better Auth account/session and account-linked product data, removes public visibility immediately, and retains only content covered by a narrow expiring case hold. Trigger recommendation evidence exclusion/rebuild and record completion without deleted content.

## Completion check

Re-query by immutable user ID, verify the requested scope, verify evidence-store deletion when relevant, and mark the privacy request `completed` with a timestamp. For erasure the audit row remains with `user_id = null` and its one-way requester reference. A second execution must be harmless or produce a clear already-completed/not-found result. Store the requester-facing export outside source control and delete the operator copy after confirmed delivery.
