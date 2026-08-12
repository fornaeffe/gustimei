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
- Cross-site analytics, advertising identifiers, fingerprinting, profiling pixels, and session replay.
- Marketing, promotional, newsletter, or re-engagement email; MVP email is transactional and account-related only.

## Confirmed MVP product decisions

1. **Category rollout:** implement restaurants first to validate the complete ranking and recommendation loop. Add hotels as the second category before the first beta release. Category-specific behavior must remain behind shared domain and UI contracts rather than being hard-coded into the restaurant flow.
2. **Place catalogue:** use OpenStreetMap as the primary restaurant and hotel catalogue. Import regional extracts into an application-owned search index/database rather than relying on public OSM services at request time. See “OpenStreetMap catalogue approach” below.
3. **Ranking scope:** each user has one global list per category. Locality is metadata used to search, filter, and display subsets; it is not part of list identity.
4. **Comparison meaning:** overall preference. Keep the prompt stable within each category and localized, for example “Overall, which restaurant did you prefer?” and “Overall, which hotel did you prefer?”
5. **Ties:** support explicit equivalence tiers. “Tie” means equal overall preference and may result in the same displayed position. Keep “skip / cannot compare” separate because it supplies no preference evidence. The ranking-engine spike must validate how tiers interact with insertion and contradictory answers.
6. **Identity:** users must register or sign in before they can add or rank visited places. There is no anonymous draft-to-account handoff in the MVP. Email/password is sufficient during local development. For beta, require email verification before an email/password account can sign in and provide a link-based password-reset flow. Add social login, with Sign in with Google as the minimum provider, as one of the final beta-release steps while retaining email/password as a supported method.
7. **Privacy and participation:** personal rankings are private in the UI but their pseudonymous preference data is used to calculate recommendations for the user and community. Reciprocal preference contribution is designed as an essential feature rather than an optional product toggle, subject always to access, erasure, restriction, portability, objection where applicable, and the other rights provided by law. State this clearly before registration and reflect it in the privacy notice, terms, deletion behavior, lawful-basis assessment, and analytics design.
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
21. **Legal-design baseline:** make the MVP available only to adults aged 18 or over; use purpose-specific GDPR lawful bases rather than bundled consent; provide self-service access/export and deletion; erase account-linked ranking evidence on deletion; and complete a DPIA, processing record, retention schedule, processor review, and legal review before public deployment. Recommendations are profiling but are designed only as suggestions, without legal or similarly significant effects.
22. **MVP communications and tracking:** send only authentication, security, privacy/terms, data-rights, and essential service-operation email. Do not send marketing email. Use necessary first-party authentication/preferences storage and first-party server-side analytics only; do not implement cross-site analytics, non-essential tracking, fingerprinting, pixels, advertising identifiers, or session replay.
23. **Catalogue governance:** ordinary users may submit structured catalogue issue reports but cannot modify catalogue records. Only a least-privilege catalogue curator or administrator can apply reversible local corrections, quarantine/hide records, or create canonical merge redirects. Preserve imported OSM facts separately from local overlays, audit every moderation action, never automatically write changes to OSM, and reconcile verified upstream changes on later imports.
24. **Public list sharing:** defer public or link-based sharing of completed personal lists beyond the MVP. Rankings remain private to their owner in every MVP route, API, export authorization, and search surface.
25. **Beta research definition:** define the beta cohort, recruitment, qualitative method, scripts, consent, incentives, and success interpretation in a separate research brief outside this implementation plan. This plan records only the product/engineering gates and the requirement to execute the approved research before expansion.

### Proposed pre-registration disclosure

Show this close to the registration action, with links to the privacy policy and terms. It should be visible before account creation rather than hidden only inside legal documents.

**Italian (primary):**

> Le tue classifiche sono private e non vengono mostrate agli altri utenti. Per fornirti raccomandazioni, GustiMei analizza automaticamente le tue preferenze e le combina, tramite identificativi pseudonimi, con quelle degli altri membri della community. Allo stesso modo, le tue preferenze contribuiscono alle raccomandazioni degli altri senza rendere pubblico il tuo profilo o la tua lista.
>
> Questo contributo reciproco è una caratteristica essenziale del servizio. Le raccomandazioni fornite sono solo suggerimenti. Puoi accedere ai tuoi dati, esportarli, correggerli, cancellare classifiche o account ed esercitare gli altri diritti descritti nell'Informativa privacy.

