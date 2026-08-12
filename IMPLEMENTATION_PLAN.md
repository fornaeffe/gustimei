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
- Restaurants implemented end-to-end first, with hotels added before the first beta release.
- Search and selection of visited restaurants, with locality as a search/filter dimension rather than a list boundary.
- A resumable pairwise-comparison session with left choice, right choice, tie, undo, progress, and accessible non-gesture controls.
- A completed personal ranked list, including tied positions where applicable.
- Efficient insertion of a newly visited place into an existing stable list.
- A first recommendation feed that predicts the user's order across visited and not-yet-visited places in the selected category, based on overlapping user preferences and optionally filtered by locality, with a deterministic fallback for cold starts.
- Basic profile/settings: locale, delete ranking, delete account, and privacy information.
- Clearly separated real and synthetic catalogue/ranking data sufficient to test recommendations locally and demonstrate the beta safely.
- Product analytics events without storing sensitive free-form content.

### Deferred until the core loop is validated

- Reviews, comments, public profiles, follows, likes, and messaging.
- Business-owner pages, claims, ads, or promoted placement.
- Native mobile applications.
- Complex trip planning, bookings, and multi-criteria rankings.
- A first-party restaurant or hotel photo catalogue; the ranking flow must work with reliable non-photo fallbacks.

## Confirmed MVP product decisions

1. **Category rollout:** implement restaurants first to validate the complete ranking and recommendation loop. Add hotels as the second category before the first beta release. Category-specific behavior must remain behind shared domain and UI contracts rather than being hard-coded into the restaurant flow.
2. **Place catalogue:** use OpenStreetMap as the primary restaurant and hotel catalogue. Import regional extracts into an application-owned search index/database rather than relying on public OSM services at request time. See “OpenStreetMap catalogue approach” below.
3. **Ranking scope:** each user has one global list per category. Locality is metadata used to search, filter, and display subsets; it is not part of list identity.
4. **Comparison meaning:** overall preference. Keep the prompt stable within each category and localized, for example “Overall, which restaurant did you prefer?” and “Overall, which hotel did you prefer?”
5. **Ties:** support explicit equivalence tiers. “Tie” means equal overall preference and may result in the same displayed position. Keep “skip / cannot compare” separate because it supplies no preference evidence. The ranking-engine spike must validate how tiers interact with insertion and contradictory answers.
6. **Identity:** users must register or sign in before they can add or rank visited places. There is no anonymous draft-to-account handoff in the MVP.
7. **Privacy and participation:** personal rankings are private in the UI but their preference data is always used, without public identity, to calculate recommendations for the community. There is no per-user opt-out because reciprocal preference sharing is part of the service itself. This must be stated clearly before registration and reflected in the privacy policy, terms, deletion behavior, and analytics design.
8. **Starting geography:** Italy. Import and search Italian restaurants first, then Italian hotels before beta. Locality remains an optional filter over each global category list and predicted order.
9. **Coverage threshold:** keep initial OSM coverage audits intentionally loose. Exclude or quarantine only records or systemic gaps that would clearly break the product, create unusable identities, or deeply bias ranking/recommendation behavior. Record limitations rather than blocking development on catalogue completeness.
10. **Ranking threshold:** ranking may start with two visited places; one pairwise choice is sufficient to form the smallest meaningful ordered list. Recommendation eligibility is a separate threshold to determine experimentally and must not prevent users from maintaining a two-place personal list.
11. **Uncertainty:** provide “Skip / cannot compare” as a first-class outcome. It records missing preference evidence, keeps both places in the visited list, and is never interpreted as a reason to remove either place.
12. **Default recommendation view:** show the full predicted order for the selected category, with visited status clearly visible on every result. Users may optionally filter by locality without changing the underlying global predicted order.

### Proposed pre-registration wording

Show this close to the registration action, with links to the privacy policy and terms. It should be visible before account creation rather than hidden only inside legal documents.

**Italian (primary):**

