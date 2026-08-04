# GustiMei implementation plan

## Product goal

GustiMei is a hotel and restaurant discovery app based on ordinal preferences rather than ratings. A user identifies places they have visited, compares them in a low-effort pairwise flow, and receives recommendations inferred from people whose rankings overlap with and resemble their own.

The first release should prove two assumptions:

1. people will complete enough pairwise comparisons to produce a useful personal ranking;
2. overlapping personal rankings can generate recommendations that feel more relevant than a global popularity list.

Success therefore depends more on ranking completion, data quality, and recommendation relevance than on catalogue breadth or social features.

## MVP scope

### In scope

- Italian and English public landing/onboarding.
- Account registration, sign-in, sign-out, and protected product routes.
- Hotels category implemented end-to-end first, while keeping the schema extensible to restaurants.
- Search and selection of visited places within a geographic context.
- A resumable pairwise-comparison session with left choice, right choice, tie, undo, progress, and accessible non-gesture controls.
- A completed personal ranked list, including tied positions where applicable.
- Efficient insertion of a newly visited place into an existing stable list.
- A first recommendation feed based on overlapping user preferences, with a deterministic fallback for cold starts.
- Basic profile/settings: locale, delete ranking, delete account, and privacy information.
- Seed catalogue and synthetic ranking data sufficient to test recommendations locally.
- Product analytics events without storing sensitive free-form content.

### Deferred until the core loop is validated

- Reviews, comments, public profiles, follows, likes, and messaging.
- Business-owner pages, claims, ads, or promoted placement.
- Native mobile applications.
- Complex trip planning, bookings, and multi-criteria rankings.

## Decisions to make before implementation

These decisions affect the data model and should be resolved in a short product/technical discovery phase:

1. **Initial vertical:** restaurants only, hotels only, or both. Restaurants-only is recommended for a smaller, more coherent MVP.
2. **Place catalogue:** licensed third-party API, OpenStreetMap-derived data, or a curated internal seed. Confirm storage, photo, attribution, refresh, and search-cache rights before designing around a provider.
3. **Ranking context:** decide whether a list is scoped by category and city/area, or whether geography is only a filter. 
4. **Comparison meaning:** “overall preference,” “best meal/stay,” and “would choose tonight” are not equivalent. Choose one stable question per category so collaborative data remains comparable.
5. **Tie and skip semantics:** a tie is an equality preference; a skip means missing evidence. Never store them as the same result.
6. **Identity requirement:** decide whether users must sign in before selecting places or only before saving. Delayed sign-in reduces onboarding friction but requires an anonymous-to-account handoff.
7. **Recommendation privacy:** define whether rankings are private by default and whether anonymized ranking data may be used for recommendations.

## Domain model proposal

Finalize names and constraints with small algorithm prototypes before generating the first domain migration.

- `place`: canonical identity, category, name, coordinates, locality/country, address, status, source, source ID, and timestamps.
- `place_translation` or localized provider fields only if catalogue names/descriptions require them; do not translate proper names by default.
- `place_media`: provider URL/reference, attribution, sort order, dimensions, and lifecycle metadata. Avoid copying remote images without explicit rights.
- `ranking_list`: owner, category, geographic context, status (`draft`, `ranking`, `complete`, `stale`), algorithm version, revision, and timestamps.
- `ranking_item`: list, place, computed ordinal position or tier, insertion time, and optional removal time. Unique `(list_id, place_id)`.
- `ranking_session`: list/revision, algorithm state, status, estimated/actual comparison count, and timestamps. Store state in a versioned representation that can be migrated or replayed.
- `comparison`: session, left place, right place, outcome (`left`, `right`, `tie`, `skip`), sequence, response time, superseded/undone marker, and timestamp. Enforce that both places belong to the list and differ.
- `recommendation_snapshot` (optional initially): user/list context, algorithm version, generated time, candidate, rank, and internal explanation metadata. Start with on-demand results unless measurement shows snapshots are needed.
- Better Auth tables remain the identity source. Add application profile/preferences only when a field is not auth-owned.