**English:**

> Your rankings are private and are not shown to other users. To provide recommendations, GustiMei automatically analyzes your preferences and combines them, using pseudonymous identifiers, with preferences from other community members. In the same way, your preferences contribute to other members' recommendations without making your profile or list public.
>
> This reciprocal contribution is an essential feature of the service. Recommendations are suggestions and do not produce legal or similarly significant effects. You can access, export or correct your data, delete rankings or your account, and exercise the other rights described in the Privacy Notice.

Place one required unchecked control below this disclosure: “Dichiaro di avere almeno 18 anni e accetto i Termini di servizio” / “I confirm that I am at least 18 and accept the Terms of Service.” Link the Privacy Notice separately and visibly; do not require an “I consent to the Privacy Notice” checkbox or treat notice acknowledgement as consent.

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

### Catalogue correction and moderation policy

Keep the imported provider snapshot immutable for provenance and apply local decisions through a separate overlay. Search and display resolve the effective place from the current OSM snapshot plus active overrides and redirects; imports never silently overwrite or erase a local moderation decision.

Roles and intake:

- Any authenticated user may submit a structured issue report such as wrong name/location/category, duplicate, closed/nonexistent, unsafe content, or other. Reports are private operational records, not public reviews; rate-limit them and minimize optional free text.
- A `catalogue_curator` may triage reports, apply or expire field-level overrides, and quarantine/unquarantine a place. An `admin` may do the same and may also approve merges, reversals, and exceptional removals. In a single-operator beta the administrator may hold both roles, but the permissions and audit identities remain distinct so duties can be separated later.
- Neither ordinary users nor claimed business owners can directly edit, merge, hide, or remove a catalogue place in the MVP. Business claims remain out of scope.

Local actions:

- **Correct:** store only the changed effective fields as a provenance-bearing override with reason, evidence/reference, actor, review status, and optional expiry. Never mutate the imported OSM value in place.
- **Hide/quarantine:** remove the place from search and new recommendations immediately while retaining its stable identity, source history, existing list references, and audit trail. Existing owners see a neutral unavailable/under-review state rather than a vanished list item. Quarantined evidence does not train or serve new recommendations until restored.
- **Merge:** select one stable canonical application place and redirect every duplicate application/source identity to it. Show an impact preview, perform the redirect and reference migration transactionally, invalidate affected search/model artifacts, and keep the operation reversible. If one user had both duplicates, collapse to one visited item, preserve the original history as superseded evidence, and mark the affected ranking for targeted repair rather than inventing a preference.
- **Remove:** reserve physical deletion for unreferenced erroneous/synthetic records or a validated legal/security requirement. OSM-derived records that were referenced by rankings are soft-deleted/tombstoned; use hide or redirect for ordinary catalogue errors.

Upstream handling:

- Do not make automated OSM edits and do not treat a user report as sufficient evidence for an upstream change. A curator may separately correct OSM through a named human OSM account only when the fact is verifiable under OSM's contributor rules and compatible sources; never copy proprietary provider data into OSM.
- Record the OSM changeset ID and affected element IDs on the local issue. Keep an urgent local override when product safety or correctness cannot wait for the next extract.
- On import, compare changed OSM values with active overrides. If upstream now matches the verified correction, propose retiring the override after review. If it conflicts, keep the effective local decision and reopen the issue; never resolve the conflict silently.
- Handle OSM deletion, retagging, split, or merge through stable application IDs and source-identity mappings. Reconcile redirects before replacing catalogue revisions, and invalidate affected ranking/recommendation caches or artifacts.

Maintain an append-only `catalogue_change` audit entry for every report transition and effective mutation: action ID/type/status, actor and role, target and canonical/source identities, before/after diff, reason category, evidence references, linked report, upstream changeset where applicable, timestamps, importer revision, impact counts, and reversal/supersession linkage. Do not put secrets or unnecessary reporter personal data in the audit. Restrict audit access to curators/admins, retain it for the catalogue's operational life, and export it with backups so every effective record can answer what changed, why, by whom, from which source revision, and how it was reversed.

## Provisional deployment and operations approach