> Le tue classifiche restano private: gli altri utenti non vedranno le tue liste né le tue scelte. GustiMei usa però le tue preferenze, senza mostrare la tua identità, insieme a quelle della community per calcolare raccomandazioni personalizzate. Questo uso condiviso dei dati di preferenza è parte essenziale del servizio e non può essere disattivato. Creando un account accetti questo funzionamento, come descritto nell'Informativa sulla privacy e nei Termini di servizio.

**English:**

> Your rankings remain private: other users will not see your lists or choices. GustiMei does, however, use your preferences without displaying your identity, together with community preferences, to calculate personalized recommendations. This shared use of preference data is an essential part of the service and cannot be disabled. By creating an account, you accept this operation as described in the Privacy Policy and Terms of Service.

Treat “without displaying your identity” as product wording, not a claim that the data is legally anonymous. The final privacy notice must accurately describe pseudonymization, processing purpose, retention, deletion, lawful basis, and any processors after legal review.

## OpenStreetMap catalogue approach

OpenStreetMap is suitable for the core identity, name, category, address, and geographic filtering needs of both restaurants and hotels. Italy is the initial import boundary. Coverage and tag completeness vary by category and locality; audits should identify severe breakage or bias without making completeness a prerequisite for early development. OSM should not be assumed to provide complete cuisine/amenity details, commercial descriptions, availability, prices, or dependable photos.

Implementation constraints:

- Source `amenity=restaurant` first and `tourism=hotel` before beta from an Italy OSM PBF extract, then refresh them through repeatable imports/diffs. Do not scrape or use the OSM editing API for bulk catalogue creation.
- Store the OSM element type plus numeric ID as the external identity; IDs are not globally unique without their type. Preserve source version/timestamp and design for deleted, retagged, moved, split, or merged elements.
- Normalize nodes, ways, and relations into one application `place` representation, with geometry reduced to a representative point where appropriate.
- Search the imported database directly. The [public Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) prohibits client-side autocomplete and systematic POI downloads, has a maximum of one request per second, and can withdraw access; it must not be a production dependency for place search. A hosted/self-managed geocoder can be considered later if database search is insufficient.
- Public Overpass instances may support one-off development validation, but production ingestion should use extracts or a dedicated/hosted service so community infrastructure is not part of the request path.
- Display clear “OpenStreetMap” attribution linked to its copyright/licence information wherever OSM-derived catalogue data is presented, following the [OSMF attribution guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines). Document whether the application catalogue is a Derivative Database and meet the ODbL share-alike obligations before launch; obtain legal review if combining it with proprietary catalogue data.
- Treat `wikimedia_commons`, `image`, and similar tags only as optional references. Resolve and retain each media item's own licence and attribution before display; otherwise use a category-appropriate non-photo card fallback. Never assume OSM's ODbL licenses linked images.
- Run separate loose coverage audits for Italian restaurants and hotels: unusable identities, severe duplicates, missing names/coordinates, stale/closed places, category errors, geographic skews, and any gaps likely to deeply bias the system. Quarantine clearly harmful records and document lesser limitations. The restaurant audit gates initial development only on severe issues; the hotel audit uses the same threshold before beta. If a severe systemic issue is found, retain the provider interface and add an ODbL-compatible enrichment source rather than replacing domain contracts.

## Domain model proposal

Finalize names and constraints with small algorithm prototypes before generating the first domain migration.

- `place`: canonical identity, category, name, coordinates, locality/country, address, status, source, source element type/ID/version, explicit synthetic/demo marker, and timestamps.
- `place_translation` or localized provider fields only if catalogue names/descriptions require them; do not translate proper names by default.
- `place_media`: provider URL/reference, attribution, sort order, dimensions, and lifecycle metadata. Avoid copying remote images without explicit rights.
- `ranking_list`: owner, category, status (`draft`, `ranking`, `complete`, `stale`), ranking-engine version, revision, and timestamps. Enforce one active global list per `(owner, category)`; locality does not belong to list identity.
- `ranking_item`: list, place, computed ordinal position or tier, insertion time, and optional removal time. Unique `(list_id, place_id)`.
- `ranking_session`: list/revision, algorithm state, status, estimated/actual comparison count, and timestamps. Store state in a versioned representation that can be migrated or replayed.
- `comparison`: session, left place, right place, outcome (`left`, `right`, `tie`, `skip`), sequence, response time, superseded/undone marker, and timestamp. Enforce that both places belong to the list and differ.
- `recommendation_snapshot` (optional initially): user/category, locality filter parameters, recommendation-engine version, source ranking revision, generated time, candidate place, predicted position, visited state, and internal explanation metadata. Start with on-demand results unless measurement shows snapshots are needed.
- Better Auth tables remain the identity source. Add application profile/preferences only when a field is not auth-owned.

