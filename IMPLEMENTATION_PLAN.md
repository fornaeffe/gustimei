# GustiMei implementation plan

## Product goal

GustiMei is a hotel and restaurant discovery app based on ordinal preferences rather than ratings. A user identifies places they have visited, compares them in a low-effort pairwise flow, and receives recommendations inferred from shared latent preference patterns learned across connected community rankings.

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
6. **Identity:** users must register or sign in before they can add or rank visited places. There is no anonymous draft-to-account handoff in the MVP. Email/password is sufficient during local development. For beta, require email verification before an email/password account can sign in and provide a link-based password-reset flow. Add social login, with Sign in with Google as the minimum provider, as one of the final beta-release steps while retaining email/password as a supported method.
7. **Privacy and participation:** personal rankings are private in the UI but their preference data is always used, without public identity, to calculate recommendations for the community. There is no per-user opt-out because reciprocal preference sharing is part of the service itself. This must be stated clearly before registration and reflected in the privacy policy, terms, deletion behavior, and analytics design.
8. **Starting geography:** Italy. Import and search Italian restaurants first, then Italian hotels before beta. Locality remains an optional filter over each global category list and predicted order.
9. **Coverage threshold:** keep initial OSM coverage audits intentionally loose. Exclude or quarantine only records or systemic gaps that would clearly break the product, create unusable identities, or deeply bias ranking/recommendation behavior. Record limitations rather than blocking development on catalogue completeness.
10. **Ranking threshold:** ranking may start with two visited places; one pairwise choice is sufficient to form the smallest meaningful ordered list. Recommendation eligibility is a separate threshold to determine experimentally and must not prevent users from maintaining a two-place personal list.
11. **Uncertainty:** provide “Skip / cannot compare” as a first-class outcome. It records missing preference evidence, keeps both places in the visited list, and is never interpreted as a reason to remove either place.
12. **Default recommendation view:** show the full predicted order for the selected category, with visited status clearly visible on every result. Users may optionally filter by locality without changing the underlying global predicted order.
13. **Tie repair:** an explicit tie remains direct user evidence, but it is not permanently immune to later contradictory transitive evidence. If later answers conflict with a tied tier, prompt a targeted repair using the tied-tier insertion policy; never split the tier silently.
14. **Cycle and contradiction recovery:** resolve preference cycles by asking a targeted clarifying comparison. Until that clarification is completed, retain the newest answer and temporarily leave the oldest conflicting ranking evidence out of the active order. Prompt the user to rerank the involved places; do not decay preferences merely because time has passed.
15. **Ranking-session size:** the MVP does not cap personal-list size or split large selection buckets into shorter ranking sessions. Measure large-list behavior and revisit this only if the ranking spike or beta usage demonstrates a need.
16. **Filtered personal-list positions:** when locality filters the personal list, display ordinal labels recalculated for the filtered results. Clearly identify them as filtered positions; the underlying global tiers and order remain unchanged.
17. **Incomplete orders after skips:** when skips leave insufficient evidence for a total order, display the affected places as an unresolved tier. Preserve the missing evidence so a later iteration can request targeted comparisons.
18. **Recommendation conversion:** the primary launch conversion is a previously unvisited place being added as visited after the user was shown it as a recommendation. Opens, saves, directions, and booking clicks are secondary intent signals, not conversions. Completing the place's later insertion into the personal ranking is a separate recommendation-quality signal.
19. **Non-photo place cards:** use `@lucide/svelte` as the sole MVP icon library. Render a reusable, category-themed fallback panel with a Lucide category icon (`UtensilsCrossed` for restaurants and `Hotel` for hotels), the place name, category, and locality. Do not use generic stock photography or add another icon source unless a validated future category cannot be represented by Lucide.
20. **Provisional beta operations stack:** plan for a SvelteKit Node deployment on Koyeb in Frankfurt, managed PostgreSQL on Neon in Frankfurt, Sentry's EU/Germany service for error reporting, and Brevo for transactional email. Implement OSM ingestion and the narrow product-analytics collector in application-owned code. This is the current implementation target, not a final vendor commitment: confirm or revise it after local/import/deployment testing establishes catalogue and index size, Better Auth password-hashing performance, database activity and cost, email deliverability, regional/data-processing suitability, and operational reliability.

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

## Provisional deployment and operations approach

Use the following as the current target for implementation and deployment spikes. Keep provider boundaries explicit so the final choice can change without rewriting domain or authentication logic.