Use UUIDs or generated text IDs consistently, UTC timestamps, explicit foreign-key deletion behavior, indexes for locality/category search and list membership, and migrations rather than `db:push` outside disposable local development.

## Ranking algorithm discovery

The UX idea proposes assisted QuickSort for a new list and binary insertion for later additions. Binary insertion is a good fit when an existing total order is trusted. Interactive QuickSort is a useful baseline, but it must not be adopted literally before validating ties, inconsistent answers, pivot quality, interruption, and edits.

Implement the ranking engine as a pure, framework-independent TypeScript module that emits the next comparison and consumes an outcome. The UI and persistence layer should not know the sorting algorithm's internal details.

Prototype and test at least these approaches against synthetic users:

- stable merge sort or assisted QuickSort for initial total ordering;
- binary insertion for one new item;
- ordered tiers or a comparison graph for ties;
- cycle detection and a recovery policy for inconsistent preferences;
- reuse of still-valid comparisons when a user edits or resumes a list.

Measure number of questions, worst-case behavior, stability, reproducibility, ability to undo, and quality under ties/noise. Choose and document the algorithm before building the comparison UI. Persist `algorithm_version` so rankings can be recomputed after changes.

For a first recommendation baseline, use only places absent from the target user's visited list and rank candidates using preference neighbors with sufficient overlap. Compare a few understandable methods offline—for example rank correlation on common items plus weighted rank aggregation—against popularity and random baselines. Add shrinkage/minimum-overlap rules so one coincidental match cannot dominate. The production interface should return candidates plus explanation metadata and should not expose similarity scores as consumer ratings.

## Implementation phases

### Phase 0 — Baseline and decisions

- Make `npm run check`, `npm run lint`, unit tests, and a production build complete reliably; identify the current hang before adding features.
- Remove or quarantine starter `task`, welcome, and demo code once equivalent product tests/routes exist.
- Record the MVP decisions listed above in this document or short ADRs.
- Select the deployment target and replace `adapter-auto` if the target requires a specific adapter.
- Define environment validation and separate development, test, preview, and production database configuration.
- Establish branch/CI checks for formatting, linting, type checks, unit tests, build, and focused end-to-end tests.

**Exit:** clean reproducible baseline, chosen MVP vertical/catalogue/privacy model, and passing CI.

### Phase 1 — Algorithm spikes and contracts

- Define typed contracts for ranking state, comparison outcomes, progress estimates, and recommendation results.
- Build pure ranking prototypes and property-based or exhaustive small-list tests.
- Test 3, 10, 25, and larger lists; balanced, already ordered, reverse ordered, tied, skipped, and contradictory inputs; undo and resume.
- Build an offline collaborative-filtering experiment with synthetic users and explicit evaluation metrics (hit rate/precision at K, coverage, novelty, and cold-start behavior).
- Document the selected algorithms, limitations, and versioning/recomputation strategy.

**Exit:** deterministic engine contracts and evidence for the initial ranking and recommendation approaches.

### Phase 2 — Domain persistence and catalogue

- Replace the example schema with the domain tables, relations, constraints, and indexes.
- Generate and review the first domain migration; add test-database setup and reset helpers.
- Implement repositories/services so route code does not contain raw domain queries.
- Add a repeatable seed pipeline with realistic places in one launch area and synthetic users/rankings.
- Integrate catalogue search behind a provider interface; normalize identity and deduplicate by provider ID and geographic/name checks.
- Add attribution and image handling required by the selected provider.

**Exit:** a user, list, places, session, and comparisons can be persisted and reconstructed; search works against seeded/provider data.

### Phase 3 — Product shell, authentication, and onboarding

- Define semantic color, spacing, typography, focus, motion, and card tokens with light/dark behavior if dark mode is in MVP.
- Create reusable shell, button, form, place card, empty/error state, progress, and dialog components; use Bits UI only where it improves accessible behavior.
- Turn the Better Auth demo into product routes with validation, localized errors, safe redirects, rate-limit strategy, and session-aware navigation.
- Decide and implement email verification and password reset before public launch.
- Build the landing page around the no-ratings value proposition and a single clear call to action.
- Expand Paraglide messages for every product string; add checks that Italian and English catalogues stay aligned.