Use UUIDs or generated text IDs consistently, UTC timestamps, explicit foreign-key deletion behavior, indexes for locality/category search and list membership, and migrations rather than `db:push` outside disposable local development.

## Synthetic data policy

- Local and automated-test environments may attach synthetic rankings to real or fictional places when needed to exercise algorithms and queries.
- Beta and production must never attach synthetic rankings, comparisons, users, or recommendation evidence to real places.
- Beta may contain fictional places and rankings for demonstrations only when every such place and all derived views are unmistakably labelled “Synthetic demo data” / “Dati demo sintetici.”
- Synthetic identities must be structurally isolated (for example through an explicit provenance field and environment/import guard), not inferred from names or ID ranges.

## System boundary: personal ranking versus recommendations

These are separate concepts and must remain separate in the product language, domain services, code modules, versioning, tests, and analytics:

- **Personal ranking UX:** an interactive elicitation process that helps one authenticated user build and maintain a global ranked list of places they have visited for each category. It asks pairwise questions within one category and records direct preference evidence. It does not recommend places.
- **Recommendation system:** a non-interactive collaborative algorithm that consumes completed/reliable category-specific personal lists from many users and predicts an ordered list for the current user. It may rank both visited and not-yet-visited places and apply locality as a result filter. It never changes the user's explicit personal ranking.

Use distinct names such as `rankingEngineVersion` and `recommendationEngineVersion`; changing either system must not silently reinterpret the other.

## Personal ranking UX and ranking engine

The ranking UX begins only after login. Initially, the user searches the Italian restaurant catalogue, marks restaurants as visited, and adds them to their one restaurant list. Before beta, the same flow supports a separate global hotel list. Locality may narrow catalogue search or a displayed personal list, but adding a place always modifies the global list for that category. The user can start ranking as soon as the list contains two places.

The UX idea proposes assisted QuickSort for a new list and binary insertion for later additions. Binary insertion is a good fit when an existing strict order is trusted. Interactive QuickSort is a useful baseline, but it must not be adopted literally before validating equivalence tiers, inconsistent answers, pivot quality, interruption, and edits.

### Proposed tied-tier insertion policy

Treat a completed ranking as an ordered sequence of atomic equivalence tiers. To insert one new place, binary-search the tiers rather than individual places and compare the new place with a deterministic representative of the selected tier. A strict preference moves the search interval above or below the whole tier. A tie provisionally places the new item in that tier; for tiers with more than one existing item, confirm the merge against one additional deterministic member before completing it. If the second answer is strict, do not split the existing tier implicitly: open a local repair session covering that tier and its immediate boundaries.

Use the following escalation policy:

1. Complete ordinary binary insertion when the answers produce one unambiguous boundary or a confirmed tied-tier merge.
2. If a skip, conflicting tie confirmation, or contradiction with an existing comparison prevents unique placement, ask targeted comparisons against the unresolved boundary tiers and then run a local repair over the smallest affected contiguous tier window.
3. Fall back to a broader re-ranking session only when the list was already marked stale or inconsistent, the affected window grows beyond `max(5 tiers, 25% of the list)`, a preference cycle crosses the window boundary, multiple unranked additions are being placed together, or an edit invalidates comparisons outside the local window.

Never guess a strict position after a skip and never silently dissolve an existing tie. If targeted repair still leaves insufficient evidence, persist the new item in an unresolved tier adjacent to the narrowed boundary, mark the list partial/stale for recommendation eligibility, and let the user resume later. The thresholds and the need for a second tie confirmation must be validated in the Phase 1 spike and stored as versioned ranking-engine policy.