- **Application hosting:** target Koyeb in Frankfurt using SvelteKit's Node adapter and a normal Node runtime. Use Koyeb's free instance only for internal or very small invitation-only testing, where scale-to-zero and cold starts are acceptable. Prefer the low-cost `eco-micro` instance for an externally used beta if the free instance's 0.1 vCPU makes Better Auth's default `scrypt` password hashing or SSR unacceptably slow. Validate signup, sign-in, build/deploy, memory, cold starts, health checks, logs, rollback, and sustained response times before committing.
- **Managed PostgreSQL:** target one Neon project in Frankfurt and connect through its pooled connection endpoint using the Drizzle-compatible PostgreSQL driver selected during the deployment spike. Start on Neon Free only if the normalized Italy restaurant-and-hotel catalogue, indexes, Better Auth data, rankings, recommendation metadata, analytics allowance, and safety margin fit its current limits. Measure the real import with `pg_database_size`, table/index breakdowns, query plans, active compute time, and projected monthly cost. If Free is too small, evaluate Neon's usage-based Launch plan with scale-to-zero and conservative autoscaling limits; do not accept a projected recurring cost above the beta budget without revisiting scope or provider choice. Treat Neon's restore window as recovery help, not as the only backup.
- **OSM import/update execution:** own a repeatable TypeScript CLI in this repository. Run the first full Italy import manually or through an explicitly triggered GitHub Actions job; after the spike proves runtime and idempotency, run filtered updates on a conservative weekly schedule. Stream Geofabrik input into staging tables, validate counts/checksums/source timestamps, and promote a complete revision atomically. Do not run bulk ingestion in the Koyeb web process, commit PBF files, or store full extracts as workflow artifacts. GitHub workflows used for this purpose process public OSM data only, not personal ranking exports or database backups.
- **Transactional email:** keep the application-owned email interface and target Brevo's REST API for preview/beta/production verification and password-reset mail. Keep the console/in-memory transport local-only. Authenticate the sending domain with SPF, DKIM, and DMARC; test delivery, bounce/suppression behavior, rate limits, provider branding, expired/reused links, and background delivery before invitations. Send only the recipient and minimum template/action data, keep tokens and action URLs out of analytics and ordinary logs, and review Brevo's DPA, subprocessors, EU processing, and retention configuration before beta. Retain the ability to replace Brevo behind the same interface.
- **Product analytics:** implement the MVP collector and conversion attribution as first-party code backed by allowlisted domain events in the EU PostgreSQL database. Derive authoritative recommendation exposure-to-visited conversion from domain records. Store no email, name, free-form search text, precise coordinates, full action URLs, or raw comparison pairs in analytics; use internal pseudonymous identifiers and define detailed-event retention and aggregate cleanup before collection. Reconsider a managed EU analytics service such as PostHog only if beta analysis cannot be operated simply within the measured database budget.
- **Error reporting and logs:** target a Sentry Developer organization created in its EU/Germany region, plus structured redacted Koyeb stdout logs. Configure `sendDefaultPii: false`, inbound and application-side scrubbing, conservative tracing, and no session replay for the MVP. Never send cookies, authorization headers, emails, verification/reset URLs, raw ranking comparisons, or precise location data. Validate source-map upload, release association, alert delivery, quota behavior, and failure handling. Retain essential health and audit signals independently so loss or exhaustion of Sentry does not break the product.
- **Regional and processor constraints:** keep the application runtime, primary database, analytics records, and error-reporting storage in the EU, provisionally Frankfurt/Germany. Transactional email may process the address and message metadata/content only with an appropriate DPA and reviewed EU/cross-border subprocessors. Require TLS, least-privilege credentials, environment-separated secrets, documented retention/deletion, and a processor/subprocessor review before external beta users. Pseudonymous rankings remain personal data; do not describe them as anonymous.
- **Cost and final-decision gate:** aim for the free Koyeb, Neon, Brevo, and Sentry tiers during internal testing, then use the smallest continuously available Koyeb instance if beta UX requires it. Domain registration, taxes, backups, and paid database usage must be included in the measured total. Make the final vendor decision only after the Italy import and query spike plus a deployed end-to-end test have demonstrated acceptable size, latency, reliability, regional processing, email delivery, restore/backup behavior, and an expected recurring total within the agreed beta budget.

## Domain model proposal

Finalize names and constraints with small algorithm prototypes before generating the first domain migration.

- `place`: canonical identity, category, name, coordinates, locality/country, address, status, source, source element type/ID/version, explicit synthetic/demo marker, and timestamps.
- `place_translation` or localized provider fields only if catalogue names/descriptions require them; do not translate proper names by default.
- `place_media`: provider URL/reference, attribution, sort order, dimensions, and lifecycle metadata. Avoid copying remote images without explicit rights.
- `ranking_list`: owner, category, status (`draft`, `ranking`, `complete`, `stale`), ranking-engine version, revision, and timestamps. Enforce one active global list per `(owner, category)`; locality does not belong to list identity.
- `ranking_item`: list, place, computed ordinal position or tier, insertion time, and optional removal time. Unique `(list_id, place_id)`.
- `ranking_session`: list/revision, algorithm state, status, estimated/actual comparison count, and timestamps. Store state in a versioned representation that can be migrated or replayed.
- `comparison`: session, left place, right place, outcome (`left`, `right`, `tie`, `skip`), sequence, response time, superseded/undone marker, and timestamp. Enforce that both places belong to the list and differ.
- `recommendation_model`: category, recommendation-engine version, model family, hyperparameters/factor dimension, training-data cutoff, artifact identity/location, validation metrics, status, and timestamps. Restaurant and hotel artifacts are always separate.
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
- **Recommendation system:** a non-interactive collaborative algorithm that consumes the active, non-contradictory preference evidence from category-specific personal lists and predicts an ordered list for the current user. It may rank both visited and not-yet-visited places and apply locality as a result filter. Unresolved relations are omitted, while the resolved portions of a partial list may still contribute. It never changes the user's explicit personal ranking.

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

