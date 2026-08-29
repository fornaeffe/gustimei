# Manual tests results report for phase 6 (reviews)

| Excercise                       | Status | Details                                                                                                    |
| ------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| Submit a valid general notice   | PASSED | Submission receives a case reference immediately                                                           |
| Submit an owner/delegate notice | PASSED |                                                                                                            |
| Submit an anonymous notice      | PASSED | After notice submission, the page still shows "Save case link" even if no case link is given.              |
| Submit a duplicate retry        | PASSED | non-anonymous notifier gets exactly one acknowledgement, retry does not create duplicate cases or messages |

| Submit author and notifier statements just before the 14-day deadline, then try just after it | SKIPPED | The UI shows the deadline in a not-so-readable format. Tests that require clock shift are better performed in an isolated automated environment. |
| Upload and open clean evidence | PASSED | Fixed relative evidence links that crashed SvelteKit `resolve` after a file became clean. Moderator and party views now share an absolute, localized, parameter-encoded evidence path builder. |
| Upload rejected/oversized/disallowed evidence | PASSED with issues | The notice is submitted even if the evidence is rejected. It should not be submitted unless the user explicitly resubmit it without evidence (or with allowed evidence). Failure does not expose internal storage details. |

| Assign a case | PASSED | The case UI now keeps moderator self-assignment and gives administrators an active-moderator select for assignment/reassignment; revoked roles are excluded and the service enforces the boundary. |
| review both sides’ permitted material | PASSED | |
| Issue "retain", "restrict", "remove", "restore" outcome | PASSED with issues | Only outcome and reason explanation are shown; scope, ground, facts relied upon, policy version and automation disclosure are not visible from reviews/cases/[noticeId]. Visibility changes transactionally |
| Try deciding with the wrong moderator | PASSED with issues | Unassigned moderators cannot decide, but error message is displayed out of view. |
| Try deciding without required reasons | PASSED with issues | If "decisions scope" is left blank, when submitting the focus go to the "decisions scope" field, but without any messages. If other required fields are left blank, a "Fill this field" message is shown. The "Fill this field" message should be shown consistently for all required fields. |

| Trigger acknowledgement, author notice, decision, and reinstatement messages. | PASSED | Each intended recipient gets one correctly scoped message |

| After removal, have the author request reconsideration | PASSED | |
| After removal, have the notifier request reconsideration | PASSED with issues | When the notifier submits a redress request he gets a 403 error, but the redress request is correctly recorded  |
| Attempt duplicate redress | FAILED | If the user opens multiple tabs with the case status, he/she can submit multiple redress requests. It is not necessarily a must-correct issue, but we should assess if it is a real vulnerability. |
| Attempt case closure while redress is open | PASSED | the case cannot close with open redress |

| Expiry, Evidence deletion tests | SKIPPED | Tests that require clock shift are better performed in an isolated automated environment. |

| Non-arbitrary treatment | POSTPONED | This tests should be performed with the real admin/moderation panel at phase 9 |

| Attempt direct URL/ID substitution | PASSED | |