Implement the ranking engine as a pure, framework-independent TypeScript module that emits the next comparison and consumes an outcome. The Svelte UI and persistence layer should not know the sorting algorithm's internal details.

Prototype and test at least these approaches against synthetic users:

- stable merge sort or assisted QuickSort for initial total ordering;
- binary insertion for one new item;
- ordered equivalence tiers, potentially backed by a comparison graph, for ties;
- cycle detection and a recovery policy for inconsistent preferences;
- reuse of still-valid comparisons when a user edits or resumes a list.

Measure number of questions, worst-case behavior, stability, reproducibility, ability to undo, and quality under ties/noise. Choose and document the algorithm before building the comparison UI. Persist the ranking-engine version so ranking state can be migrated or recomputed after changes.

Each completed category list is the authoritative record of the user's stated overall preference among visited places in that category. A locality-filtered view must preserve each place's global position/tier rather than renumbering it as if it were a separate ranking, unless the UI labels the filtered positions explicitly.

## Recommendation system

The recommendation system consumes user lists. Its output is a predicted global preference order for the current user, optionally filtered by locality.

Candidate results include both:

- **not-yet-visited places in the selected category**, which are the main discovery/recommendation use case;
- **visited places in that category**, which provide context, allow the predicted order to be evaluated against the user's actual order, and help explain where new places might fit.

For the first baseline, compare understandable collaborative methods offline — for example rank correlation over common places within the same category followed by confidence-weighted rank aggregation — against popularity and random baselines. Determine how ties contribute to similarity without arbitrarily converting them into strict wins.

Locality filtering should be applied consistently. Prototype both candidate filtering before aggregation and result filtering after a global prediction, because sparse overlap may make a locality-only model unusable. Record the chosen behavior in the recommendation contract.

The output contract should include category, place, predicted order, visited state, confidence/eligibility metadata, and privacy-safe explanation data. Similarity or confidence values are internal signals, not consumer ratings. Recommendation versions and source ranking revisions must be recorded so results can be invalidated and evaluated independently of the ranking UX.

## Implementation phases

### Phase 0 — Baseline and decisions

- Make `npm run check`, `npm run lint`, unit tests, and a production build complete reliably.
- Remove or quarantine starter `task`, welcome, and demo code once equivalent product tests/routes exist.
- Record the MVP decisions listed above in this document or short ADRs.
- Select the deployment target and replace `adapter-auto` if the target requires a specific adapter.
- Define environment validation and separate development, test, preview, and production database configuration.
- Establish branch/CI checks for formatting, linting, type checks, unit tests, build, and focused end-to-end tests.

**Exit:** clean reproducible baseline, confirmed restaurant-first/hotel-before-beta rollout, catalogue/privacy model, and passing CI.

### Phase 1 — Separate algorithm spikes and contracts

- Define one contract for personal ranking state/comparison outcomes/progress and a separate contract for recommendation inputs/results.
- Build pure personal-ranking prototypes and property-based or exhaustive small-list tests. Test 2, 3, 10, 25, and larger lists; balanced, already ordered, reverse ordered, tied, skipped, and contradictory inputs; undo and resume.
- Decide how explicit equivalence tiers, skip, binary insertion, cycles, and edits behave in the personal ranking without reference to recommendation scoring.
- Separately build an offline collaborative recommendation experiment with synthetic global restaurant lists, then validate the same contracts with hotel fixtures before beta. Include visited and unseen candidates and locality-filtered evaluation.
- Measure recommendation precision/hit rate at K, rank agreement on held-out visited places, catalogue coverage, novelty, cold-start behavior, and performance at different overlap thresholds per category.
- Verify if the proposed tied-tier insertion policy minimize questions without causing too many local repairs, and are the proposed `max(5 tiers, 25% of the list)` fallback threshold and second-member tie confirmation appropriate?
- Document each selected algorithm, limitation, version, and recomputation strategy independently.

**Exit:** deterministic engine contracts and evidence for the initial ranking and recommendation approaches.

### Phase 2 — Domain persistence and catalogue