Use the following as the current target for implementation and deployment spikes. Keep provider boundaries explicit so the final choice can change without rewriting domain or authentication logic.

- **Application hosting:** target Koyeb in Frankfurt using SvelteKit's Node adapter and a normal Node runtime. Use Koyeb's free instance only for internal or very small invitation-only testing, where scale-to-zero and cold starts are acceptable. Prefer the low-cost `eco-micro` instance for an externally used beta if the free instance's 0.1 vCPU makes Better Auth's default `scrypt` password hashing or SSR unacceptably slow. Validate signup, sign-in, build/deploy, memory, cold starts, health checks, logs, rollback, and sustained response times before committing.
- **Managed PostgreSQL:** target one Neon project in Frankfurt and connect through its pooled connection endpoint using the Drizzle-compatible PostgreSQL driver selected during the deployment spike. Start on Neon Free only if the normalized Italy restaurant-and-hotel catalogue, indexes, Better Auth data, rankings, recommendation metadata, analytics allowance, and safety margin fit its current limits. Measure the real import with `pg_database_size`, table/index breakdowns, query plans, active compute time, and projected monthly cost. If Free is too small, evaluate Neon's usage-based Launch plan with scale-to-zero and conservative autoscaling limits; do not accept a projected recurring cost above the beta budget without revisiting scope or provider choice. Treat Neon's restore window as recovery help, not as the only backup.
- **OSM import/update execution:** own a repeatable TypeScript CLI in this repository. Run the first full Italy import manually or through an explicitly triggered GitHub Actions job; after the spike proves runtime and idempotency, run filtered updates on a conservative weekly schedule. Stream Geofabrik input into staging tables, validate counts/checksums/source timestamps, and promote a complete revision atomically. Do not run bulk ingestion in the Koyeb web process, commit PBF files, or store full extracts as workflow artifacts. GitHub workflows used for this purpose process public OSM data only, not personal ranking exports or database backups.
- **Transactional email:** keep the application-owned email interface and target Brevo's REST API for preview/beta/production verification, password reset, security, material terms/privacy changes, data-rights, and strictly necessary service-operation mail. Keep the console/in-memory transport local-only. Authenticate the sending domain with SPF, DKIM, and DMARC; test delivery, bounce/suppression behavior, rate limits, provider branding, expired/reused links, and background delivery before invitations. Send only the recipient and minimum template/action data, keep tokens and action URLs out of analytics and ordinary logs, and review Brevo's DPA, subprocessors, EU processing, and retention configuration before beta. Do not send marketing, promotional, newsletter, or re-engagement email in the MVP. Retain the ability to replace Brevo behind the same interface.
- **Product analytics:** implement the MVP collector and conversion attribution as first-party code backed by allowlisted domain events in the EU PostgreSQL database. Derive authoritative recommendation exposure-to-visited conversion from domain records. Store no email, name, free-form search text, precise coordinates, full action URLs, or raw comparison pairs in analytics; use internal pseudonymous identifiers and define detailed-event retention and aggregate cleanup before collection. Do not integrate a third-party or cross-site analytics service, browser analytics identifier, pixel, fingerprint, or session replay in the MVP. Any later managed-analytics proposal is a new product/privacy decision rather than an implicit fallback.
- **Error reporting and logs:** target a Sentry Developer organization created in its EU/Germany region, plus structured redacted Koyeb stdout logs. Configure `sendDefaultPii: false`, inbound and application-side scrubbing, conservative tracing, and no session replay for the MVP. Never send cookies, authorization headers, emails, verification/reset URLs, raw ranking comparisons, or precise location data. Validate source-map upload, release association, alert delivery, quota behavior, and failure handling. Retain essential health and audit signals independently so loss or exhaustion of Sentry does not break the product.
- **Regional and processor constraints:** keep the application runtime, primary database, analytics records, and error-reporting storage in the EU, provisionally Frankfurt/Germany. Transactional email may process the address and message metadata/content only with an appropriate DPA and reviewed EU/cross-border subprocessors. Require TLS, least-privilege credentials, environment-separated secrets, documented retention/deletion, and a processor/subprocessor review before external beta users. Pseudonymous rankings remain personal data; do not describe them as anonymous.
- **Cost and final-decision gate:** aim for the free Koyeb, Neon, Brevo, and Sentry tiers during internal testing, then use the smallest continuously available Koyeb instance if beta UX requires it. Domain registration, taxes, backups, and paid database usage must be included in the measured total. Make the final vendor decision only after the Italy import and query spike plus a deployed end-to-end test have demonstrated acceptable size, latency, reliability, regional processing, email delivery, restore/backup behavior, and an expected recurring total within the agreed beta budget.