An explicit tied tier may be reconsidered when later transitive evidence contradicts it. Such evidence must open the same targeted local-repair flow; it must not silently split or overwrite the user's tie. For any preference cycle, first ask a clarifying comparison among the involved places. While that clarification is pending, retain the newest answer, exclude the oldest conflicting evidence from the active order, and show the affected places as needing repair. Once clarified, supersede evidence explicitly so the history remains auditable.

Personal rankings do not decay with age. Time alone never makes a comparison stale. Staleness arises only from concrete invalidation or contradiction, such as answers implying `A > B`, `C > A`, and `B > C`; in that case prompt a focused reranking of the involved places and apply the temporary newest-answer/oldest-evidence policy above.

Implement the ranking engine as a pure, framework-independent TypeScript module that emits the next comparison and consumes an outcome. The Svelte UI and persistence layer should not know the sorting algorithm's internal details.

Prototype and test at least these approaches against synthetic users:

- stable merge sort or assisted QuickSort for initial total ordering;
- binary insertion for one new item;
- ordered equivalence tiers, potentially backed by a comparison graph, for ties;
- cycle detection and a recovery policy for inconsistent preferences;
- reuse of still-valid comparisons when a user edits or resumes a list.

Measure number of questions, worst-case behavior, stability, reproducibility, ability to undo, and quality under ties/noise. Choose and document the algorithm before building the comparison UI. Persist the ranking-engine version so ranking state can be migrated or recomputed after changes.

Each completed category list is the authoritative record of the user's stated overall preference among visited places in that category. A locality-filtered view displays recalculated ordinal labels for the filtered subset, clearly identified as filtered positions; filtering never changes the underlying global position, tier, or ranking evidence.

The persisted ranking output must distinguish three relations: strict order, explicit equivalence, and unresolved/incomparable. Preserve the logical pair independently from randomized left/right card presentation, record why the comparison was requested, and retain supersession provenance. The ranking engine should continue optimizing for a fast and accurate personal list; it must not add questions solely to train recommendations in the MVP. When a skip blocks one path, try a useful alternative pivot before leaving an unresolved relation, without repeatedly pressuring the user to answer the skipped pair.

## Recommendation system

The recommendation system consumes user lists. Its output is a predicted global preference order for the current user, optionally filtered by locality.

Candidate results include both:

- **not-yet-visited places in the selected category**, which are the main discovery/recommendation use case;
- **visited places in that category**, which provide context, allow the predicted order to be evaluated against the user's actual order, and help explain where new places might fit.

### Selected model: low-rank personalized Plackett–Luce

Use a separate regularized low-rank personalized generalized Plackett–Luce model for each category, with Davidson–Luce tie handling. For user `u` and place `i`, the latent utility is:

`utility(u, i) = globalPlaceBias(i) + userFactors(u) · placeFactors(i)`

The model learns shared place factors and a global place prior from all eligible users, then infers the current user's small factor vector from their own ranking. It orders candidates by their inferred utility. This directly solves collaborative preference completion: it predicts how a user would order places they have not visited without treating unvisited places as dislikes or producing a public rating.

Use the latest active ranking revision as the canonical source, not an append-only bag of historical comparisons:

- A resolved ordered sequence of tiers is one listwise training observation. The listwise likelihood uses the whole relative order jointly rather than pretending every transitive pair is an independent answer.
- Explicit tied tiers enter through the tie likelihood. A tie is evidence of equivalence, not half a win and not missing data.
- For a partial ranking graph, add each active non-redundant strict or explicit-tie relation that is not already represented by a resolved listwise segment as a two-item observation under the same model family. Skip and unresolved relations contribute no outcome.
- Superseded answers, temporarily excluded contradictory evidence, deleted items, and previous list revisions do not train the current model. Do not count the direct comparisons again after their completed tier list has already represented them.
- Generate a versioned pairwise/rank-broken dataset or database view for diagnostics, reproducible exports, and a pairwise challenger model; do not make an `O(n²)` binary-comparison table the authoritative store or allow derived transitive pairs to inflate confidence.
- Normalize contribution by user/list revision so a long list supplies more information but does not dominate quadratically merely because more pairs can be derived from it.

Train category-wide place factors and biases periodically. At request time or after a ranking revision, hold those parameters fixed and compute a fast regularized maximum-a-posteriori estimate of the user's factors. Record the model version and ranking revision used. Estimate local uncertainty from the user-factor objective and combine it with item support counts for internal eligibility and calibration; never display it as a consumer rating.

