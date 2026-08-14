# ADR 0001: tier-aware stable merge ranking engine

- Status: accepted for the initial implementation
- Date: 2026-08-14
- Version: `ranking-v1-merge-tiers`

## Context

The personal ranking must be deterministic and resumable, distinguish strict preference, explicit
equivalence, and unresolved comparison, and keep unaffected evidence usable during repair. It must
also support undo and efficient insertion without coupling the ranking workflow to recommendation
scoring.

## Decision

Use a framework-independent, bottom-up stable merge session for initial ordering. Persist the
versioned session state after each answer. The session's internal merge order is only a question
scheduler; a published revision is always reconstructed from active evidence, never from the
scheduler's provisional order.

Represent explicit ties as atomic equivalence tiers over a comparison graph. A skip creates no edge
and therefore leaves the relation unresolved. For contradictory evidence, retain the newest
consistent answers, temporarily exclude the oldest conflicting edge, and produce the smallest
repair requirement. A later transitive conflict with an explicit tie opens tie repair and never
silently dissolves the tier.

Insert one new place by binary-searching existing tiers. A tie with a tier of more than one place is
confirmed against a second deterministic member. Skip or disagreement during confirmation produces
a local repair result. Retain the proposed broader-rebuild boundary of `max(5 tiers, 25% of the
list)` and do not cap personal-list size.

Progress is explicitly an estimate. Initial ordering uses the merge-sort worst-case bound
`n * ceil(log2(n)) - 2^ceil(log2(n)) + 1`; insertion uses the logarithmic tier-search bound plus one
possible tie confirmation. Completion always reports 100%, regardless of whether skipped evidence
means the resulting revision has partial coverage.

## Evidence

Deterministic exhaustive/synthetic tests cover permutations and input shapes at 2, 3, 10, 25, and
64 places, including ordered, reverse, tied, skipped, contradictory, undo, and serialized resume
flows. Observed initial comparison counts were:

| Places | Ordered | Reverse | Adjacent ties |
| -----: | ------: | ------: | ------------: |
|      2 |       1 |       1 |             1 |
|      3 |       3 |       2 |             2 |
|     10 |      21 |      15 |            13 |
|     25 |      68 |      54 |            40 |
|     64 |     192 |     192 |           112 |

Strict middle insertion used 3 questions for 10 tiers, 4 for 25 tiers, and 7 for 128 tiers. The
second-member confirmation is retained because it detects an answer that would otherwise merge a
new place into a pre-existing multi-item tier on only one comparison. The fallback window threshold
did not force a rebuild in the small contradiction fixtures and remains deliberately versioned so
Phase 5–6 product measurements can revise it.

## Consequences and limitations

- Merge sessions have a reproducible worst case and are easier to resume and undo than interactive
  QuickSort pivots.
- Skips may allow the scheduler to finish while the published revision remains partial; UI language
  must use order coverage, not session completion, for that distinction.
- Synthetic consistency tests cannot estimate human error, fatigue, or repair acceptance. The tie
  confirmation and repair-window choices remain beta hypotheses.
- Revision recomputation replays active, superseded, and excluded evidence under the recorded engine
  version. A future engine publishes a new immutable revision; it never mutates the old one.