## Privacy, retention, deletion, and legal-design proposal

This section is a product and engineering proposal based on the [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng/), the [Italian Privacy Code](https://www.garanteprivacy.it/documents/10160/0/Codice%2Bin%2Bmateria%2Bdi%2Bprotezione%2Bdei%2Bdati%2Bpersonali%2B%28Testo%2Bcoordinato%29.pdf/b1787d6b-6bce-07da-a38f-3742e3888c1d?version=1.8), relevant [Garante DPIA criteria](https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9058979), [EDPB contractual-necessity guidance](https://www.edpb.europa.eu/documents/guideline/guidelines-22019-on-the-processing-of-personal-data-under-article-61b-gdpr-in_en), the [EU AI Act](https://eur-lex.europa.eu/eli/reg/2024/1689/oj), and [Italian Law 132/2025](https://www.normattiva.it/eli/id/2025/09/25/25G00143/CONSOLIDATED). It is not legal advice. Before public deployment, Italian counsel must validate the controller identity, lawful bases, terms/notices, age approach, processor agreements and transfers, retention schedule, recommendation-system classification, and whether any residual risk requires prior consultation with the Garante.

### Purposes and provisional lawful bases

- Use GDPR Article 6(1)(b), contractual necessity, provisionally for registration, authentication, private personal rankings, and user-requested personalized recommendations. Keep the service contract's fundamental object narrow and truthful; terms cannot make otherwise unnecessary processing contractually necessary.
- Provisionally treat reciprocal contribution of active ranking evidence to the category-specific community model as part of that fundamental service. Before beta, write and obtain legal review of a necessity assessment explaining why reciprocal preference contribution is objectively required and reasonably expected. If it fails that test, use a documented Article 6(1)(f) legitimate-interest assessment with an effective right to object, or redesign contribution as genuinely optional consent; do not disguise a mandatory operation as consent.
- Use documented legitimate interest, subject to necessity and balancing tests, for proportionate account security, abuse prevention, minimal operational logging, and first-party product measurement that is not strictly contractual.
- Use consent only for genuinely optional purposes. The MVP has no marketing email, advertising, cross-site analytics, session replay, or non-essential tracking, so it must not request consent for those absent purposes.
- Treat verification, password-reset, security, material terms/privacy changes, data-rights, and essential service-operation email as transactional. Do not mix promotional content into those messages or reuse their addresses for marketing.
- Maintain a processing record mapping every field/event to purpose, lawful basis, recipients, retention, security controls, and deletion behavior. Do not switch lawful basis retrospectively to rescue an incompatible use.

The recommendation engine evaluates personal preferences and therefore constitutes profiling. Design its output only as restaurant/hotel suggestions without legal or similarly significant effects, and document why GDPR Article 22 is not triggered. Explain the model's purpose, broad inputs and logic, uncertainty, limitations, category separation, and consequences in accessible Italian and English. Reassess this conclusion if bookings, prices, eligibility, business treatment, or other consequential decisions are later introduced.

Restaurant/hotel choices and locality may incidentally suggest religion, health, sexuality, or movements. Do not infer, label, segment, explain, or optimize for protected characteristics; exclude sensitive catalogue tags from analytics and consumer explanations, and do not interpret a visited place as current location or residence. Review any future dietary, accessibility, or travel-history feature for GDPR Article 9 implications before collecting it.

### Age and minors

- Make registration and use 18+ for the MVP even though Italian law provides rules under which some users aged 14 or over may consent to information-society and AI-related processing. This avoids parental authorization, child-specific transparency, contract-capacity, age-assurance, and heightened profiling requirements during core validation.
- Require an unchecked declaration of being at least 18 together with Terms acceptance. Store only declaration version and timestamp, not date of birth or identity documents.
- Block a declared under-18 registration. Define a support procedure to restrict and then delete an account when there is credible knowledge that its user is underage.
- Do not collect identity documents, biometrics, selfies, or inferred-age signals in the MVP. Before public deployment, have counsel assess whether self-declaration provides proportionate assurance for this service; introduce stronger privacy-preserving age assurance only if required.

### User access and export

Provide a self-service export containing a README, canonical JSON, and convenient CSV tables. Include profile/settings, linked sign-in provider names without secrets, visited places, ranking tiers/unresolved states, direct comparisons/ties/skips and supersession history, recommendation exposures/conversions, user-specific recommendation metadata, relevant algorithm versions, and privacy-choice/request history. Do not expose password hashes, tokens, secrets, another person's data, or model artifacts that would reveal other users.

Generate exports asynchronously, encrypt them at rest, make the download single-use or expire it after 24 hours, and delete generated archives after seven days. Verify the requester and maintain a manual path for access, rectification, restriction, portability, objection, and complaints; a portability export does not automatically satisfy the broader right of access. Track the GDPR response deadline while targeting substantially faster completion.

### Erasure and model removal

On account deletion:

1. Immediately revoke sessions, prevent sign-in, mark the account pending erasure, and stop its data from entering new analytics or training runs.
2. Delete the email/social identities, profile, lists/items, ranking sessions, direct comparisons including ties/skips, recommendation snapshots/exposures, analytics events, and user-specific latent factors from live systems within 30 days.
3. Exclude the user's evidence from future training, invalidate affected restaurant/hotel artifacts, and rebuild them without that evidence within the same 30-day window. Do not claim erasure while a deployed model intentionally retains an identifiable user's contribution.
4. Retain derived statistics only after demonstrating that they are genuinely anonymous and cannot reasonably single out or relink the person. Removing a user ID from place/locality/timestamp evidence is not sufficient anonymization.
5. Keep only a restricted minimal erasure/request audit when a documented legal-claims or accountability need justifies it. Never retain the deleted preference history in that audit.
6. Let encrypted backups expire within their rolling window. Any restored backup must replay erasure tombstones before serving traffic or contributing to model training.

Deleting one ranking category follows the same evidence-removal and category-model invalidation process for that category while leaving the account and other category intact.

### Provisional retention schedule

Enforce these defaults through scheduled jobs and tests; final periods remain subject to the DPIA and legal review.

| Data | MVP retention |
| --- | --- |
| Active account, visited places, rankings, and comparisons | While the account is active or until the category/account is deleted |
| User-specific recommendation factors and replaceable snapshots | Until superseded, category/account deletion, or 90 days after last relevant use |
| Recommendation exposures required for the 90-day conversion | 120 days |
| Detailed first-party analytics events | 90 days |
| Anonymous aggregate analytics | 12 months by default; longer only when genuinely anonymous and useful |
| Application/Sentry error records | Target 30 days and the shortest provider setting that remains operationally useful |
| Restricted security/audit events | Up to 180 days when justified by the security assessment |
| Verification and password-reset tokens | Valid for one hour; purge expired records within 24 hours |
| Generated export archives | Seven days; download authorization expires within 24 hours |
| Transactional-email content/provider logs | Shortest configurable period, target 30 days or less |
| Inactive accounts | Warn after 23 months and erase after 24 months without activity unless reactivated |
| Encrypted database backups | Rolling maximum of 30 days, with erasure tombstone replay on restore |
| Minimal privacy-request/erasure audit | Provisional five years; counsel must validate necessity and reduce fields/period where possible |

### Tracking, email, transparency, and governance

- Use only strictly necessary authentication/security cookies and first-party preference storage. Keep first-party product analytics server-side and do not create an additional browser identifier for it. Publish a concise cookie/storage notice even when no consent banner is required.
- Do not add cross-site analytics, third-party analytics identifiers, fingerprinting, advertising pixels/IDs, session replay, or other non-essential terminal storage/access in the MVP. Any future proposal requires a new privacy review and, where required, prior granular consent with equally accessible accept/reject and withdrawal controls.
- Do not send marketing, newsletter, promotional, or re-engagement email in the MVP. A future proposal requires a separate scope decision, legal review, preference center, and consent/objection implementation; transactional consent or Terms acceptance must never be reused for it.
- Complete a DPIA before processing real external-beta rankings because the design combines preference profiling, prediction, locality, linked datasets, and an innovative recommendation model. Document risks to privacy, unfair inference, low-support disclosure, bias, deletion/model removal, security, and minors, plus mitigations and residual risk.
- Maintain processor DPAs/subprocessor and transfer records, least-privilege access, breach response, data-subject request procedures, model/data lineage, and staff AI-literacy material. Confirm the recommendation engine's EU AI Act and Italian Law 132/2025 classification with counsel; even if non-high-risk, preserve understandable documentation and avoid manipulative, deceptive, or vulnerability-exploiting ranking/recommendation behavior.
- The full layered Privacy Notice must identify the controller/contact, data categories, purposes and bases, contractual requirements, recipients/processors, EU and cross-border processing/safeguards, retention, profiling logic and effects, model-deletion behavior, age restriction, rights, and the right to complain to the Garante. Notify users before material incompatible changes and seek a new lawful basis where required.

## Domain model proposal

Finalize names and constraints with small algorithm prototypes before generating the first domain migration.

- `place`: stable application identity, category, imported/effective status, explicit synthetic/demo marker, and timestamps. Effective catalogue fields are resolved from the current source snapshot plus active local overrides rather than destroying source provenance.
- `place_source`: place, provider, source element type/ID/version/timestamp, imported fields or revision reference, and lifecycle status. Uniqueness covers `(provider, element_type, element_id)` and supports multiple source identities redirecting to one canonical place.
- `place_override`: place, field/action scope, replacement value or quarantine state, reason/evidence, actor, review/expiry/supersession metadata, and timestamps. Validate allowed fields and never use arbitrary executable patches.
- `place_redirect`: losing place/source identity, canonical place, merge reason, status, reversible migration metadata, and timestamps. Resolve redirect chains to one canonical target and prevent cycles.
- `catalogue_issue`: reporter when applicable, structured issue type, target place/source, private optional detail, status/assignee/resolution, upstream changeset reference, and timestamps. Reports never become public reviews.
- `catalogue_change`: append-only actor/role/action, before/after diff, source/import revision, reason/evidence references, affected counts, linked issue/change/reversal, and timestamp.
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
- Implement source snapshots plus effective overlay resolution, canonical source mappings, cycle-free redirects, quarantine behavior, and transactional/reversible merge impact handling. Imports must surface rather than overwrite conflicts with active overrides.
- Add protected curator/admin catalogue workflows and append-only audit services. Let authenticated users submit private, rate-limited structured issue reports without granting catalogue mutation rights; keep business claims out of scope.
- Test that hidden records leave existing rankings intelligible while being excluded from new search/training/serving, and that duplicate merges preserve/supersede evidence and request targeted ranking repair without inventing preferences.
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

**Exit:** a new user understands that private preference data contributes pseudonymously to community recommendations, creates an account, signs in, and reaches an accessible empty dashboard in either locale. Ranking routes reject unauthenticated access.

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
- Run an Italian hotel catalogue/licensing quality review and the usability research defined in the separate approved beta-research brief before declaring beta readiness.

**Exit:** restaurants and hotels both support the complete authenticated selection → personal ranking → recommendation loop, and no beta is released until both categories meet their quality gates.

### Phase 9 — Hardening and beta release

- Threat-model authentication, authorization/IDOR, catalogue ingestion, comparison writes, rate limiting, CSRF, XSS, and abuse paths.
- Near the end of beta hardening, add social login with Sign in with Google as the minimum provider. Configure separate development/preview/production OAuth clients and exact redirect origins; request only the minimum scopes needed for authentication.
- Link a social identity to an existing account only through Better Auth's verified, explicit account-linking rules. Test duplicate-email, provider-email changes, revoked consent, cancelled callbacks, state/PKCE and redirect validation, existing sessions, account deletion, and recovery so Google login cannot create duplicate profiles or orphan rankings.
- Retain email/password alongside Google login unless a later product decision explicitly removes it. Replace the local email surrogate with the transactional provider selected under question 18, verify domain/authentication and deliverability configuration, and run end-to-end delivery checks before inviting beta users.
- Add independent database backup/restore, migration rollout/rollback, health checks, structured redacted Koyeb logs, and the provisionally selected Sentry EU/Germany error reporting with source maps, releases, alerts, PII scrubbing, conservative tracing, and no MVP session replay.
- Complete accessibility testing for keyboard, screen reader, contrast, touch targets, zoom, reduced motion, and both locales.
- Complete and obtain legal review of the DPIA, processing record, contractual-necessity and legitimate-interest assessments, processor/transfer register, 18+ age approach, layered Privacy Notice, Terms, cookie/storage notice, and provider attribution. Do not launch with placeholder legal text.
- Implement self-service JSON/CSV access/export, ranking-category deletion, account deletion, evidence exclusion and category-model rebuild, erasure tombstone replay after restore, retention jobs, privacy-request tracking, and the documented manual rights workflow.
- Verify that the MVP ships no marketing email, cross-site/third-party analytics, non-essential tracking, fingerprinting, pixels, advertising identifiers, or session replay, and that transactional templates contain no promotional material.
- Run responsive and cross-browser end-to-end tests of sign-up, draft/resume, ranking, insertion, recommendation, locale switching, and failure recovery.
- Verify beta synthetic-data labelling and isolation, including that no synthetic ranking evidence is associated with or affects real places.
- Run the externally defined private-beta cohort and research method with both restaurants and hotels in the chosen area; measure and review each category separately before expanding the catalogue.

**Exit:** operable production release with defined rollback, support, privacy, and measurement procedures.

### Future — patron-confirmed review trust

Do not implement malicious/coordinated-ranking detection or public reputation scores in the MVP. When written reviews are reconsidered after the core loop is validated, prototype a positive trust signal in which independent patrons can confirm that another client's review is fair, honest, and useful. Require multiple independent confirmations before they affect trust so coordinated manipulation is materially harder; confirmations must never alter the reviewer's private personal ranking.

Design this as encouragement for kind, factual reviewing rather than as a public blame or downvote mechanism. Before implementation, define what makes a patron eligible to confirm, how visit/account independence is established, caps and conflict-of-interest rules, privacy and appeal behavior, and how confirmations may cautiously weight future recommendation evidence.

## Testing strategy

- **Pure unit tests:** ranking state machine, progress bounds, ties, contradictions, undo, serialization/version migration, recommendation scoring, recommendation-exposure attribution/deduplication, and permission helpers.
- **Database integration tests:** constraints, transactions, idempotency, list ownership, concurrent revisions, seed imports, source/override resolution, redirect-cycle prevention, reversible merge transactions, quarantine exclusions, append-only catalogue audits, verification/reset token expiry and purge, session revocation after password reset, retention jobs, erasure tombstones, category/account evidence exclusion, model invalidation/rebuild requests, and recommendation queries against isolated PostgreSQL.
- **Component tests:** place cards with missing/broken media, restaurant/hotel fallback variants, decorative versus interactive icon accessibility, bucket, comparison controls, focus management, localization, reduced motion, and all loading/error/empty states.
- **End-to-end tests:** 18+ declaration, Terms acceptance, separately linked Privacy Notice, and registration disclosure; blocked sign-in before email verification; verification resend/success/expired link; generic duplicate-sign-up and password-reset responses; password-reset success/invalid or reused token/session revocation; Google sign-in and account linking before beta; create/resume a draft; complete a 2-place and larger ranking; tie/skip/undo; refresh mid-session; concurrent-tab conflict; insert/remove a place; submit a private structured catalogue issue; enforce user/curator/admin permissions; correct, quarantine, merge, reverse, and reconcile an upstream catalogue change with a complete audit; view the full predicted order with visited status and locality filtering; receive or fail gracefully to receive recommendations; request/download/expire a JSON/CSV export; delete one ranking category; delete the account and verify session revocation, live-data erasure, evidence exclusion, and restored-backup tombstone replay.
- **Algorithm tests:** exhaustive permutations for small lists and generated noisy/tied/partial rankings for larger lists; listwise likelihood and gradient checks; deterministic pairwise-view derivation; no double counting across revisions; skip/unresolved exclusion; tie handling; per-list normalization; cold-start shrinkage; locality-invariant scores; held-out split leakage checks; and reproducible benchmark metrics.
- **Non-functional tests:** mobile performance on a throttled connection, catalogue/recommendation query plans, basic load tests, automated accessibility checks backed by manual review, privacy scans proving the absence of forbidden trackers/marketing paths, and retention/processor-failure drills.

Use deterministic seeds and clocks where possible. Do not make routine tests depend on a live external place API.

## Analytics and success measures

Define events and privacy/retention before collection. The MVP has no third-party or cross-site analytics. Never put place names, search text, precise coordinates, emails, full action URLs, or raw comparison pairs in analytics events.

For the MVP, collect an allowlisted event vocabulary through a first-party server-side service and store it inside the EU PostgreSQL boundary with explicit retention and cleanup. Prefer authoritative domain records for recommendation exposures, additions as visited, and ranking completion rather than duplicating them as untrusted client events. Do not create a separate browser analytics identifier or silently introduce a managed analytics product; either change requires a later explicit product and privacy decision.

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

Set numeric beta targets after the research defined outside this plan establishes realistic baselines.

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

15. ANSWERED — email/password is sufficient for local development. For beta, require link-based email verification before email/password sign-in, auto-sign in after successful verification, and offer link-based password reset that revokes existing sessions; verification and reset links expire after one hour. Add Sign in with Google near the end of beta hardening. Passkeys and additional social providers are deferred. MVP email remains transactional and contains no marketing content.
16. ANSWERED — the primary launch conversion is later addition of an exposed, previously unvisited recommendation as visited, within a 90-day attribution window and deduplicated per user/category/place. Open, save, directions, and booking clicks remain secondary intent events; later ranking placement is a separate quality signal.
17. ANSWERED — use a shared category-themed fallback panel built with `@lucide/svelte`: `UtensilsCrossed` for restaurants and `Hotel` for hotels, accompanied by the visible place name, category, and locality. Preserve the media aspect ratio, avoid generic stock imagery and unsupported metadata, and add no second icon library for the MVP because Lucide covers the required cases.
18. ANSWERED PROVISIONALLY — the current beta target is Koyeb Node hosting in Frankfurt, Neon PostgreSQL in Frankfurt, an application-owned OSM TypeScript importer run manually and then through validated GitHub Actions updates, first-party server-side allowlisted analytics in PostgreSQL, Sentry EU/Germany for scrubbed error reporting, and Brevo's REST API for transactional email. The MVP has no cross-site/third-party analytics or marketing email. Keep the application email, catalogue-ingestion, analytics, and observability boundaries provider-neutral. Make the final vendor decision only after local/import and deployed end-to-end tests verify catalogue/index size, Better Auth performance, database cost/activity, backups/restores, email delivery, reliability, and the documented EU/DPA/subprocessor constraints within the beta budget.
19. ANSWERED PROVISIONALLY — make the MVP 18+; use purpose-specific contract/legitimate-interest bases subject to documented necessity and balancing rather than bundled consent; provide self-service JSON/CSV export and manual rights handling; enforce the stated retention schedule; and erase account- or category-linked comparisons, rankings, exposures, user factors, and analytics from live systems within 30 days. Exclude deleted evidence and rebuild affected model artifacts within that window, expire it from rolling backups, and retain derived statistics only if genuinely anonymous. Complete a DPIA and obtain Italian legal review before public deployment.
20. ANSWERED — authenticated users may submit private structured issue reports but cannot edit catalogue data. A least-privilege curator may apply reviewed field overrides and quarantine records; an administrator may additionally approve reversible canonical merges and exceptional removals. Keep immutable OSM source provenance plus a local effective overlay, never write to OSM automatically, link human upstream changesets, reconcile later imports without silently overriding local decisions, and append an actor/reason/evidence/before-after/source-revision/impact/reversal audit for every transition.
21. ANSWERED — defer all public or link-based sharing of completed personal lists beyond the MVP. Lists remain private to their owner throughout MVP UI, APIs, authorization rules, exports, and search.
22. ANSWERED OUTSIDE THIS PLAN — define and approve the beta cohort, recruitment, research method, scripts, consent, incentives, and interpretation in a separate research brief. This implementation plan requires the research to run before expansion but does not prescribe its design.
23. ANSWERED PROVISIONALLY — use the revised layered Italian/English disclosure: rankings are private but processed pseudonymously for reciprocal automated recommendations; contribution is presented as an essential service feature rather than optional marketing consent; recommendations have no legal or similarly significant effects; and principal rights are stated. Require only the separate unchecked 18+/Terms declaration, link the Privacy Notice visibly without an “I consent” checkbox, and complete the full Article 13 notice and legal review before public deployment.