- Replace the example schema with the domain tables, relations, constraints, and indexes.
- Generate and review the first domain migration; add test-database setup and reset helpers.
- Implement repositories/services so route code does not contain raw domain queries.
- Add a repeatable OpenStreetMap PBF import/update pipeline, initially importing Italian restaurants, plus environment-safe synthetic users/rankings.
- Normalize OSM nodes/ways/relations behind a catalogue provider interface and deduplicate by element identity plus geographic/name quality checks.
- Build locality-aware restaurant search over the imported application database; do not use public Nominatim for autocomplete.
- Add OSM attribution, ODbL compliance documentation, source-version tracking, and licence-aware optional image handling.
- Run and record the loose Italian restaurant coverage audit; block the milestone only for issues that clearly break or deeply bias the system.
- Add explicit provenance and enforcement so beta/production synthetic rankings cannot attach to real places or influence their recommendations.

**Exit:** a user, their global restaurant list, restaurants, session, and comparisons can be persisted and reconstructed; restaurant search works against imported OSM data and catalogue compliance is documented.

### Phase 3 — Product shell, authentication, and onboarding

- Define semantic color, spacing, typography, focus, motion, and card tokens with light/dark behavior.
- Create reusable shell, button, form, place card, empty/error state, progress, and dialog components; use Bits UI only where it improves accessible behavior.
- Turn the Better Auth demo into product routes with validation, localized errors, safe redirects, rate-limit strategy, and session-aware navigation.
- Decide and implement email verification and password reset before public launch.
- Build the landing page around the no-ratings value proposition and a single clear call to action; show the approved preference-sharing disclosure before registration.
- Expand Paraglide messages for every product string; add checks that Italian and English catalogues stay aligned.

**Exit:** a new user understands that private preference data contributes anonymously to community recommendations, creates an account, signs in, and reaches an accessible empty dashboard in either locale. Ranking routes reject unauthenticated access.

### Phase 4 — Visited-restaurant selection bucket

- Load or create the authenticated user's single global restaurant list.
- Add locality search/filter controls without changing list identity.
- Build debounced server-side search with loading, empty, error, attribution, and duplicate states.
- Let users add/remove places in a persistent unordered bucket.
- Enable “Order your top list” at two places and explain that adding more visited places improves recommendation confidence.
- Preserve draft selections across navigation, refresh, and transient network failure. No anonymous authentication handoff is required.
- Instrument search, add/remove, threshold reached, and ranking-start events.

**Exit:** a user can create or resume a valid draft list and start ranking it.

### Phase 5 — Pairwise ranking experience

- Start/resume a server-owned ranking session and request one comparison at a time.
- Show two balanced place cards with photo fallback, name, area, and category-relevant metadata—never ratings.
- Support card tap/click, explicit buttons, keyboard controls, tie, “skip / cannot compare,” and undo. Treat swipes as progressive enhancement, not the only input.
- A skipped comparison leaves both places in the list, records no preference edge, and allows the engine to continue or finish with a partial order when strict placement cannot be inferred.
- Save each response idempotently before advancing; handle double taps, stale revisions, multiple tabs, offline/interrupted requests, and session expiry.
- Add reduced-motion-safe transitions, selection feedback, and an honest progress estimate.
- Use occasional partial-ranking feedback only if it does not reveal unstable or misleading positions.
- On completion, present the ranked list/tier groups and allow confirmation or editing.

**Exit:** the core flow is accessible, resumable, concurrency-safe, and produces a reproducible persisted ranking.

### Phase 6 — Existing-list maintenance

- Add a new visited place to a completed list using binary insertion.
- Define insertion behavior around tied tiers and stale/inconsistent rankings.
- Support removing a place and changing an answer without unnecessarily discarding valid evidence.
- Mark downstream recommendation results stale when a ranking revision changes.
- Provide deliberate “rebuild this list” and delete actions with clear consequences.

**Exit:** rankings remain maintainable over time rather than being one-use onboarding artifacts.

### Phase 7 — Personalized recommendations

