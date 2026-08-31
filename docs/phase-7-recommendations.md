# Phase 7 recommendation implementation

Date: 2026-08-31

## Accepted serving contract

- Restaurant serving keeps the Phase 1 winner, common-place nearest-neighbor aggregation, with the
  smoothed global prior as the fallback. The Phase 1 ADR remains provisional until beta; Phase 7
  does not replace it with the factor model selected for hotels.
- Real and synthetic evidence are built into separate artifacts. Every input is obtained through
  `DatabaseRecommendationEvidenceSource` for either community training or current-user
  personalization. The artifact format contains no comment or review fields.
- The candidate universe is the 1,000 active catalogue places with the greatest distinct-user
  support, with place ID as the deterministic tie-breaker, plus every active place currently marked
  visited by the requesting user. Places with no evidence appear only when needed to represent the
  user's own visited list and are labelled unsupported internally; no unseen zero-support catalogue
  place receives a personalized score.
- The default response is the complete stable order within that explicit universe. Pages contain 24
  results. A cursor binds the artifact ID, offset, normalized locality scope, and current ranking or
  unranked-visited snapshot. A mismatched, malformed, or retired snapshot fails explicitly instead
  of silently restarting with a different order.
- Locality is applied after global scoring. Sparse scopes return fewer results and the UI offers an
  explicit unfiltered view.
- Stable ordering is score descending and place ID ascending. Raw scores, similarities, and support
  counts are never shown as confidence or public ratings.

## Artifact and rebuild contract

Artifacts use a versioned JSON schema and record the artifact ID, category, data class, engine and
contribution-policy versions, evidence and catalogue fingerprints, generation time, contributor and
observation counts, reconstructed resolved tiers, and per-place distinct-user support. Local files
live under ignored `.data/recommendation-artifacts`; the existing provider-neutral `ArtifactStore`
interface remains the application boundary for Phase 9 storage.

`RecommendationArtifactService` provides the hosted-runner-neutral job contract:

- explicit CLI trigger: `npm run recommendations:rebuild -- restaurant` (add `-- --synthetic` for
  isolated synthetic artifacts);
- lazy local trigger when a serving request finds no artifact or detects evidence/catalogue drift;
- one in-process lock per environment/data-class/category, up to three attempts, `AbortSignal`
  cancellation, and no promotion after cancellation or failure;
- immutable versioned write followed by atomic replacement of the current pointer; a failed build
  leaves the previous artifact serving;
- local gates of five seconds and 16 MiB per artifact. These are conservative development limits,
  not hosted SLA claims. Phase 9 must replace the in-process lock/retry execution with a durable
  runner while retaining this service and storage contract.

## Personalization and fallback gate

The provisional restaurant gate remains five resolved ranked places, three resolved tiers, and four
ranked places with at least four distinct community contributors. When the separate current-user
personalization policy permits it, the service fits the selected restaurant nearest-neighbor view
from the current resolved revision. When the gate is not met but community evidence exists, it uses
the regularized global prior and labels the result community-based. With no supported evidence it
shows an insufficient-evidence next step.

This calibration is supported only by the Phase 1 leakage-safe synthetic benchmark and local
diagnostics. It is deliberately provisional until Phase 9 external evidence. No claim is made that
the small internal-testing cohort validates recommendation quality.

## Exposure and conversion boundary

An exposure is sent from `onMount`, after a result is rendered, and includes only unvisited places
present in the served artifact. Synthetic exposure and conversion writes are rejected. The database
keeps one row per user/category/place, updates the most recent eligible exposure until conversion,
and conditionally records a single conversion when the place is added as visited within 90 days.
Adding a place from recommendations, ordinary selection, or its public page uses the same
attribution contract. It changes visited membership only and starts insertion when a current list
revision exists; it does not create or prefill a public review.

Public review composition is now available only for places already in the user's visited bucket,
while review reads remain public and independent. Review/comment content, metadata, presence, and
moderation state have no type-level or query path into artifacts, serving, explanations, or
attribution.

## Verification and deferred human validation

Automated verification covers artifact reproducibility, real/synthetic isolation, support gates,
deterministic scoring, review-shaped mutation isolation, and database exposure/conversion
deduplication. On 2026-08-31, all 100 unit/component tests and all 27 PostgreSQL integration tests
passed, as did ESLint, Prettier, zero-warning Svelte diagnostics/autofixer, the production build, and
the reproducible Phase 1 benchmark. The established Phase 1 benchmark remains the leakage-safe
model-family evidence.

The following are provisional and changeable after human testing because they do not block Phase 8:

- comprehension of “predicted order” versus personal ranking and of the review-isolation copy;
- usefulness of a 24-result page and the explicit locality scope expansion;
- full-Italy catalogue latency and the 1,000-supported-candidate depth;
- accuracy of the provisional restaurant gate for internal and future beta users.

The Phase 6 moderation human retests remain independent of recommendation implementation and remain
tracked in the Phase 6 report. Hosted timing, durable runner recovery, storage, and beta-quality
claims remain Phase 9 gates.
