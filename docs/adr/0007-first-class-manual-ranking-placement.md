# ADR 0007: First-class manual ranking placement

- Status: accepted
- Date: 2026-09-02
- Ranking engine: `ranking-v3-manual-placement`
- Recommendation artifact schema: `2`

## Context

Directly moving a restaurant expresses “place this restaurant here in my ordering.” It is not a
sequence of separately answered comparison questions. Expanding a long move into one comparison
per crossed restaurant would fabricate provenance and would give one gesture quadratic or
path-dependent influence in recommendation training.

The comparison-only v2 implementation already exposed two related problems. Adjacent tier changes
were persisted as comparisons even though they were list-placement statements, and recommendation
artifacts reconstructed tiers from direct-comparison win totals instead of consuming the
authoritative current revision. A revision with a small unresolved gap also opened a full rebuild,
which could ask many unrelated questions.

## Decision

### Evidence and revision semantics

A manual move is an immutable `ManualPlacementEvidence` fact attached to the successor ranking
revision. It records the base revision, moved place, destination meaning, immutable tier snapshots,
retired comparison IDs, and capture time. It is stored separately from `comparison_evidence`.

The destination is one of:

- `between-tiers`, with the immediately upper and lower tier snapshots (either may be empty at an
  end of the list);
- `into-tier`, with the complete tier snapshot to which equality was explicitly asserted.

The successor revision's ordered tiers are authoritative. For a strict interior placement, the
compact semantic projection is at most the two boundary constraints “below the upper tier” and
“above the lower tier.” At an end it is one boundary constraint. These constraints are not persisted
as ordinary comparisons and crossed places do not become independent wins.

For example, moving `E` in `A > B > C > D > E` to between `A` and `B` records one placement whose
boundaries are `A > E` and `E > B`. Existing `B > E` and `D > E` evidence is retired as incompatible;
`E > D` is transitive and is not added as another observation.

All active comparison evidence inconsistent with the placed tiers is retained historically with an
`invalidated` disposition. It is not treated as a pending cycle: the newer direct placement is the
user's explicit correction. Existing invalidations remain retired in later revisions.

Manual placement is available only when the current revision is fully resolved, has no pending
repair, and has no open ranking session. The base revision ID is an optimistic concurrency guard.
A no-op destination is rejected. Undoing a committed move, if added later, must publish another
successor fact rather than mutate history.

Removing or inserting a place preserves the authoritative retained tier sequence through a placed
successor revision. This prevents later maintenance from losing relations established by manual
placement merely because no synthetic pairwise records exist for them.

### Ties

Insertion boundaries always mean strict placement. Equality is exposed through a separately labelled
“Make equal with position” target and creates an `into-tier` fact. Moving one member out of a tied
tier splits only that member; it never destroys the remaining tier. Dropping into the same source
tier is a no-op and is unavailable.

### Interaction

The ranking page provides all of the following over the same server action:

- conventional dragging from a dedicated handle to an insertion boundary;
- click/tap pick-up mode with a fixed viewport control, normal scrolling, highlighted nearest
  boundary, explicit confirmation, and cancellation;
- keyboard pick-up with Arrow Up/Down and Home/End boundary navigation, Enter/Space confirmation,
  and Escape cancellation;
- retained adjacent move controls and single-place comparison-based reranking.

The click/tap mode is the non-dragging single-pointer alternative required by
[WCAG 2.2 Success Criterion 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).
Native list and button semantics are retained rather than wrapping restaurant-card controls in a
`listbox`.

### Recommendation input

The policy-enforced recommendation boundary emits one normalized resolved tier ranking per eligible
current revision. Recommendation artifact schema 2 consumes those tiers directly and computes
support by distinct contributing users. It no longer reconstructs order from comparison win totals.

Consequences:

- users with the same current resolved ranking contribute the same order regardless of whether it
  came from comparisons, insertion, adjacent controls, or manual placement;
- a long move is one ranking revision, not many independently weighted wins;
- skipped, unresolved, superseded, invalidated, quarantined, and non-current data remain excluded by
  the existing policy boundary;
- the artifact and category engine versions change so stale generated artifacts cannot be served.

### Partial-order completion

When a revision has a small unresolved relation but no contradiction, “continue ranking” opens one
targeted `completion` comparison. It no longer starts a full-list rebuild. Explicit rebuild remains a
separate user action.

## Persistence and migration

Migration 0013 adds `manual_placement_evidence` and the `manual-placement` analytics event. Migration
0014 adds the `completion` session purpose and `order-completion` request reason. Existing local
ranking rows are intentionally reset because development backward compatibility was explicitly not
required. Artifact schema 2 makes generated schema-1 recommendation files cache misses; they are
ignored and lazily replaced instead of being reinterpreted.

## Consequences and follow-up

The ranking domain gains a stronger separation between elicited comparisons, direct placement, and
derived tier projections. Persistence and tests are slightly larger, but provenance, contradiction
handling, model weighting, and subsequent maintenance are coherent.

Human validation is still required for long-list touch scrolling, native pointer dragging across
browsers, focus recovery after enhanced submission, screen-reader announcements, and comprehension
of the separate equality target. These are Phase 9 usability gates rather than reasons to weaken the
domain contract.