- Consume completed/reliable personal lists through a dedicated recommendation service; never mutate explicit personal rankings.
- Aggregate both visited and not-yet-visited candidates, filter inactive/ineligible entries, and return a predicted order with each result's visited state.
- Make the full predicted order the default view and display visited status clearly; do not default to an unseen-only discovery feed.
- Add locality as a user-controlled result filter and validate its interaction with sparse data.
- Implement cold-start states: ask the user to rank more visited restaurants, broaden/remove locality filtering, or show a clearly labelled non-personalized discovery fallback. Generalize the copy by category when hotels are added.
- Clearly distinguish predicted recommendation positions from personal ranking positions. Present concise recommendation reasoning and a path to mark “already visited,” feeding that place into the ranking UX for its category.
- Cache or snapshot only after measuring latency; version results and invalidate on relevant ranking/catalogue changes.
- Evaluate recommendation quality with synthetic fixtures before launch and behavioral metrics after consented use.

**Exit:** users with adequate overlap receive an explainable predicted order of visited and unseen restaurants, filterable by locality without altering their global restaurant list; all other users see an honest useful next step.

### Phase 8 — Add hotels before beta

- Extend the Italy OSM importer and loose coverage audit to `tourism=hotel`, preserving the same canonical place/provider contracts and blocking beta only for clearly breaking or deeply biasing issues.
- Add hotel-specific catalogue metadata, search filters, empty states, card fallbacks, and localized overall-preference copy without branching the shared ranking components unnecessarily.
- Enable one separate global hotel list per user and enforce that comparisons and recommendations never cross categories.
- Exercise the existing ranking engine against hotel fixtures and behavior; introduce category-specific policy only where product evidence requires it.
- Validate the recommendation engine independently for hotels, including overlap thresholds, cold starts, locality filtering, and visited/unseen result labeling.
- Add restaurant-and-hotel integration, component, algorithm, and end-to-end coverage.
- Run an Italian hotel catalogue/licensing quality review and targeted usability sessions before declaring beta readiness.

**Exit:** restaurants and hotels both support the complete authenticated selection → personal ranking → recommendation loop, and no beta is released until both categories meet their quality gates.

### Phase 9 — Hardening and beta release

- Threat-model authentication, authorization/IDOR, catalogue ingestion, comparison writes, rate limiting, CSRF, XSS, and abuse paths.
- Add database backup/restore, migration rollout/rollback, observability, structured redacted logging, error reporting, and health checks.
- Complete accessibility testing for keyboard, screen reader, contrast, touch targets, zoom, reduced motion, and both locales.
- Add privacy policy, terms/provider attribution, consent/retention rules, data export if required, and account/data deletion.
- Run responsive and cross-browser end-to-end tests of sign-up, draft/resume, ranking, insertion, recommendation, locale switching, and failure recovery.
- Verify beta synthetic-data labelling and isolation, including that no synthetic ranking evidence is associated with or affects real places.
- Run a small private beta with both restaurants and hotels in the chosen area; measure and review each category separately before expanding the catalogue.

**Exit:** operable production release with defined rollback, support, privacy, and measurement procedures.

## Testing strategy

- **Pure unit tests:** ranking state machine, progress bounds, ties, contradictions, undo, serialization/version migration, recommendation scoring, and permission helpers.
- **Database integration tests:** constraints, transactions, idempotency, list ownership, concurrent revisions, seed imports, and recommendation queries against isolated PostgreSQL.
- **Component tests:** place cards, bucket, comparison controls, focus management, localization, reduced motion, and all loading/error/empty states.
- **End-to-end tests:** authentication/disclosure; create/resume a draft; complete a 2-place and larger ranking; tie/skip/undo; refresh mid-session; concurrent-tab conflict; insert/remove a place; view the full predicted order with visited status and locality filtering; receive or fail gracefully to receive recommendations; delete data.
- **Algorithm tests:** exhaustive permutations for small lists and generated noisy/tied rankings for larger lists, with invariants rather than only example outputs.
- **Non-functional tests:** mobile performance on a throttled connection, catalogue/recommendation query plans, basic load tests, and automated accessibility checks backed by manual review.

Use deterministic seeds and clocks where possible. Do not make routine tests depend on a live external place API.

## Analytics and success measures

Define events and privacy/retention before collection. Avoid place names, search text, precise coordinates, emails, and raw comparison pairs in third-party analytics unless explicitly justified and consented.