This is the proposed production family because the input is genuinely ranked-list data. Listwise low-rank collaborative ranking can handle ties and missing observations while avoiding the false independence assumption of naive all-pairs expansion. The Phase 1 experiment must still compare it against a regularized low-rank pairwise Bradley–Terry preference-completion model, common-place nearest-neighbor rank aggregation, and smoothed global/random baselines. Ship the proposed model only after it wins the predefined held-out ranking metrics or document an evidence-based replacement in an ADR. Relevant foundations include [SQL-Rank](https://proceedings.mlr.press/v80/wu18c.html), [Preference Completion](https://proceedings.mlr.press/v37/park15.html), and the [generalized Plackett–Luce treatment of partial rankings and ties](https://link.springer.com/article/10.1007/s00180-020-00959-3).

### Eligibility, cold start, and locality

This model does not select recommendation “neighbors,” so no common-place count gates another individual user's contribution. Any category list with at least one active non-skip strict or explicit-tie relation may contribute to training, subject to per-list normalization and regularization. Restaurants and hotels never share observations, factors, thresholds, or evaluation results.

For serving personalized results, use a provisional MVP gate of at least five ranked places across at least three resolved tiers, including at least four places with supported model factors. Initially define a supported place as present in three or more independent eligible lists and connected to the category comparison graph. Tune these numbers independently per category in offline validation; enable the “personalized” label only for evidence buckets whose held-out pairwise accuracy reliably improves on the smoothed global prior. The personal list remains usable from two places regardless of recommendation eligibility.

When the user is below the gate or overlap is sparse, rank supported candidates by the model's regularized global place bias and label the result clearly as community-based/non-personalized. If even that evidence is insufficient, show an honest ranking-more/discovery state rather than manufacture preference from catalogue absence. Unsupported places remain searchable and addable as visited, but are not presented as confident recommendations.

Compute the category-wide candidate utilities first and apply locality to the resulting global order. Locality never trains a separate model or changes scores. If too few supported results match, show the shorter list and an explicit “expand area” action; never silently mix broader results into the active filter. If the user expands it, label the new geographic scope.

### Offline and live evaluation

For offline evaluation, split whole visited places or contiguous tier groups from each test user's ranking before generating any pairwise view. Fit the user's factors only from the remaining ranking and predict the held-out places. Never hold out a derived pair while leaving a transitive path to the same answer in training.

Report pairwise accuracy, tie-aware Kendall's `tau-b`, NDCG/top-tier retrieval, coverage, novelty, calibration by evidence bucket, and performance relative to the smoothed global prior. Split train/test by category and include temporal and geographic slices. A held-out visited place is only a proxy for an unseen recommendation; it must not be described as proof that the user would visit an actually unseen place. After launch, use attributed additions as visited as the primary recommendation conversion and the place's eventual personal rank as the delayed quality signal.

Run evaluation inside the controlled data boundary, retain only the minimum derived data required, and publish/log aggregated metrics with minimum cohort sizes rather than raw private rankings or user-level examples.

The output contract should include category, place, predicted order, visited state, confidence/eligibility metadata, and privacy-safe explanation data. Similarity or confidence values are internal signals, not consumer ratings. Recommendation versions and source ranking revisions must be recorded so results can be invalidated and evaluated independently of the ranking UX.

## Implementation phases

### Phase 0 — Baseline and decisions

- Make `npm run check`, `npm run lint`, unit tests, and a production build complete reliably.
- Remove or quarantine starter `task`, welcome, and demo code once equivalent product tests/routes exist.
- Record the MVP decisions listed above in this document or short ADRs.
- Spike the provisional Koyeb Node target, replace `adapter-auto` with the Node adapter for that spike, and preserve a clean deployment boundary until the post-test vendor decision is recorded.
- Define environment validation and separate development, test, preview, and production database configuration.
- Establish branch/CI checks for formatting, linting, type checks, unit tests, build, and focused end-to-end tests.

**Exit:** clean reproducible baseline, confirmed restaurant-first/hotel-before-beta rollout, catalogue/privacy model, and passing CI.

### Phase 1 — Separate algorithm spikes and contracts

- Define one contract for personal ranking state/comparison outcomes/progress and a separate contract for recommendation inputs/results.
- Build pure personal-ranking prototypes and property-based or exhaustive small-list tests. Test 2, 3, 10, 25, and larger lists; balanced, already ordered, reverse ordered, tied, skipped, and contradictory inputs; undo and resume.
- Validate the decided behavior for explicit equivalence tiers, skip, binary insertion, cycles, contradictions, and edits without reference to recommendation scoring, including repair after later evidence conflicts with an explicit tie.
- Do not implement a list-size cap or large-bucket splitting in the MVP; use spike measurements to record when either might become necessary.
- Build the category-specific low-rank generalized Plackett–Luce prototype with explicit tie support, regularized user/place factors, global place bias, fast per-user factor fitting, and a reproducible derivation from active ranking revisions.
- Benchmark it against low-rank pairwise Bradley–Terry preference completion, common-place nearest-neighbor rank aggregation, and smoothed global/random baselines. Tune rank, regularization, tie propensity, supported-item rules, and eligibility buckets without sharing parameters across categories.
- Split held-out places or tier groups before deriving training observations. Measure pairwise accuracy, tie-aware Kendall's `tau-b`, NDCG/top-tier retrieval, coverage, novelty, calibration, cold-start behavior, and improvement over the global prior. Use synthetic restaurant lists first, then hotel fixtures, and repeat the evaluation on appropriately consented real beta data before treating synthetic results as launch evidence.
- Validate the provisional serving gate of five ranked places, three resolved tiers, and four supported place factors separately for restaurants and hotels; change it when held-out evidence supports a better threshold.
- Verify if the proposed tied-tier insertion policy minimize questions without causing too many local repairs, and are the proposed `max(5 tiers, 25% of the list)` fallback threshold and second-member tie confirmation appropriate?
- Document each selected algorithm, limitation, version, and recomputation strategy independently.

**Exit:** deterministic engine contracts and evidence for the initial ranking and recommendation approaches.

### Phase 2 — Domain persistence and catalogue

- Replace the example schema with the domain tables, relations, constraints, and indexes.
- Generate and review the first domain migration; add test-database setup and reset helpers.
- Implement repositories/services so route code does not contain raw domain queries.
- Add a repeatable TypeScript OpenStreetMap PBF import/update pipeline, initially importing Italian restaurants, with manual/on-demand initial execution, a validated GitHub Actions update path, atomic staging/promotion, and environment-safe synthetic users/rankings.
- Normalize OSM nodes/ways/relations behind a catalogue provider interface and deduplicate by element identity plus geographic/name quality checks.
- Build locality-aware restaurant search over the imported application database; do not use public Nominatim for autocomplete.
- Add OSM attribution, ODbL compliance documentation, source-version tracking, and licence-aware optional image handling.
- Run and record the loose Italian restaurant coverage audit; block the milestone only for issues that clearly break or deeply bias the system.
- Add explicit provenance and enforcement so beta/production synthetic rankings cannot attach to real places or influence their recommendations.

**Exit:** a user, their global restaurant list, restaurants, session, and comparisons can be persisted and reconstructed; restaurant search works against imported OSM data and catalogue compliance is documented.

### Phase 3 — Product shell, authentication, and onboarding

- Define semantic color, spacing, typography, focus, motion, and card tokens with light/dark behavior.
- Create reusable shell, button, form, place card, non-photo fallback, empty/error state, progress, and dialog components; use Bits UI only where it improves accessible behavior.
- Install and use the official tree-shakable [`@lucide/svelte`](https://lucide.dev/guide/svelte) package for interface and category icons. Import icons statically by name so unused icons do not enter the bundle; centralize size, stroke, and semantic-color defaults in a small reusable icon wrapper or design tokens rather than restyling each use.
- Make the non-photo fallback occupy the same aspect ratio and layout slot as real media so cards do not shift. Use restrained category-specific surfaces, a large decorative category icon, and visible place name/category/locality; do not generate fake place-specific imagery or imply unavailable cuisine, amenities, quality, or branding.
- Treat fallback icons as decorative (`aria-hidden`) when adjacent text already communicates their meaning. Interactive icon-only controls require localized accessible names and tooltips where appropriate. Never rely on icon shape or color alone to distinguish category or state.
- Turn the Better Auth demo into product routes with validation, localized errors, safe redirects, rate-limit strategy, and session-aware navigation.
- Use email/password as the local-development authentication path. Keep provider-neutral account/session boundaries so late social-login integration does not require product-route changes.
- Introduce one application-owned transactional-email interface used by Better Auth callbacks. In local development, use a console/in-memory surrogate that records the recipient, purpose, and complete verification/reset URL for manual testing; it must be impossible to enable this transport in preview, beta, or production. Automated tests should inspect the in-memory outbox rather than scrape console output. Implement Brevo's REST API as the provisional hosted transport behind this interface, with provider-contract tests that do not make routine test runs send live mail.
- Implement link-based email verification according to Better Auth's [email verification documentation](https://better-auth.com/docs/concepts/email), using `emailVerification.sendVerificationEmail`, `sendOnSignUp: true`, `sendOnSignIn: true`, `autoSignInAfterVerification: true`, and a one-hour `expiresIn`. Configure `emailAndPassword.requireEmailVerification: true` in every environment so email/password users receive no authenticated session before proving address ownership; local development exercises the flow through the surrogate transport.
- Add localized “check your email,” verification success/failure/expired-link, and explicit resend states. Use generic sign-up responses for existing addresses as provided by Better Auth when verification is required; do not reveal account existence.
- Implement “forgot password” and reset-password routes using Better Auth's documented [`sendResetPassword`, `requestPasswordReset`, and `resetPassword` flow](https://better-auth.com/docs/authentication/email-password). Use a one-hour `resetPasswordTokenExpiresIn`, always show the same request confirmation regardless of whether the account exists, and set `revokeSessionsOnPasswordReset: true`.
- Keep verification and reset delivery callbacks non-blocking as recommended by Better Auth, while using the deployment platform's durable background-work mechanism where required so messages are not dropped. Never put tokens or full action URLs in analytics or ordinary production logs.
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
- Show two balanced place cards with the shared Lucide-based non-photo fallback when licensed media is absent or fails to load, plus name, area, and category-relevant metadata—never ratings.
- Randomize left/right presentation independently of the logical comparison and persist the logical pair plus request reason so presentation bias does not become training evidence.
- Support card tap/click, explicit buttons, keyboard controls, tie, “skip / cannot compare,” and undo. Treat swipes as progressive enhancement, not the only input.
- A skipped comparison leaves both places in the list, records no preference edge, and allows the engine to continue or finish with a partial order when strict placement cannot be inferred.
- When skipped comparisons leave insufficient evidence for a total order, render the affected places as an unresolved tier. Preserve resumable state so targeted comparisons can be added later without blocking the initial MVP flow.
- After a skip, try a useful alternative comparison when it can narrow placement; do not repeat or replace the skipped outcome with inferred evidence merely to help recommendations.
- Save each response idempotently before advancing; handle double taps, stale revisions, multiple tabs, offline/interrupted requests, and session expiry.
- Add reduced-motion-safe transitions, selection feedback, and an honest progress estimate.
- Use occasional partial-ranking feedback only if it does not reveal unstable or misleading positions.
- On completion, present the ranked list/tier groups and allow confirmation or editing.

**Exit:** the core flow is accessible, resumable, concurrency-safe, and produces a reproducible persisted ranking.

### Phase 6 — Existing-list maintenance

- Add a new visited place to a completed list using binary insertion.
- Implement targeted local repair when later transitive evidence contradicts an explicit tied tier; never split a tie silently.
- Detect preference cycles and ask a clarifying comparison. Pending clarification, retain the newest answer, temporarily exclude the oldest conflicting evidence, and prompt a focused reranking of the involved places.
- Do not age or decay personal-ranking evidence over time; mark rankings stale only after concrete contradiction or invalidation.
- Support removing a place and changing an answer without unnecessarily discarding valid evidence.
- Show clearly labelled, recalculated ordinal positions in locality-filtered personal-list views without modifying the global ranking.
- Mark downstream recommendation results stale when a ranking revision changes.
- Provide deliberate “rebuild this list” and delete actions with clear consequences.

**Exit:** rankings remain maintainable over time rather than being one-use onboarding artifacts.

### Phase 7 — Personalized recommendations

- Build versioned restaurant model artifacts from current active ranking revisions. Consume resolved evidence from complete or partial lists, exclude skips/unresolved/superseded/contradictory evidence, and never mutate explicit personal rankings.
- Fit the current user's regularized factors from their latest ranking while keeping the trained place factors fixed; return visited and not-yet-visited candidates ordered by latent utility with internal support/eligibility metadata.
- Make the full predicted order the default view and display visited status clearly; do not default to an unseen-only discovery feed.
- Apply locality after the global order is scored. When filtered support is sparse, return fewer results and offer an explicit scope expansion rather than silently inserting broader candidates.
- Enforce the validation-calibrated personalization gate. Below it, use the regularized global place prior with a clear community-based/non-personalized label, ask the user to rank more visited restaurants, or show an honest insufficient-evidence state. Generalize the copy by category when hotels are added.
- Clearly distinguish predicted recommendation positions from personal ranking positions. Present concise recommendation reasoning and a path to mark “already visited,” feeding that place into the ranking UX for its category.
- Instrument recommendation exposure and conversion first-party: an exposure occurs only when an eligible, previously unvisited result is actually rendered to the user. Count at most one conversion per `(user, category, place)` when that place is added as visited within 90 days of its most recent eligible exposure. Exclude synthetic/demo data and places already marked visited at exposure time.
- Cache or snapshot only after measuring latency; version results and invalidate on relevant ranking/catalogue changes.
- Evaluate recommendation quality with leakage-safe held-out fixtures and appropriately consented real beta data before launch; after launch, measure delayed agreement when recommended places are later added and ranked.

**Exit:** users who pass the calibrated evidence gate receive an explainable predicted order of visited and unseen restaurants, filterable by locality without altering their global restaurant list; all other users see an honest useful next step.

### Phase 8 — Add hotels before beta

- Extend the Italy OSM importer and loose coverage audit to `tourism=hotel`, preserving the same canonical place/provider contracts and blocking beta only for clearly breaking or deeply biasing issues.
- Add hotel-specific catalogue metadata, search filters, empty states, and the `Hotel` variant of the shared Lucide-based card fallback, plus localized overall-preference copy without branching the shared ranking components unnecessarily.
- Enable one separate global hotel list per user and enforce that comparisons and recommendations never cross categories.
- Exercise the existing ranking engine against hotel fixtures and behavior; introduce category-specific policy only where product evidence requires it.
- Validate the recommendation engine independently for hotels, including evidence/support thresholds, cold starts, locality filtering, and visited/unseen result labeling.
- Add restaurant-and-hotel integration, component, algorithm, and end-to-end coverage.
- Run an Italian hotel catalogue/licensing quality review and targeted usability sessions before declaring beta readiness.

**Exit:** restaurants and hotels both support the complete authenticated selection → personal ranking → recommendation loop, and no beta is released until both categories meet their quality gates.

### Phase 9 — Hardening and beta release

- Threat-model authentication, authorization/IDOR, catalogue ingestion, comparison writes, rate limiting, CSRF, XSS, and abuse paths.
- Near the end of beta hardening, add social login with Sign in with Google as the minimum provider. Configure separate development/preview/production OAuth clients and exact redirect origins; request only the minimum scopes needed for authentication.
- Link a social identity to an existing account only through Better Auth's verified, explicit account-linking rules. Test duplicate-email, provider-email changes, revoked consent, cancelled callbacks, state/PKCE and redirect validation, existing sessions, account deletion, and recovery so Google login cannot create duplicate profiles or orphan rankings.
- Retain email/password alongside Google login unless a later product decision explicitly removes it. Replace the local email surrogate with the transactional provider selected under question 18, verify domain/authentication and deliverability configuration, and run end-to-end delivery checks before inviting beta users.
- Add independent database backup/restore, migration rollout/rollback, health checks, structured redacted Koyeb logs, and the provisionally selected Sentry EU/Germany error reporting with source maps, releases, alerts, PII scrubbing, conservative tracing, and no MVP session replay.
- Complete accessibility testing for keyboard, screen reader, contrast, touch targets, zoom, reduced motion, and both locales.
- Add privacy policy, terms/provider attribution, consent/retention rules, data export if required, and account/data deletion.
- Run responsive and cross-browser end-to-end tests of sign-up, draft/resume, ranking, insertion, recommendation, locale switching, and failure recovery.
- Verify beta synthetic-data labelling and isolation, including that no synthetic ranking evidence is associated with or affects real places.
- Run a small private beta with both restaurants and hotels in the chosen area; measure and review each category separately before expanding the catalogue.

**Exit:** operable production release with defined rollback, support, privacy, and measurement procedures.

### Future — patron-confirmed review trust

Do not implement malicious/coordinated-ranking detection or public reputation scores in the MVP. When written reviews are reconsidered after the core loop is validated, prototype a positive trust signal in which independent patrons can confirm that another client's review is fair, honest, and useful. Require multiple independent confirmations before they affect trust so coordinated manipulation is materially harder; confirmations must never alter the reviewer's private personal ranking.

Design this as encouragement for kind, factual reviewing rather than as a public blame or downvote mechanism. Before implementation, define what makes a patron eligible to confirm, how visit/account independence is established, caps and conflict-of-interest rules, privacy and appeal behavior, and how confirmations may cautiously weight future recommendation evidence.

## Testing strategy

- **Pure unit tests:** ranking state machine, progress bounds, ties, contradictions, undo, serialization/version migration, recommendation scoring, recommendation-exposure attribution/deduplication, and permission helpers.
- **Database integration tests:** constraints, transactions, idempotency, list ownership, concurrent revisions, seed imports, verification/reset token expiry and single use, session revocation after password reset, and recommendation queries against isolated PostgreSQL.
- **Component tests:** place cards with missing/broken media, restaurant/hotel fallback variants, decorative versus interactive icon accessibility, bucket, comparison controls, focus management, localization, reduced motion, and all loading/error/empty states.
- **End-to-end tests:** authentication/disclosure; blocked sign-in before email verification; verification resend/success/expired link; generic duplicate-sign-up and password-reset responses; password-reset success/invalid or reused token/session revocation; Google sign-in and account linking before beta; create/resume a draft; complete a 2-place and larger ranking; tie/skip/undo; refresh mid-session; concurrent-tab conflict; insert/remove a place; view the full predicted order with visited status and locality filtering; receive or fail gracefully to receive recommendations; delete data.
- **Algorithm tests:** exhaustive permutations for small lists and generated noisy/tied/partial rankings for larger lists; listwise likelihood and gradient checks; deterministic pairwise-view derivation; no double counting across revisions; skip/unresolved exclusion; tie handling; per-list normalization; cold-start shrinkage; locality-invariant scores; held-out split leakage checks; and reproducible benchmark metrics.
- **Non-functional tests:** mobile performance on a throttled connection, catalogue/recommendation query plans, basic load tests, and automated accessibility checks backed by manual review.

Use deterministic seeds and clocks where possible. Do not make routine tests depend on a live external place API.

## Analytics and success measures

Define events and privacy/retention before collection. Avoid place names, search text, precise coordinates, emails, and raw comparison pairs in third-party analytics unless explicitly justified and consented.

For the MVP, collect an allowlisted event vocabulary through a first-party service and store it inside the EU PostgreSQL boundary with explicit retention and cleanup. Prefer authoritative domain records for recommendation exposures, additions as visited, and ranking completion rather than duplicating them as untrusted client events. A managed EU analytics product remains a fallback only if this approach becomes operationally burdensome or materially distorts the database budget.

Initial funnel:

- landing call-to-action → account/draft started;
- first place selected → two-place ranking threshold;
- ranking started → ranking completed;
- median comparisons and time to completion by list size;
- abandon/resume, tie, skip, undo, and error rates;
- recommendation exposures → detail/open/save/directions/booking-click intent events → later addition as visited;
- primary recommendation conversion rate: unique exposed, previously unvisited places added as visited within 90 days, deduplicated per user/category/place and attributed to the most recent eligible exposure;
- post-conversion quality: percentage of converted places later inserted into the personal ranking and their predicted-versus-actual rank agreement;
- percentage of users with enough overlap for personalized results;
- return rate to add a newly visited place.

Set numeric beta targets after prototype usability sessions establish realistic baselines.

## Open questions

Replace with ANSWERED when the question is answered and decisions are documented elsewere in this plan.

### Personal ranking UX and ranking-engine questions

1. ANSWERED — later contradictory transitive evidence prompts targeted repair under the tied-tier insertion policy; it never splits an explicit tie silently.
2. ANSWERED
3. ANSWERED — ask a clarifying comparison; until it is completed, retain the newest answer and temporarily omit the oldest conflicting evidence from the active order.
4. ANSWERED — personal rankings do not decay over time. Contradictions trigger focused reranking of the involved places, with the oldest conflicting evidence temporarily omitted until the user resolves them.
5. ANSWERED — do not implement a list-size cap or large-bucket splitting in the MVP; measure and reconsider later if needed.
6. ANSWERED — show clearly labelled filtered ordinal positions while preserving the underlying global order and tiers.
7. ANSWERED — show an unresolved tier. Preserve the state so a later iteration can ask targeted comparisons.

### Recommendation-system questions

8. ANSWERED — the low-rank model has no individual neighbors or common-place gate. Any list with an active non-skip strict or tie relation may contribute with normalized weight; serving confidence and thresholds are calibrated independently per category.
9. ANSWERED — use category-specific regularized low-rank generalized Plackett–Luce with Davidson–Luce ties, subject to the Phase 1 benchmark gate. Fall back to its smoothed global place prior with a non-personalized label, then to an honest insufficient-evidence state.
10. ANSWERED — score the global category order first and filter it by locality afterward. Show fewer results when support is sparse and require an explicit, clearly labelled action to expand the area.
11. ANSWERED — resolved tier lists enter listwise, explicit ties enter the tie likelihood, and active non-redundant relations from partial graphs enter as two-item observations. Skips and unresolved relations contribute nothing; derived transitive pairs never count as independent evidence.
12. ANSWERED FOR MVP — do not implement malicious/coordinated-ranking detection yet. After reviews are introduced, research multiple independent patron confirmations of a client's fair and honest review as a future positive trust signal, without creating a public reputation score.
13. ANSWERED — hold out whole places or tier groups before any pairwise derivation, fit the user from what remains, and report aggregate tie-aware ranking metrics inside the controlled data boundary. Treat held-out visited places only as an offline proxy and later ranked visits as the live signal.
14. ANSWERED — provisionally require five ranked places across three resolved tiers, including four supported place factors; initially, support means presence in at least three independent eligible lists and connection to the category graph. Validate and tune separately for restaurants and hotels. Personal ranking still starts at two places.

### Product and operations

15. ANSWERED — email/password is sufficient for local development. For beta, require link-based email verification before email/password sign-in, auto-sign in after successful verification, and offer link-based password reset that revokes existing sessions; verification and reset links expire after one hour. Add Sign in with Google near the end of beta hardening. Passkeys and additional social providers are deferred.
16. ANSWERED — the primary launch conversion is later addition of an exposed, previously unvisited recommendation as visited, within a 90-day attribution window and deduplicated per user/category/place. Open, save, directions, and booking clicks remain secondary intent events; later ranking placement is a separate quality signal.
17. ANSWERED — use a shared category-themed fallback panel built with `@lucide/svelte`: `UtensilsCrossed` for restaurants and `Hotel` for hotels, accompanied by the visible place name, category, and locality. Preserve the media aspect ratio, avoid generic stock imagery and unsupported metadata, and add no second icon library for the MVP because Lucide covers the required cases.
18. ANSWERED PROVISIONALLY — the current beta target is Koyeb Node hosting in Frankfurt, Neon PostgreSQL in Frankfurt, an application-owned OSM TypeScript importer run manually and then through validated GitHub Actions updates, first-party allowlisted analytics in PostgreSQL, Sentry EU/Germany for scrubbed error reporting, and Brevo's REST API for transactional email. Keep the application email, catalogue-ingestion, analytics, and observability boundaries provider-neutral. Make the final vendor decision only after local/import and deployed end-to-end tests verify catalogue/index size, Better Auth performance, database cost/activity, backups/restores, email delivery, reliability, and the documented EU/DPA/subprocessor constraints within the beta budget.
19. What data export, retention, deletion, age restriction, and consent requirements apply? In particular, when an account is deleted, which comparison data must be erased rather than irreversibly anonymized and retained?
20. Who can correct, merge, hide, or remove bad OSM-derived catalogue records locally, how are upstream corrections handled, and what audit trail is needed?
21. Is public sharing of a completed list ever compatible with “private by default,” or should it remain explicitly deferred beyond the MVP?
22. What beta cohort and qualitative research method will separately determine whether the ranking UX is usable and whether recommendations are credible?
23. Does the proposed pre-registration wording meet the eventual legal basis and transparency requirements, and what revisions are required after legal review?

## Suggested immediate next actions

1. Run the loose Italy OpenStreetMap restaurant coverage/licence/import spike, including normalized Neon storage/index and projected-cost measurements, followed by an early hotel coverage check to protect the beta commitment.
2. Run a thin Koyeb/Neon/Brevo/Sentry deployment spike after the local vertical slice exists, measuring Better Auth `scrypt`, SSR/query latency, cold starts, mail delivery, error scrubbing, restore/backup behavior, regional processing, and expected monthly cost before finalizing providers.
3. Diagnose the baseline command hang and establish green local/CI checks.
4. Prototype the personal-ranking state machine—including two-place start and skip behavior—and, independently, the recommendation baseline with synthetic global restaurant lists before committing the schema; include hotel fixtures when validating category boundaries.
5. Define and test synthetic-data provenance guards before creating shared beta/demo seeds.
6. Validate the authenticated selection and two-card ranking flow with a clickable low-fidelity mobile prototype and 5–8 target users, including the proposed registration disclosure.
7. Then implement one thin ranking vertical slice: imported Italian OSM restaurant search → global visited-restaurant bucket → persisted comparisons → completed private personal list.
8. After that data path is reliable, add the full predicted-order recommendation view with visited status and locality filtering, then extend the complete loop to hotels before beta.
