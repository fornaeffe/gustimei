# Manual tests results report for phase 6 (reviews)

| Excercise                       | Status | Details                                                                                                    |
| ------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| Submit a valid general notice   | PASSED | Submission receives a case reference immediately                                                           |
| Submit an owner/delegate notice | PASSED |                                                                                                            |
| Submit an anonymous notice      | PASSED | After notice submission, the page still shows "Save case link" even if no case link is given.              |
| Submit a duplicate retry        | PASSED | non-anonymous notifier gets exactly one acknowledgement, retry does not create duplicate cases or messages |

| Submit author and notifier statements just before the 14-day deadline, then try just after it | POSTPONED | The UI shows the deadline in a not-so-readable format. Tests that require long timespans are postponed to phase 9. |
| Upload clean evidence | PASSED | |
| Upload rejected/oversized/disallowed evidence | PASSED with issues | The notice is submitted even if the evidence is rejected. It should not be submitted unless the user explicitly resubmit it without evidence (or with allowed evidence). Failure does not expose internal storage details. |

| Assign a case | PENDING RETEST | The case UI now keeps moderator self-assignment and gives administrators an active-moderator select for assignment/reassignment; revoked roles are excluded and the service enforces the boundary. |