Initial funnel:

- landing call-to-action → account/draft started;
- first place selected → two-place ranking threshold;
- ranking started → ranking completed;
- median comparisons and time to completion by list size;
- abandon/resume, tie, skip, undo, and error rates;
- recommendation impressions → detail/open/save/already-visited actions;
- percentage of users with enough overlap for personalized results;
- return rate to add a newly visited place.

Set numeric beta targets after prototype usability sessions establish realistic baselines.

## Open questions

Replace with ANSWERED when the question is answered and decisions are documented elsewere in this plan.

### Personal ranking UX and ranking-engine questions

1. Should an explicit tie be permanent until edited, or may later transitive evidence split an equivalence tier?
2. ANSWERED
3. How should preference cycles be resolved: ask a clarifying comparison, retain the newest answer, calculate a best-fit order, or flag the list for rebuild?
4. When does a personal ranking become stale as tastes change, and should old comparisons decay over time?
5. Should ranking sessions cap list size or split very large buckets into shorter resumable sessions?
6. When a locality filter is applied to the personal list, should the UI show global positions (possibly with gaps), filtered ordinal labels, or no position numbers?
7. When skips leave insufficient evidence for a total order, should the UI show a partial order, unresolved tier, or ask targeted comparisons later?

### Recommendation-system questions

8. What minimum common-place count and confidence are required before another user contributes as a recommendation neighbor, and should thresholds differ by category?
9. Which similarity and rank-aggregation method wins the offline prototype, and what is the fallback when overlap is sparse?
10. Should locality filter candidates before aggregation or filter a globally predicted order afterward, and how should the UI explain broader fallback results?
11. How should equivalence tiers and skipped comparisons contribute to similarity and aggregation without inventing strict preferences?
12. How will malicious or coordinated rankings be detected without recreating a public/global reputation score?
13. How should held-out visited places be used to evaluate predicted order without leaking private rankings or confusing offline evaluation with live recommendations?
14. What evidence threshold enables personalized recommendations, independently for restaurants and hotels, while the personal ranking remains available from two places?

### Product and operations

15. Is email/password enough for beta, or are passkeys/social providers needed? Are verification and password reset required before invite-only testing?
16. What is the launch definition of a recommendation conversion: open, save, directions, booking click, or later addition as visited?
17. Which category-appropriate non-photo card designs give users enough identity/context when OSM has no safely usable restaurant or hotel image?
18. Which deployment, managed PostgreSQL, OSM import/update, analytics, error-reporting, and email services will be used, with what regional/data-processing constraints?
19. What data export, retention, deletion, age restriction, and consent requirements apply? In particular, when an account is deleted, which comparison data must be erased rather than irreversibly anonymized and retained?
20. Who can correct, merge, hide, or remove bad OSM-derived catalogue records locally, how are upstream corrections handled, and what audit trail is needed?
21. Is public sharing of a completed list ever compatible with “private by default,” or should it remain explicitly deferred beyond the MVP?
22. What beta cohort and qualitative research method will separately determine whether the ranking UX is usable and whether recommendations are credible?
23. Does the proposed pre-registration wording meet the eventual legal basis and transparency requirements, and what revisions are required after legal review?

## Suggested immediate next actions

1. Run the loose Italy OpenStreetMap restaurant coverage/licence/import spike, followed by an early hotel coverage check to protect the beta commitment.
2. Diagnose the baseline command hang and establish green local/CI checks.
3. Prototype the personal-ranking state machine—including two-place start and skip behavior—and, independently, the recommendation baseline with synthetic global restaurant lists before committing the schema; include hotel fixtures when validating category boundaries.
4. Define and test synthetic-data provenance guards before creating shared beta/demo seeds.
5. Validate the authenticated selection and two-card ranking flow with a clickable low-fidelity mobile prototype and 5–8 target users, including the proposed registration disclosure.
6. Then implement one thin ranking vertical slice: imported Italian OSM restaurant search → global visited-restaurant bucket → persisted comparisons → completed private personal list.
7. After that data path is reliable, add the full predicted-order recommendation view with visited status and locality filtering, then extend the complete loop to hotels before beta.
