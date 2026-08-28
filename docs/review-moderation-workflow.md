# Review moderation workflow

This guide is for review administrators and review moderators operating the internal review-case
tools. Until the hosted providers and approved production targets are validated in Phase 9, use
these screens only for synthetic, non-sensitive exercises.

## Roles and responsibilities

| Capability                                            | Review administrator                      | Review moderator                         |
| ----------------------------------------------------- | ----------------------------------------- | ---------------------------------------- |
| Open the moderation queue and cases                   | Yes                                       | Yes                                      |
| Assign an unassigned case to self                     | Yes                                       | Yes                                      |
| Assign or reassign a case to another active moderator | Yes                                       | No                                       |
| Review statements and scan evidence                   | Yes                                       | Yes                                      |
| Verify an owner/delegate assertion                    | Yes                                       | Yes                                      |
| Apply a documented interim restriction                | Yes                                       | Yes                                      |
| Record a decision                                     | Yes, including a coverage override        | Only when unassigned or assigned to them |
| Grant or revoke review roles                          | Yes, through the audited terminal command | No                                       |

A catalogue curator is not a review moderator. Catalogue-curator access alone must not reveal the
moderation queue or case material. An active catalogue administrator is treated as a review
administrator, but ordinary catalogue-curator permissions do not cross this boundary.

## Before starting

1. Sign in with a verified account that has an active `admin` or `review_moderator` review role.
2. For local synthetic exercises, install the synthetic policy and provision roles as described in
   [Phase 2C review operations](phase-2c-reviews.md#local-setup-and-verification).
3. Open `/internal/reviews/moderation`. The queue shows active cases, priority ordering, deadlines,
   overdue state, and the current assignee.
4. Keep notifier case links and evidence out of logs, screenshots, tickets, and chat. Use only
   synthetic evidence in development.

## 1. Triage and assign the case

Open a case from the moderation queue. Read the exact reported review version, notice kind, alleged
ground, explanation, owner/delegate assertion, submission deadline, and existing timeline before
taking action.

- On an unassigned case, a moderator can select **Assign to me**.
- An administrator can instead choose any active review moderator or review administrator from
  **Assign or reassign this case**, then select **Save moderator assignment**.
- On an active case already assigned to somebody else, only an administrator can reassign it. This
  is the conflict, absence, and coverage-handover path.
- Revoked users are not offered in the assignment list. Assignment and reassignment are recorded in
  the restricted audit timeline.

Do not treat assignment as a decision or as proof that the allegation is true. A submitted notice
normally leaves the review public unless a separately justified interim restriction is necessary.

## 2. Check the bilateral submission window

The author uses `/reviews/manage`; the notifier uses the case-scoped link sent in the
acknowledgement. Each party can submit a statement and optional evidence until the displayed
submission deadline.

In the internal case, compare the parties' statements without disclosing one party's evidence or
contact details to the other. Evidence is optional: a case can be decided from sufficiently reliable
statements and other facts. Never demand a receipt merely because the upload area exists.

## 3. Review evidence safely

New evidence starts as `pending` and cannot be opened. Inspect it through the approved synthetic
exercise process, then choose **Mark clean** or **Reject**. Only `clean` evidence has an internal open
link. Every successful evidence read is audited.

The local development evidence store is memory-only. Keep the development server running during an
exercise; after a restart, database metadata may remain while the file bytes are intentionally gone.
Do not copy evidence into general storage or error reports.

## 4. Verify owner or delegate status

If the notice claims owner/delegate status, enter a concise reason code and choose **Verify** or
**Reject**. This verifies only the asserted relationship for case handling. It does not establish the
truth of the allegation and must not determine the outcome by itself.

## 5. Decide whether an interim restriction is necessary

Use **Apply interim restriction** only when documented, objective risk makes temporary removal
necessary while the case remains open. Enter a reason code that another reviewer can understand.
Do not restrict automatically because a notice was filed, because the notifier is an owner, or
because the review is unfavorable.

## 6. Record the human decision

Review the exact version, both statements, any clean evidence, prior events, and comparable cases.
Then complete every decision field:

- **Outcome:** `no-action`, `restrict`, `remove`, or `restore`.
- **Scope:** what content or publication the decision covers.
- **Duration:** complete this when the restriction is time-bounded; otherwise leave it empty only
  when the policy permits that outcome to be indefinite.
- **Ground:** the applicable policy or legal ground.
- **Reasoned explanation:** connect the established facts to the outcome in language the parties can
  understand.
- **Facts relied on:** identify the material considered without reproducing restricted evidence.
- **Automation disclosure:** state what automation, if any, assisted routing or file scanning. The
  final decision is human.

Choose **Record and notify decision** once. The service saves an immutable decision version, changes
publication visibility as required, and queues separate author/notifier notifications. In local
development, `/dev/mailbox` previews those messages instead of sending external email.

## 7. Handle redress and reinstatement

After a decision, either party can request redress from its authorized case view. A redress request
appears in the internal case. Reassess it against the same policy and record a new decision; the new
version supersedes the previous decision without deleting history. Use `restore` when reconsideration
supports reinstatement. An expired review remains expired even if the moderation restriction is
lifted.

## 8. Close the case

Choose **Close case** only after a decision exists and no redress request remains open. Closure sets
the evidence-deletion deadline; it does not immediately erase immutable decision and audit facts.
Deletion workers and retention boundaries are deterministic locally, but hosted timing and durable
deletion are Phase 9 release tests.

## Expected states and common failures

| State                  | Meaning                               | Normal next action                  |
| ---------------------- | ------------------------------------- | ----------------------------------- |
| `awaiting-submissions` | Parties may still submit material     | Assign and monitor the deadline     |
| `under-review`         | A moderator owns the active review    | Review facts and decide             |
| `decided`              | A reasoned decision was recorded      | Handle redress or close             |
| `closed`               | Decision and redress work is complete | Retention/deletion workers continue |

- If the administrator cannot see **Assign or reassign this case**, confirm the account has an
  active review `admin` role in the current `APP_ENV`, then sign in again if its sessions were revoked
  during role rotation.
- If a newly granted moderator is absent from the select, confirm that the target account exists and
  that its `review_moderator` assignment is active in the same environment. Reload the case afterward.
- If assignment reports that the case changed, another operator updated it concurrently. Reload and
  review the new assignee before retrying.
- If a moderator receives “case is assigned to another moderator,” ask an administrator to perform a
  documented reassignment; do not bypass the assignment with a crafted request.

## Exercise record

For each synthetic exercise, record the case reference, roles used, state transitions, provisional
timings, notification previews, outcome/reason consistency with a paired comparable case, redress
result, and authorization attempts. Never put notice text, email addresses, tokens, filenames, or
evidence contents in the exercise report. Local timings are diagnostics, not proof of production SLA
compliance.