**Exit:** a new user can understand the product, create an account, sign in, and reach an accessible empty dashboard in either locale.

### Phase 4 — Place selection bucket

- Add category and geographic-context selection.
- Build debounced server-side search with loading, empty, error, attribution, and duplicate states.
- Let users add/remove places in a persistent unordered bucket.
- Enable “Order your top list” at three places and explain why more overlap improves recommendations.
- Preserve draft selections across navigation, refresh, authentication handoff, and transient network failure.
- Instrument search, add/remove, threshold reached, and ranking-start events.

**Exit:** a user can create or resume a valid draft list and start ranking it.

### Phase 5 — Pairwise ranking experience

- Start/resume a server-owned ranking session and request one comparison at a time.
- Show two balanced place cards with photo fallback, name, area, and category-relevant metadata—never ratings.
- Support card tap/click, explicit buttons, keyboard controls, tie, optional skip, and undo. Treat swipes as progressive enhancement, not the only input.
- Save each response idempotently before advancing; handle double taps, stale revisions, multiple tabs, offline/interrupted requests, and session expiry.
- Add reduced-motion-safe transitions, selection feedback, and an honest progress estimate.
- Use occasional partial-ranking feedback only if it does not reveal unstable or misleading positions.
- On completion, present the ranked list/tier groups and allow confirmation or editing.

**Exit:** the core flow is accessible, resumable, concurrency-safe, and produces a reproducible persisted ranking.

### Phase 6 — Existing-list maintenance

- Add a new visited place to a completed list using binary insertion when the list is a strict trusted order.
- Define insertion behavior around tied tiers and stale/inconsistent rankings.
- Support removing a place and changing an answer without unnecessarily discarding valid evidence.
- Mark downstream recommendation results stale when a ranking revision changes.
- Provide deliberate “rebuild this list” and delete actions with clear consequences.

**Exit:** rankings remain maintainable over time rather than being one-use onboarding artifacts.

### Phase 7 — Personalized recommendations

- Compute neighbor similarity only with sufficient overlap and evidence.
- Aggregate unseen candidate places, filter inactive/ineligible entries, and return a stable ordered feed.
- Implement cold-start states: ask for more visited places, broaden geography with consent, or show a clearly labelled non-personalized discovery fallback.
- Present concise recommendation reasoning and a path to mark “already visited,” feeding that place into the user's bucket.
- Cache or snapshot only after measuring latency; version results and invalidate on relevant ranking/catalogue changes.
- Evaluate recommendation quality with synthetic fixtures before launch and behavioral metrics after consented use.

**Exit:** users with adequate overlap receive explainable personalized candidates; all other users see an honest useful next step.

### Phase 8 — Hardening and release

- Threat-model authentication, authorization/IDOR, catalogue ingestion, comparison writes, rate limiting, CSRF, XSS, and abuse paths.
- Add database backup/restore, migration rollout/rollback, observability, structured redacted logging, error reporting, and health checks.
- Complete accessibility testing for keyboard, screen reader, contrast, touch targets, zoom, reduced motion, and both locales.
- Add privacy policy, terms/provider attribution, consent/retention rules, data export if required, and account/data deletion.
- Run responsive and cross-browser end-to-end tests of sign-up, draft/resume, ranking, insertion, recommendation, locale switching, and failure recovery.
- Run a small private beta in one category and area; review funnel and qualitative relevance before expanding the catalogue.

**Exit:** operable production release with defined rollback, support, privacy, and measurement procedures.

## Testing strategy

