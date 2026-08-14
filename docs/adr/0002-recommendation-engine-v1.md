# ADR 0002: category-specific initial recommendation engines

- Status: accepted for implementation, pending internal and private-beta validation
- Date: 2026-08-14
- Restaurant version: `recommendation-restaurant-nearest-neighbor-v1`
- Hotel version: `recommendation-hotel-bradley-terry-v1`

## Context

The provisional leading candidate was a low-rank generalized Plackett–Luce model with explicit ties.
Phase 1 required it to win deterministic held-out synthetic metrics before adoption and required a
documented replacement otherwise.

## Decision

Use common-place nearest-neighbor rank aggregation as the initial restaurant implementation and a
regularized low-rank Bradley–Terry preference-completion model as the initial hotel implementation.
Select the category winner lexicographically by held-out pairwise accuracy, then tie-aware Kendall
`tau-b`, then NDCG. Do not share fitted parameters or artifacts across categories.

Keep the generalized Plackett–Luce prototype, exact size-one/size-two choice likelihood, gradient
checks, regularized user/place factors, global bias, tie propensity, and fast per-user fitting in the
spike code. It remains a candidate for later data, but it is not the initial serving engine because
it did not win Phase 1's primary synthetic metric.

Retain the smoothed global prior as the non-personalized fallback. Retain the provisional
personalized-serving gate independently for each category: at least five ranked places, three
resolved tiers, and four supported place factors. Both selected models improved on the global prior
inside that gate in this benchmark.

## Evidence

The reproducible benchmark and full configuration are in
[`docs/phase-1-benchmark.md`](../phase-1-benchmark.md). On the test users:

- Restaurant nearest-neighbor: 0.614 pairwise accuracy, 0.469 `tau-b`, and 0.907 NDCG, versus 0.337,
  0.020, and 0.831 for the smoothed global prior.
- Hotel Bradley–Terry: 0.547 pairwise accuracy, 0.452 `tau-b`, and 0.928 NDCG, versus 0.453, 0.290,
  and 0.896 for the smoothed global prior.
- The tuned generalized Plackett–Luce prototype reached 0.482 restaurant and 0.507 hotel pairwise
  accuracy, so it did not satisfy the adoption rule.

## Recalculation and invalidation

Every training, support-count, evaluation, and per-user fitting input must come from the
policy-enforced `RecommendationEvidenceSource`. Artifact invalidation keys contain category,
current ranking revision, recommendation-engine version, contribution-policy version and purpose,
the include/exclude reason, and a deterministic evidence fingerprint. Personal comments cannot
enter any of those inputs.

Policy, current-revision, restriction, catalogue quarantine, account/category deletion, or engine
version changes create new invalidation inputs and require rebuilding the affected category artifact.
Old artifacts remain attributable to their recorded versions and must not be silently reinterpreted.

## Limitations

- These deterministic synthetic fixtures select implementation candidates; they do not establish
  external validity, recommendation conversion, or beta readiness.
- Restaurant nearest-neighbor calibration error was worse than the factor models. Raw similarity or
  confidence must remain internal, and later calibration is required before any confidence language.
- Hotel results are close across candidates and use only 75 held-out pairs. Phase 8–9 evaluation may
  replace the family through a new versioned ADR.
- Held-out visited places are only a proxy for unseen recommendations.
