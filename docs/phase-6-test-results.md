# Manual tests results report for phase 6 (reviews)

## Approved moderation clocks

These product/engineering SLAs were approved on 2026-08-29 and are now persisted by the review
workflow. Hosted-provider compliance remains a Phase 9 operational measurement gate.

| Target                           |     Approved SLA | Starts at                                                                              |
| -------------------------------- | ---------------: | -------------------------------------------------------------------------------------- |
| Party evidence/submission window |          14 days | Notice submission                                                                      |
| Initial moderation decision      |          30 days | Notice submission                                                                      |
| Review publication lifetime      | 2 calendar years | Initial publication of that generation                                                 |
| Evidence retention               |          90 days | Final case closure                                                                     |
| Notifier case-token lifetime     |           7 days | Token issuance; a matching notifier may request a fresh token without case enumeration |
| Redress submission window        |          30 days | Moderation decision                                                                    |
| Redress decision                 |          30 days | Redress submission                                                                     |

## Implementation follow-up

Issues found in this exercise were fixed in the Phase 6 workflow on 2026-08-29. Rows marked
“retest pending” preserve the human result rather than claiming a new manual pass. Deterministic unit
and PostgreSQL integration tests now cover the clocks, token recovery, invalid evidence validation,
decision projection, notifier redress authorization, and concurrent duplicate redress.

A later false-403 regression was traced to the development database being two migrations behind:
the redress-deadline backfill was blocked by the decision append-only trigger while staff-role rows
remained active. Migration 0007 now uses the trigger's transaction-scoped metadata-maintenance path,
and the development database has migrations 0007 and 0008 applied without removing role or case
data. Moderation loaders now reserve 403 for typed authorization failures, return 404 for a missing
case, and allow unexpected database failures to reach the server error boundary. A read-only
migration-parity guard runs before local and production startup to prevent recurrence. Staff access
remains pending a short browser retest after refreshing the application.

| Excercise                                                                                     | Status        | Details                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Submit a valid general notice                                                                 | PASSED        | Submission receives a case reference immediately                                                                                                                                                                                              |
| Submit an owner/delegate notice                                                               | PASSED        |                                                                                                                                                                                                                                               |
| Submit an anonymous notice                                                                    | RETEST PASSED | Anonymous success copy no longer asks the user to save a nonexistent case link.                                                                                                                                                               |
| Submit a duplicate retry                                                                      | PASSED        | non-anonymous notifier gets exactly one acknowledgement, retry does not create duplicate cases or messages                                                                                                                                    |
| Submit author and notifier statements just before the 14-day deadline, then try just after it | SKIPPED       | The UI shows the deadline in a not-so-readable format. Tests that require clock shift are better performed in an isolated automated environment.                                                                                              |
| Upload and open clean evidence                                                                | PASSED        | Fixed relative evidence links that crashed SvelteKit `resolve` after a file became clean. Moderator and party views now share an absolute, localized, parameter-encoded evidence path builder.                                                |
| Upload rejected/oversized/disallowed evidence                                                 | RETEST PASSED | File type, size, and filename are validated before notice creation. The user must remove or replace invalid optional evidence and resubmit. Infrastructure failure after accepted metadata remains recoverable from the case page.            |
| Assign a case                                                                                 | PASSED        | The case UI now keeps moderator self-assignment and gives administrators an active-moderator select for assignment/reassignment; revoked roles are excluded and the service enforces the boundary.                                            |
| review both sides’ permitted material                                                         | PASSED        |                                                                                                                                                                                                                                               |
| Issue "retain", "restrict", "remove", "restore" outcome                                       | RETEST PASSED | Party views now show outcome, scope, duration, ground, policy version, reasoned explanation, material facts, automation disclosure, decision time, and redress deadline. Visibility still changes transactionally.                            |
| Try deciding with the wrong moderator                                                         | RETEST PASSED | Authorization remains server-side; feedback is now rendered beside the decision form.                                                                                                                                                         |
| Try deciding without required reasons                                                         | RETEST PASSED | The decision form now gives a consistent required-field instruction and retains native focus/validation for each required control.                                                                                                            |
| Trigger acknowledgement, author notice, decision, and reinstatement messages.                 | PASSED        | Each intended recipient gets one correctly scoped message                                                                                                                                                                                     |
| After removal, have the author request reconsideration                                        | PASSED        |                                                                                                                                                                                                                                               |
| After removal, have the notifier request reconsideration                                      | RETEST PASSED | Named form actions now preserve the notifier token through the post/load cycle, preventing the false 403 after a successful request.                                                                                                          |
| Attempt duplicate redress                                                                     | RETEST PASSED | This was a data-integrity race. A partial unique database index now permits only one canonical request per decision and party. Migration preserves older duplicates as historical rows, while the service returns an understandable conflict. |
| Attempt case closure while redress is open                                                    | PASSED        | the case cannot close with open redress                                                                                                                                                                                                       |
| Expiry, Evidence deletion tests                                                               | SKIPPED       | Tests that require clock shift are better performed in an isolated automated environment.                                                                                                                                                     |
| Non-arbitrary treatment                                                                       | POSTPONED     | This tests should be performed with the real admin/moderation panel at phase 9                                                                                                                                                                |
| Attempt direct URL/ID substitution                                                            | PASSED        |                                                                                                                                                                                                                                               |