- **Pure unit tests:** ranking state machine, progress bounds, ties, contradictions, undo, serialization/version migration, recommendation scoring, and permission helpers.
- **Database integration tests:** constraints, transactions, idempotency, list ownership, concurrent revisions, seed imports, and recommendation queries against isolated PostgreSQL.
- **Component tests:** place cards, bucket, comparison controls, focus management, localization, reduced motion, and all loading/error/empty states.
- **End-to-end tests:** authentication; create/resume a draft; complete a 3-place and larger ranking; tie/undo; refresh mid-session; concurrent-tab conflict; insert/remove a place; receive or fail gracefully to receive recommendations; delete data.
- **Algorithm tests:** exhaustive permutations for small lists and generated noisy/tied rankings for larger lists, with invariants rather than only example outputs.
- **Non-functional tests:** mobile performance on a throttled connection, catalogue/recommendation query plans, basic load tests, and automated accessibility checks backed by manual review.

Use deterministic seeds and clocks where possible. Do not make routine tests depend on a live external place API.

## Analytics and success measures

Define events and privacy/retention before collection. Avoid place names, search text, precise coordinates, emails, and raw comparison pairs in third-party analytics unless explicitly justified and consented.

Initial funnel:

- landing call-to-action → account/draft started;
- first place selected → three-place threshold;
- ranking started → ranking completed;
- median comparisons and time to completion by list size;
- abandon/resume, tie, skip, undo, and error rates;
- recommendation impressions → detail/open/save/already-visited actions;
- percentage of users with enough overlap for personalized results;
- return rate to add a newly visited place.

Set numeric beta targets after prototype usability sessions establish realistic baselines.

## Open questions

### Blocking MVP design

1. Which category and launch geography should the first vertical cover?
2. Which place data/photo provider can legally support search, persisted identities, caching, attribution, and production volume within budget?
3. Are lists city-specific? How are nearby municipalities, travel lists, chains, relocated places, and duplicate branches handled?
4. What exact question defines preference for each category, and can users maintain multiple contexts (for example “overall” versus “business travel”)?
5. Does a tie create a permanent shared tier, and is “cannot compare” required as a separate outcome?
6. Can a user begin anonymously, and if so when and how is draft ownership transferred safely to an account?
7. Are rankings private by default? Can users opt out of contributing anonymized preference data while still keeping a personal list?

### Algorithm and data quality

8. What minimum common-place count and confidence are required before another user becomes a recommendation neighbor?
9. Which similarity and rank-aggregation method wins the offline prototype, and what is the fallback when overlap is sparse?
10. How should preference cycles be resolved: ask a clarifying comparison, retain the newest answer, calculate a best-fit order, or flag the list for rebuild?
11. When do rankings become stale as tastes change, and should old comparisons decay over time?
12. How should ties affect binary insertion, similarity, displayed positions, and recommendation aggregation?
13. Should ranking sessions cap list size or split very large buckets into shorter sessions?
14. How will malicious or coordinated rankings be detected without recreating a global reputation score?

### Product and operations

15. Is email/password enough for beta, or are passkeys/social providers needed? Are verification and password reset required before invite-only testing?
16. What is the launch definition of a recommendation conversion: open, save, directions, booking click, or later addition as visited?
17. Should photos be mandatory for the two-card comparison, and what is the fallback when provider photos are absent or expire?
18. Is public sharing of a completed list valuable to the MVP, and what privacy controls would it require?
19. Which deployment, managed PostgreSQL, image/CDN, analytics, error-reporting, and email services will be used, with what regional/data-processing constraints?
20. What data export, retention, deletion, age restriction, and consent requirements apply in the initial markets?
21. Who can correct, merge, hide, or remove bad catalogue records, and what audit trail is needed?
22. What beta cohort and qualitative research method will determine whether pairwise ranking is enjoyable and recommendations are credible?

## Suggested immediate next actions

1. Resolve the seven blocking MVP questions in a short product workshop.
2. Diagnose the baseline command hang and establish green local/CI checks.
3. Prototype the ranking state machine and recommendation baseline with synthetic data before committing the schema.
4. Validate the selection and two-card flow with a clickable low-fidelity mobile prototype and 5–8 target users.
5. Select the catalogue provider and confirm its licensing constraints.
6. Then implement one thin vertical slice: seeded place search → three-place bucket → persisted comparisons → completed personal list.
