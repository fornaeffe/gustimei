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
- An optional personal comment on a visited place, visible only to its author and clearly presented as a private memory aid for recalling the experience and comparing it with later experiences elsewhere.
- A first recommendation feed that predicts the user's order across visited and not-yet-visited places in the selected category, based on overlapping user preferences and optionally filtered by locality, with a deterministic fallback for cold starts.
- Basic profile/settings: locale, delete ranking, delete account, and privacy information.
- Clearly separated real and synthetic catalogue/ranking data sufficient to test recommendations locally and demonstrate the beta safely.
- Product analytics events without storing sensitive free-form content.

### Deferred until the core loop is validated

- Public reviews/comments, replies, public profiles, follows, likes, and messaging. This does not include the private personal comments in the MVP scope.
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
7. **Privacy and participation:** personal rankings are private in the UI but their pseudonymous preference data is used to calculate recommendations for the user and community. The expected final product policy is that reciprocal preference contribution is an essential, mandatory feature rather than an optional toggle, subject always to access, erasure, restriction, portability, objection where applicable, and the other rights provided by law. State this clearly before registration and reflect it in the privacy notice, terms, deletion behavior, lawful-basis assessment, and analytics design. Do not implement an MVP contribution opt-out or consent checkbox unless legal review requires a different policy. Keep contribution eligibility behind the purpose-specific policy boundary defined below so such a change would exclude evidence and rebuild affected models without changing or deleting the user's private ranking.
8. **Starting geography:** Italy. Import and search Italian restaurants first, then Italian hotels before beta. Locality remains an optional filter over each global category list and predicted order.
9. **Coverage threshold:** keep initial OSM coverage audits intentionally loose. Exclude or quarantine only records or systemic gaps that would clearly break the product, create unusable identities, or deeply bias ranking/recommendation behavior. Record limitations rather than blocking development on catalogue completeness.
10. **Ranking threshold:** ranking may start with two visited places; one pairwise choice is sufficient to form the smallest meaningful ordered list. Recommendation eligibility is a separate threshold to determine experimentally and must not prevent users from maintaining a two-place personal list.
11. **Uncertainty:** provide “Skip / cannot compare” as a first-class outcome. It records missing preference evidence, keeps both places in the visited list, and is never interpreted as a reason to remove either place.
12. **Default recommendation view:** show the user's full predicted order for the selected category's eligible candidate universe, with visited status clearly visible on every result. “Full” means the complete stable order within the explicitly defined support/catalogue candidate contract, delivered through pagination or cursors when necessary; it does not silently claim that every imported place has a meaningful prediction. Finalize the universe, unsupported-place behavior, pagination, stable tie-breaking, and maximum browsable depth at the Phase 6 gate before implementing Phase 7. Users may optionally filter by locality without changing the underlying global predicted order.
13. **Tie repair:** an explicit tie remains direct user evidence, but it is not permanently immune to later contradictory transitive evidence. If later answers conflict with a tied tier, prompt a targeted repair using the tied-tier insertion policy; never split the tier silently.
14. **Cycle and contradiction recovery:** resolve preference cycles by asking a targeted clarifying comparison. Until that clarification is completed, retain the newest answer and temporarily leave the oldest conflicting ranking evidence out of the active order. Prompt the user to rerank the involved places; do not decay preferences merely because time has passed.
15. **Ranking-session size:** the MVP does not cap personal-list size or split large selection buckets into shorter ranking sessions. Measure large-list behavior and revisit this only if the ranking spike or beta usage demonstrates a need.
16. **Filtered personal-list positions:** when locality filters the personal list, display ordinal labels recalculated for the filtered results. Clearly identify them as filtered positions; the underlying global tiers and order remain unchanged.
17. **Incomplete orders after skips:** when skips leave insufficient evidence for a total order, display the affected places as an unresolved tier. Preserve the missing evidence so a later iteration can request targeted comparisons.
18. **Recommendation conversion:** the primary launch conversion is a previously unvisited place being added as visited after the user was shown it as a recommendation. Opens, saves, directions, and booking clicks are secondary intent signals, not conversions. Completing the place's later insertion into the personal ranking is a separate recommendation-quality signal.
19. **Non-photo place cards:** use `@lucide/svelte` as the sole MVP icon library. Render a reusable, category-themed fallback panel with a Lucide category icon (`UtensilsCrossed` for restaurants and `Hotel` for hotels), the place name, category, and locality. Do not use generic stock photography or add another icon source unless a validated future category cannot be represented by Lucide.
20. **Provisional beta operations stack:** plan for a SvelteKit Node deployment on Koyeb in Frankfurt, managed PostgreSQL on Neon in Frankfurt, Sentry's EU/Germany service for error reporting, and Brevo for transactional email. Implement OSM ingestion and the narrow product-analytics collector in application-owned code. Phases 0–8 remain local and use application-owned provider interfaces plus local/test adapters; do not provision, call, or depend on these hosted services before Phase 9. This is the current Phase 9 integration target, not a final vendor commitment: confirm or revise it after local catalogue/index sizing and the Phase 9 deployment tests establish Better Auth password-hashing performance, database activity and cost, email deliverability, regional/data-processing suitability, and operational reliability.
21. **Legal-design baseline:** make the MVP available only to adults aged 18 or over; use purpose-specific GDPR lawful bases rather than bundled consent; provide self-service access/export and deletion; erase account-linked ranking evidence on deletion; and complete a DPIA, processing record, retention schedule, processor review, and legal review before public deployment. Recommendations are profiling but are designed only as suggestions, without legal or similarly significant effects.
22. **MVP communications and tracking:** send only authentication, security, privacy/terms, data-rights, and essential service-operation email. Do not send marketing email. Use necessary first-party authentication/preferences storage and first-party server-side analytics only; do not implement cross-site analytics, non-essential tracking, fingerprinting, pixels, advertising identifiers, or session replay.
23. **Catalogue governance:** ordinary users may submit structured catalogue issue reports but cannot modify catalogue records. Only a least-privilege catalogue curator or administrator can apply reversible local corrections, quarantine/hide records, or create canonical merge redirects. Preserve imported OSM facts separately from local overlays, audit every moderation action, never automatically write changes to OSM, and reconcile verified upstream changes on later imports.
24. **Public list sharing:** defer public or link-based sharing of completed personal lists beyond the MVP. Rankings remain private to their owner in every MVP route, API, export authorization, and search surface.
25. **Beta research definition:** define the beta cohort, recruitment, qualitative method, scripts, consent, incentives, and success interpretation in a separate research brief outside this implementation plan. This plan records only the product/engineering gates and the requirement to execute the approved research before expansion.
26. **Ranking-list lifecycle:** do not store a single workflow `status` on `ranking_list`. The list is the durable per-user/per-category aggregate and may contain useful resolved evidence even while some places remain unplaced, skipped, or under repair. Persist immutable/versioned ranking revisions and explicit session/evidence facts; derive order coverage, pending repair, the next UX action, and recommendation eligibility independently. A list never becomes globally “stale” merely because one part needs attention.
27. **Personal comments:** an authenticated user may optionally keep one private plain-text comment per visited place to remember their experience and make later comparisons easier. This is a personal memory aid, not a review, ranking rationale, catalogue correction, message, or community contribution. Only the owner may create, read, update, delete, or export it. Never publish it, expose it to curators/businesses/other users, use it as ranking or recommendation evidence, derive features or explanations from it, or copy its content into analytics, logs, error reports, search indexes, fixtures, or model artifacts.

### Proposed personal-comment UI copy

Place the explanation next to the optional field wherever it can be edited. Keep the field out of the critical path: it must never be required to add, rank, or compare a place.

**Italian (primary):**

> Commento personale (facoltativo)
>
> Una nota visibile solo a te, per ricordare la tua esperienza e confrontarla in futuro con quella vissuta in altri luoghi. Non è una recensione e non influisce sulle raccomandazioni.

**English:**

> Personal comment (optional)
>
> A note only you can see, to remember your experience and compare it later with experiences at other places. It is not a review and does not affect recommendations.

Use a localized character counter and an initially provisional 2,000-character maximum. Render saved content as plain text with preserved line breaks; never interpret Markdown or HTML. Finalize the limit and explicit-save versus autosave interaction during Phase 3 component testing.

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

Use the following as the current Phase 9 target. During Phases 0–8, run the application, PostgreSQL, ingestion, email capture, jobs, artifact storage, analytics, and error capture locally. Define provider-neutral interfaces and contract tests from the beginning, but do not integrate or exercise hosted deployment services until Phase 9. Keep provider boundaries explicit so the final choice can change without rewriting domain, authentication, or recommendation logic.

- **Application hosting:** target Koyeb in Frankfurt using SvelteKit's Node adapter and a normal Node runtime. Use Koyeb's free instance only for internal or very small invitation-only testing, where scale-to-zero and cold starts are acceptable. Prefer the low-cost `eco-micro` instance for an externally used beta if the free instance's 0.1 vCPU makes Better Auth's default `scrypt` password hashing or SSR unacceptably slow. Validate signup, sign-in, build/deploy, memory, cold starts, health checks, logs, rollback, and sustained response times before committing.
- **Managed PostgreSQL:** target one Neon project in Frankfurt and connect through its pooled connection endpoint using the Drizzle-compatible PostgreSQL driver selected during the deployment spike. Start on Neon Free only if the normalized Italy restaurant-and-hotel catalogue, indexes, Better Auth data, rankings, recommendation metadata, analytics allowance, and safety margin fit its current limits. Measure the real import with `pg_database_size`, table/index breakdowns, query plans, active compute time, and projected monthly cost. If Free is too small, evaluate Neon's usage-based Launch plan with scale-to-zero and conservative autoscaling limits; do not accept a projected recurring cost above the beta budget without revisiting scope or provider choice. Treat Neon's restore window as recovery help, not as the only backup.
- **OSM import/update execution:** own a repeatable TypeScript CLI in this repository. Run all imports locally through Phase 8. In Phase 9, validate an explicitly triggered GitHub Actions path and, after runtime and idempotency are proven, schedule filtered updates conservatively. Stream Geofabrik input into staging tables, validate counts/checksums/source timestamps, and promote a complete revision atomically. Do not run bulk ingestion in the Koyeb web process, commit PBF files, or store full extracts as workflow artifacts. GitHub workflows used for this purpose process public OSM data only, not personal ranking exports or database backups.
- **Transactional email:** keep the application-owned email interface and target Brevo's REST API for preview/beta/production verification, password reset, security, material terms/privacy changes, data-rights, and strictly necessary service-operation mail. Keep the console/in-memory transport local-only. Authenticate the sending domain with SPF, DKIM, and DMARC; test delivery, bounce/suppression behavior, rate limits, provider branding, expired/reused links, and background delivery before invitations. Send only the recipient and minimum template/action data, keep tokens and action URLs out of analytics and ordinary logs, and review Brevo's DPA, subprocessors, EU processing, and retention configuration before beta. Do not send marketing, promotional, newsletter, or re-engagement email in the MVP. Retain the ability to replace Brevo behind the same interface.
- **Product analytics:** implement the MVP collector and conversion attribution as first-party code backed by allowlisted domain events in the EU PostgreSQL database. Derive authoritative recommendation exposure-to-visited conversion from domain records. Store no email, name, free-form search text, precise coordinates, full action URLs, or raw comparison pairs in analytics; use internal pseudonymous identifiers and define detailed-event retention and aggregate cleanup before collection. Do not integrate a third-party or cross-site analytics service, browser analytics identifier, pixel, fingerprint, or session replay in the MVP. Any later managed-analytics proposal is a new product/privacy decision rather than an implicit fallback.
- **Error reporting and logs:** target a Sentry Developer organization created in its EU/Germany region, plus structured redacted Koyeb stdout logs. Configure `sendDefaultPii: false`, inbound and application-side scrubbing, conservative tracing, and no session replay for the MVP. Never send cookies, authorization headers, emails, verification/reset URLs, raw ranking comparisons, or precise location data. Validate source-map upload, release association, alert delivery, quota behavior, and failure handling. Retain essential health and audit signals independently so loss or exhaustion of Sentry does not break the product.
- **Regional and processor constraints:** keep the application runtime, primary database, analytics records, and error-reporting storage in the EU, provisionally Frankfurt/Germany. Transactional email may process the address and message metadata/content only with an appropriate DPA and reviewed EU/cross-border subprocessors. Require TLS, least-privilege credentials, environment-separated secrets, documented retention/deletion, and a processor/subprocessor review before external beta users. Pseudonymous rankings remain personal data; do not describe them as anonymous.
- **Cost and final-decision gate:** use only local substitutes through Phase 8. In Phase 9, evaluate the free Koyeb, Neon, Brevo, and Sentry tiers, then use the smallest continuously available Koyeb instance if beta UX requires it. Domain registration, taxes, backups, and paid database usage must be included in the measured total. Make the final vendor decision only after the local Italy import/query measurements and a Phase 9 deployed end-to-end test have demonstrated acceptable size, latency, reliability, regional processing, email delivery, restore/backup behavior, and an expected recurring total within the agreed beta budget.

## Privacy, retention, deletion, and legal-design proposal

This section is a product and engineering proposal based on the [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng/), the [Italian Privacy Code](https://www.garanteprivacy.it/documents/10160/0/Codice%2Bin%2Bmateria%2Bdi%2Bprotezione%2Bdei%2Bdati%2Bpersonali%2B%28Testo%2Bcoordinato%29.pdf/b1787d6b-6bce-07da-a38f-3742e3888c1d?version=1.8), relevant [Garante DPIA criteria](https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9058979), [EDPB contractual-necessity guidance](https://www.edpb.europa.eu/documents/guideline/guidelines-22019-on-the-processing-of-personal-data-under-article-61b-gdpr-in_en), the [EU AI Act](https://eur-lex.europa.eu/eli/reg/2024/1689/oj), and [Italian Law 132/2025](https://www.normattiva.it/eli/id/2025/09/25/25G00143/CONSOLIDATED). It is not legal advice. Before public deployment, Italian counsel must validate the controller identity, lawful bases, terms/notices, age approach, processor agreements and transfers, retention schedule, recommendation-system classification, and whether any residual risk requires prior consultation with the Garante.

### Purposes and provisional lawful bases

- Use GDPR Article 6(1)(b), contractual necessity, provisionally for registration, authentication, private personal rankings, and user-requested personalized recommendations. Keep the service contract's fundamental object narrow and truthful; terms cannot make otherwise unnecessary processing contractually necessary.
- Treat reciprocal contribution of active ranking evidence to the category-specific community model as the expected essential-service design and provisionally rely on Article 6(1)(b). Before beta, write and obtain legal review of a necessity assessment explaining why reciprocal contribution is objectively required for the service the user requests and reasonably expected from the clear pre-registration description. Do not weaken the product into an optional model merely in anticipation of that review.
- If the necessity assessment does not support the expected mandatory design, do not launch it unchanged. Adopt a documented Article 6(1)(f) design with an effective right to object only if its necessity and balancing assessment supports that route; otherwise activate a genuinely optional, specific consent flow for community-model contribution. In either fallback, use the existing contribution-policy boundary to exclude affected evidence, invalidate artifacts, and rebuild without changing the user's private personal ranking. Do not disguise a mandatory operation as consent or switch lawful basis retrospectively.
- Use documented legitimate interest, subject to necessity and balancing tests, for proportionate account security, abuse prevention, minimal operational logging, and first-party product measurement that is not strictly contractual.
- Use consent only for genuinely optional purposes. The MVP has no marketing email, advertising, cross-site analytics, session replay, or non-essential tracking, so it must not request consent for those absent purposes.
- Treat verification, password-reset, security, material terms/privacy changes, data-rights, and essential service-operation email as transactional. Do not mix promotional content into those messages or reuse their addresses for marketing.
- Maintain a processing record mapping every field/event to purpose, lawful basis, contribution-policy version, recipients, retention, security controls, and deletion behavior. Keep category-wide model training and current-user personalization as distinct processing purposes even when the expected policy permits both. Do not switch lawful basis retrospectively to rescue an incompatible use.

The recommendation engine evaluates personal preferences and therefore constitutes profiling. Design its output only as restaurant/hotel suggestions without legal or similarly significant effects, and document why GDPR Article 22 is not triggered. Explain the model's purpose, broad inputs and logic, uncertainty, limitations, category separation, and consequences in accessible Italian and English. Reassess this conclusion if bookings, prices, eligibility, business treatment, or other consequential decisions are later introduced.

Restaurant/hotel choices and locality may incidentally suggest religion, health, sexuality, or movements. Do not infer, label, segment, explain, or optimize for protected characteristics; exclude sensitive catalogue tags from analytics and consumer explanations, and do not interpret a visited place as current location or residence. Review any future dietary, accessibility, or travel-history feature for GDPR Article 9 implications before collecting it.

### Age and minors

- Make registration and use 18+ for the MVP even though Italian law provides rules under which some users aged 14 or over may consent to information-society and AI-related processing. This avoids parental authorization, child-specific transparency, contract-capacity, age-assurance, and heightened profiling requirements during core validation.
- Require an unchecked declaration of being at least 18 together with Terms acceptance. Store only declaration version and timestamp, not date of birth or identity documents.
- Block a declared under-18 registration. Define a support procedure to restrict and then delete an account when there is credible knowledge that its user is underage.
- Do not collect identity documents, biometrics, selfies, or inferred-age signals in the MVP. Before public deployment, have counsel assess whether self-declaration provides proportionate assurance for this service; introduce stronger privacy-preserving age assurance only if required.

### User access and export

Provide a self-service export containing a README, canonical JSON, and convenient CSV tables. Include profile/settings, linked sign-in provider names without secrets, visited places and their personal comments, ranking tiers/unresolved states, direct comparisons/ties/skips and supersession history, recommendation exposures/conversions, user-specific recommendation metadata, relevant algorithm and contribution-policy versions, and privacy-choice/request history. Do not expose password hashes, tokens, secrets, another person's data, or model artifacts that would reveal other users.

Generate exports asynchronously, encrypt them at rest, make the download single-use or expire it after 24 hours, and delete generated archives after seven days. Verify the requester and maintain a manual path for access, rectification, restriction, portability, objection, and complaints; a portability export does not automatically satisfy the broader right of access. Track the GDPR response deadline while targeting substantially faster completion.

### Erasure and model removal

On account deletion:

1. Immediately revoke sessions, prevent sign-in, mark the account pending erasure, and stop its data from entering new analytics or training runs.
2. Delete the email/social identities, profile, personal comments, lists/items, ranking sessions, direct comparisons including ties/skips, recommendation snapshots/exposures, analytics events, and user-specific latent factors from live systems within 30 days.
3. Exclude the user's evidence from future training, invalidate affected restaurant/hotel artifacts, and rebuild them without that evidence within the same 30-day window. Do not claim erasure while a deployed model intentionally retains an identifiable user's contribution.
4. Retain derived statistics only after demonstrating that they are genuinely anonymous and cannot reasonably single out or relink the person. Removing a user ID from place/locality/timestamp evidence is not sufficient anonymization.
5. Keep only a restricted minimal erasure/request audit when a documented legal-claims or accountability need justifies it. Never retain the deleted preference history in that audit.
6. Let encrypted backups expire within their rolling window. Any restored backup must replay erasure tombstones before serving traffic or contributing to model training.

Deleting one ranking category also deletes the personal comments for places in that category and follows the same evidence-removal and category-model invalidation process while leaving the account and other category intact. The confirmation must state that these comments will be erased.

### Provisional retention schedule

Enforce these defaults through scheduled jobs and tests; final periods remain subject to the DPIA and legal review.

| Data | MVP retention |
| --- | --- |
| Active account, visited places, personal comments, rankings, and comparisons | While the account is active or until the user deletes the comment or the category/account is deleted |
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
- `ranking_list`: durable owner/category identity, nullable `current_revision_id`, and timestamps. It has no workflow status or ranking-engine version of its own. Enforce one global list per `(owner, category)`; locality does not belong to list identity. Deleting a category ranking erases this aggregate and its evidence rather than transitioning it to a hidden lifecycle state.
- `ranking_item`: list, place, insertion time, and optional removal time. Unique `(list_id, place_id)`. Whether an active item is resolved, unresolved, or not yet placed comes from the current ranking revision rather than a second item-level workflow status.
- `personal_place_comment`: owner, place, plain-text body, and created/updated timestamps, unique on `(owner_id, place_id)`. Enforce the provisional 2,000-character limit in both domain validation and the database. Keep it separate from `ranking_item`, ranking revisions/evidence, catalogue issues, and future public reviews so editing a comment never creates a ranking revision or model invalidation. Application services must require that the place is currently active in the owner's visited list and must scope every read/write by the authenticated owner; never rely on a client-supplied owner ID.
- `ranking_revision`: immutable/versioned output with a monotonic revision number within its list, including ordered equivalence tiers, unresolved/incomparable placement information, active evidence references, excluded/superseded evidence references with conflict/invalidation reasons, ranking-engine version, capture cohort/provenance, and timestamps. Publish a revision and advance `ranking_list.current_revision_id` transactionally; retain enough provenance to reproduce, audit, migrate, recompute, and separate internal-testing evidence from later beta evidence. Derive repair requirements from these facts rather than storing another list lifecycle flag.
- `ranking_session`: list, base revision, purpose (`initial_order`, `insertion`, `repair`, or `rebuild`), versioned algorithm state, lifecycle (`open`, `completed`, or `superseded`), estimated/actual comparison count, expiry/resume metadata, and timestamps. Session lifecycle is stored because it governs resumability and concurrent writes; expiration is determined from its timestamp, not represented as a list state. Enforce at most one effective open session per list/revision and supersede it explicitly when a conflicting revision wins.
- `comparison`: session, left place, right place, outcome (`left`, `right`, `tie`, `skip`), sequence, response time, superseded/undone marker, and timestamp. Enforce that both places belong to the list and differ.
- `participation_cohort`: account, environment, cohort (`internal_testing`, `private_beta`, or `general_release`), effective interval, assignment source, and timestamps. Stamp revisions and authoritative measurement records at creation so later cohort changes never retroactively relabel earlier evidence. This is operational provenance, not a browser identifier or a substitute for research-participation records.
- `processing_restriction`: user, optional category, processing purpose, source/reason, effective interval, status, and audit timestamps. Use it for actual legal/privacy restrictions and erasure workflows. Do not create a contribution-choice boolean for the expected mandatory MVP policy; if legal review selects an optional design, add a separate versioned choice/consent record and let the same policy resolver consume it.
- `recommendation_model`: category, recommendation-engine version, contribution-policy version, model family, hyperparameters/factor dimension, training-data cutoff, artifact identity/location, validation metrics, status, and timestamps. Restaurant and hotel artifacts are always separate.
- `recommendation_snapshot` (optional initially): user/category, locality filter parameters, recommendation-engine version, contribution-policy version, source ranking revision, generated time, candidate place, predicted position, visited state, and internal explanation metadata. Start with on-demand results unless measurement shows snapshots are needed.
- Better Auth tables remain the identity source. Add application profile/preferences only when a field is not auth-owned.

Use UUIDs or generated text IDs consistently, UTC timestamps, explicit foreign-key deletion behavior, indexes for locality/category search and list membership, and migrations rather than `db:push` outside disposable local development.

## Test and evaluation data policy

- Local and automated-test environments may attach synthetic rankings to real or fictional places when needed to exercise algorithms and queries.
- Beta and production must never attach synthetic rankings, comparisons, users, or recommendation evidence to real places.
- Beta may contain fictional places and rankings for demonstrations only when every such place and all derived views are unmistakably labelled “Synthetic demo data” / “Dati demo sintetici.”
- Synthetic identities must be structurally isolated (for example through an explicit provenance field and environment/import guard), not inferred from names or ID ranges.
- Phase 1 algorithm selection uses only deterministic synthetic rankings and fixtures; no real-user or beta evidence exists at that point, and synthetic results justify only an initial implementation choice.
- Once the persisted ranking UX is usable in Phases 5–6, developers and specifically authorized internal testers may enter their own genuine preferences solely to test usability, persistence, repair behavior, and the end-to-end recommendation pipeline in a controlled internal environment. Treat these rankings as personal data, provide the applicable notice, document the internal-testing purpose and lawful basis, apply normal access/restriction/erasure controls, and mark the account/cohort provenance explicitly. Do not describe this as “consented” unless consent is actually the selected basis for a distinct research activity.
- Phase 7 may use that limited internal product-testing evidence for leakage-safe diagnostic evaluation and end-to-end verification. Keep its results separate from synthetic benchmarks and from beta success measures; the small, developer-heavy cohort is not representative launch evidence.
- Real private-beta evidence is collected only during Phase 9 under the approved beta-research and product-data procedures. Use it for the first external-cohort validation of recommendation relevance, usability, and category-specific thresholds. Where research participation requires consent, record that separately from the lawful basis governing ordinary use of rankings and recommendations.

## System boundary: personal ranking versus recommendations

These are separate concepts and must remain separate in the product language, domain services, code modules, versioning, tests, and analytics:

- **Personal ranking UX:** an interactive elicitation process that helps one authenticated user build and maintain a global ranked list of places they have visited for each category. It asks pairwise questions within one category and records direct preference evidence. It does not recommend places.
- **Recommendation system:** a non-interactive collaborative algorithm that consumes policy-permitted, active, non-contradictory preference evidence from category-specific personal lists and predicts an ordered list for the current user. It may rank both visited and not-yet-visited places and apply locality as a result filter. Unresolved relations are omitted, while the resolved portions of a partial list may still contribute. It never changes the user's explicit personal ranking.

Use distinct names such as `rankingEngineVersion` and `recommendationEngineVersion`; changing either system must not silently reinterpret the other.

### Preference-contribution policy boundary

Keep personal-ranking storage and UX independent from whether a ranking revision may be used for a particular recommendation purpose. Implement one application-domain policy resolver—rather than scattered SQL predicates—that evaluates a user/category/revision for at least these separate purposes:

- **Community-model training:** whether eligible resolved evidence may contribute to category-wide place factors, priors, support counts, evaluation datasets, and future model artifacts.
- **Current-user personalization:** whether the user's eligible evidence may be used to fit their factors and generate recommendations for that same user.

The resolver returns `include` or `exclude`, a non-sensitive reason code, and a policy version. Its inputs include environment/provenance, account and category deletion or restriction, current revision, evidence validity, catalogue quarantine, and synthetic/demo isolation. The expected production policy includes active real-user evidence for both purposes because reciprocal contribution is an essential feature. Product ranking services never call this policy to decide whether the user may create, view, edit, export, or delete a private ranking.

All training, support-count, evaluation, and per-user fitting pipelines must consume evidence through a shared `RecommendationEvidenceSource` that applies the resolver. They must not query raw comparisons or ranking revisions directly. Record the applied contribution-policy version and aggregate exclusion counts/reasons with every dataset/model build so the result is reproducible without logging private comparisons.

Do not expose an MVP contribution preference or pre-create a misleading consent record while the mandatory policy remains the target. If legal review requires optional community contribution, add a versioned purpose-specific preference/consent record and user controls behind this boundary. A change or withdrawal must immediately exclude the affected evidence from new builds and serving inputs, invalidate affected artifacts, and trigger a rebuild within the approved model-removal deadline, without deleting the private ranking. Whether a non-contributing user may still receive personalized recommendations remains a separate legal/product rule represented by the distinct current-user-personalization decision, not an accidental consequence of one database boolean.

## Personal ranking UX and ranking engine

The ranking UX begins only after login. Initially, the user searches the Italian restaurant catalogue, marks restaurants as visited, and adds them to their one restaurant list. Before beta, the same flow supports a separate global hotel list. Locality may narrow catalogue search or a displayed personal list, but adding a place always modifies the global list for that category. The user can start ranking as soon as the list contains two places.

### List lifecycle and derived ranking condition

Do not model the list as moving through `draft`, `ranking`, `complete`, `partial`, or `stale` states. Those labels collapse separate facts and would make useful evidence unnecessarily disappear from recommendations whenever a user adds one place, skips one comparison, or opens a repair session.

For each current ranking revision, derive and expose these independent facts from active items, active evidence, unresolved relations, and sessions:

- **Order coverage:** `none` when no strict or explicit-tie relation is resolved, `partial` when some active places/relations are resolved but the active items do not form one total preorder, and `total` when every active place belongs to a consistent ordered sequence of equivalence tiers. These are projection values, not persisted list lifecycle states.
- **Repair requirement:** the smallest affected places/relations needing clarification because of a concrete contradiction, invalidation, merge, or changed answer. This may coexist with either partial or otherwise total coverage; unaffected resolved evidence remains usable.
- **Session availability:** whether an effective open initial-order, insertion, repair, or rebuild session can be resumed. The session owns workflow and progress; the list does not become “ranking” while the session is open.
- **Recommendation evidence and serving eligibility:** counts and support derived independently from the current revision under the rules below. Eligibility must never be inferred from a list-status label.

Derive the next personal-ranking call to action deterministically: invite selection below two active places; otherwise resume the effective open session, offer the smallest pending repair, continue unresolved/unplaced ordering, or show the current total order with the option to add another place. Keep usable resolved tiers visible throughout repair and partial-order flows. For analytics, “ranking completed” is the first transition of a revision to total order coverage with no pending repair, recorded as a deduplicated domain event; it is not a permanent property of the list, and a later addition does not erase the historical completion.

The UX idea proposes assisted QuickSort for a new list and binary insertion for later additions. Binary insertion is a good fit when an existing strict order is trusted. Interactive QuickSort is a useful baseline, but it must not be adopted literally before validating equivalence tiers, inconsistent answers, pivot quality, interruption, and edits.

### Proposed tied-tier insertion policy

Treat a completed ranking as an ordered sequence of atomic equivalence tiers. To insert one new place, binary-search the tiers rather than individual places and compare the new place with a deterministic representative of the selected tier. A strict preference moves the search interval above or below the whole tier. A tie provisionally places the new item in that tier; for tiers with more than one existing item, confirm the merge against one additional deterministic member before completing it. If the second answer is strict, do not split the existing tier implicitly: open a local repair session covering that tier and its immediate boundaries.

Use the following escalation policy:

1. Complete ordinary binary insertion when the answers produce one unambiguous boundary or a confirmed tied-tier merge.
2. If a skip, conflicting tie confirmation, or contradiction with an existing comparison prevents unique placement, ask targeted comparisons against the unresolved boundary tiers and then run a local repair over the smallest affected contiguous tier window.
3. Fall back to a broader re-ranking session only when the current revision already has contradictions or invalidated evidence outside the local window, the affected window grows beyond `max(5 tiers, 25% of the list)`, a preference cycle crosses the window boundary, multiple unranked additions are being placed together, or an edit invalidates comparisons outside the local window.

Never guess a strict position after a skip and never silently dissolve an existing tie. If targeted repair still leaves insufficient evidence, publish a revision that keeps the new item unresolved adjacent to the narrowed boundary, preserve all unaffected resolved tiers, and let the user resume later. Recompute recommendation evidence and serving eligibility from that revision without disabling the whole list. The thresholds and the need for a second tie confirmation must be validated in the Phase 1 spike and stored as versioned ranking-engine policy.

An explicit tied tier may be reconsidered when later transitive evidence contradicts it. Such evidence must open the same targeted local-repair flow; it must not silently split or overwrite the user's tie. For any preference cycle, first ask a clarifying comparison among the involved places. While that clarification is pending, retain the newest answer, exclude the oldest conflicting evidence from the active order, and show the affected places as needing repair. Once clarified, supersede evidence explicitly so the history remains auditable.

Personal-ranking evidence does not decay with age. Time alone never creates a repair requirement. Concrete invalidation or contradiction, such as answers implying `A > B`, `C > A`, and `B > C`, creates a focused repair requirement for the involved places; apply the temporary newest-answer/oldest-evidence policy above while retaining unaffected evidence.

Implement the ranking engine as a pure, framework-independent TypeScript module that emits the next comparison and consumes an outcome. The Svelte UI and persistence layer should not know the sorting algorithm's internal details.

Prototype and test at least these approaches against synthetic users:

- stable merge sort or assisted QuickSort for initial total ordering;
- binary insertion for one new item;
- ordered equivalence tiers, potentially backed by a comparison graph, for ties;
- cycle detection and a recovery policy for inconsistent preferences;
- reuse of still-valid comparisons when a user edits or resumes a list.

Measure number of questions, worst-case behavior, stability, reproducibility, ability to undo, and quality under ties/noise. Choose and document the algorithm before building the comparison UI. Persist the ranking-engine version so ranking state can be migrated or recomputed after changes.

The current published category revision is the authoritative record of the user's stated overall preference evidence among visited places in that category, whether its order coverage is partial or total. A locality-filtered view displays recalculated ordinal labels for the filtered resolved subset, clearly identified as filtered positions; filtering never changes the underlying global position, tier, unresolved relations, or ranking evidence.

The persisted ranking output must distinguish three relations: strict order, explicit equivalence, and unresolved/incomparable. Preserve the logical pair independently from randomized left/right card presentation, record why the comparison was requested, and retain supersession provenance. The ranking engine should continue optimizing for a fast and accurate personal list; it must not add questions solely to train recommendations in the MVP. When a skip blocks one path, try a useful alternative pivot before leaving an unresolved relation, without repeatedly pressuring the user to answer the skipped pair.

## Recommendation system

The recommendation system consumes user lists. Its output is a predicted global preference order over the selected category's explicitly eligible candidate universe for the current user, optionally filtered by locality. The precise candidate and pagination contract is a required decision before Phase 7, based on local catalogue size, support, usability, and latency measurements.

Candidate results include both:

- **not-yet-visited places in the selected category**, which are the main discovery/recommendation use case;
- **visited places in that category**, which provide context, allow the predicted order to be evaluated against the user's actual order, and help explain where new places might fit.

### Provisional leading candidate: low-rank personalized Plackett–Luce

Use a separate regularized low-rank personalized generalized Plackett–Luce model for each category, with Davidson–Luce tie handling. For user `u` and place `i`, the latent utility is:

`utility(u, i) = globalPlaceBias(i) + userFactors(u) · placeFactors(i)`

The model learns shared place factors and a global place prior from all eligible users, then infers the current user's small factor vector from their own ranking. It orders candidates by their inferred utility. This directly solves collaborative preference completion: it predicts how a user would order places they have not visited without treating unvisited places as dislikes or producing a public rating.

Use each list's current published ranking revision as the canonical source, not a list-status label or an append-only bag of historical comparisons:

- A resolved ordered sequence of tiers is one listwise training observation. The listwise likelihood uses the whole relative order jointly rather than pretending every transitive pair is an independent answer.
- Explicit tied tiers enter through the tie likelihood. A tie is evidence of equivalence, not half a win and not missing data.
- For a partial ranking graph, add each active non-redundant strict or explicit-tie relation that is not already represented by a resolved listwise segment as a two-item observation under the same model family. Skip and unresolved relations contribute no outcome.
- Superseded answers, temporarily excluded contradictory evidence, deleted items, and previous list revisions do not train the current model. Publishing a partial revision does not disable its unaffected resolved evidence. Do not count direct comparisons again after a resolved tier sequence in the same revision has already represented them.
- Generate a versioned pairwise/rank-broken dataset or database view for diagnostics, reproducible exports, and a pairwise challenger model; do not make an `O(n²)` binary-comparison table the authoritative store or allow derived transitive pairs to inflate confidence.
- Normalize contribution by user/list revision so a long list supplies more information but does not dominate quadratically merely because more pairs can be derived from it.

Train category-wide place factors and biases periodically. At request time or after a ranking revision, hold those parameters fixed and compute a fast regularized maximum-a-posteriori estimate of the user's factors. Record the model version and ranking revision used. Estimate local uncertainty from the user-factor objective and combine it with item support counts for internal eligibility and calibration; never display it as a consumer rating.

This is the provisional leading candidate because the input is genuinely ranked-list data. Listwise low-rank collaborative ranking can handle ties and missing observations while avoiding the false independence assumption of naive all-pairs expansion. The Phase 1 experiment must compare it against a regularized low-rank pairwise Bradley–Terry preference-completion model, common-place nearest-neighbor rank aggregation, and smoothed global/random baselines. Adopt it as the initial implementation only after it wins the predefined synthetic held-out metrics or document an evidence-based replacement in an ADR; Phase 9 beta evidence remains the external-cohort gate for launch conclusions. Relevant foundations include [SQL-Rank](https://proceedings.mlr.press/v80/wu18c.html), [Preference Completion](https://proceedings.mlr.press/v37/park15.html), and the [generalized Plackett–Luce treatment of partial rankings and ties](https://link.springer.com/article/10.1007/s00180-020-00959-3).

### Eligibility, cold start, and locality

This model does not select recommendation “neighbors,” so no common-place count gates another individual user's contribution. Under the expected mandatory contribution policy, any category list with at least one active non-skip strict or explicit-tie relation may contribute to training when the contribution-policy resolver permits it, subject to per-list normalization and regularization. Restaurants and hotels never share observations, factors, thresholds, or evaluation results.

For serving personalized results, use a provisional MVP gate of at least five ranked places across at least three resolved tiers, including at least four places with supported model factors. Initially define a supported place as present in three or more independent eligible lists and connected to the category comparison graph. Tune these numbers independently per category in offline validation; enable the “personalized” label only for evidence buckets whose held-out pairwise accuracy reliably improves on the smoothed global prior. The personal list remains usable from two places regardless of recommendation eligibility.

When the user is below the gate or overlap is sparse, rank supported candidates by the model's regularized global place bias and label the result clearly as community-based/non-personalized. If even that evidence is insufficient, show an honest ranking-more/discovery state rather than manufacture preference from catalogue absence. Unsupported places remain searchable and addable as visited, but are not presented as confident recommendations.

Compute the category-wide candidate utilities first and apply locality to the resulting global order. Locality never trains a separate model or changes scores. If too few supported results match, show the shorter list and an explicit “expand area” action; never silently mix broader results into the active filter. If the user expands it, label the new geographic scope.

### Offline and live evaluation

For offline evaluation, split whole visited places or contiguous tier groups from each test user's ranking before generating any pairwise view. Fit the user's factors only from the remaining ranking and predict the held-out places. Never hold out a derived pair while leaving a transitive path to the same answer in training.

Report pairwise accuracy, tie-aware Kendall's `tau-b`, NDCG/top-tier retrieval, coverage, novelty, calibration by evidence bucket, and performance relative to the smoothed global prior. Split train/test by category and include temporal and geographic slices. A held-out visited place is only a proxy for an unseen recommendation; it must not be described as proof that the user would visit an actually unseen place. After launch, use attributed additions as visited as the primary recommendation conversion and the place's eventual personal rank as the delayed quality signal.

Run evaluation inside the controlled data boundary, retain only the minimum derived data required, and publish/log aggregated metrics with minimum cohort sizes rather than raw private rankings or user-level examples.

The output contract should include category, place, predicted order, visited state, confidence/eligibility metadata, and privacy-safe explanation data. Similarity or confidence values are internal signals, not consumer ratings. Recommendation versions, contribution-policy versions, and source ranking revisions must be recorded so results can be invalidated and evaluated independently of the ranking UX.

## Implementation phases

### Phase 0 — Baseline and decisions

**Status (2026-08-14): complete.** The starter demo surface has been replaced by a localized
product smoke route and tests. The application now builds as a standalone Node server, validates
environment-specific runtime configuration, isolates local development/test databases, exposes
local-only provider contracts, and runs branch quality plus focused browser checks in GitHub
Actions. No hosted Phase 9 service is provisioned or called.
The focused E2E harness owns the production server process directly and explicitly cleans up the
Playwright/server process trees after completion, including on Windows.

Phase 0 decisions:

- Use RFC 4122 UUIDs generated by the application for new domain entity IDs. Keep external OSM
  identity as its separate `(provider, element_type, element_id)` tuple.
- Establish provider seams now for transactional email, background jobs, artifact/blob storage,
  error reporting, and validated deployment/runtime configuration. Phases 1–8 use only local/test
  implementations; hosted implementations remain a Phase 9 concern.
- Require formatting, ESLint, Svelte/TypeScript checks, deterministic unit tests, and a production
  build on every pushed branch and pull request. Run the focused product smoke test in a separate
  PostgreSQL-backed browser job on the same cadence. Broader database suites, multi-browser runs,
  catalogue imports, benchmarks, and operational drills may use scheduled or explicitly triggered
  workflows as they are introduced.

- Make `npm run check`, `npm run lint`, unit tests, and a production build complete reliably.
- Remove or quarantine starter `task`, welcome, and demo code once equivalent product tests/routes exist.
- Replace `adapter-auto` with the Node adapter and verify the production build and server locally. Define the hosting/runtime boundary and contract-test seams without deploying to or integrating Koyeb.
- Define environment validation and separate development, test, preview, and production database configuration.
- Establish branch/CI checks for formatting, linting, type checks, unit tests, build, and focused end-to-end tests.

**Exit:** clean reproducible baseline, confirmed restaurant-first/hotel-before-beta rollout, catalogue/privacy model, and passing CI.

**Open questions to answer before Phase 1:**

- Which single application-ID format will be used consistently for new domain entities: UUIDs or generated text IDs?
- What local-only adapter contracts are required now for email, background jobs, artifact/blob storage, error reporting, and deployment configuration so Phases 1–8 cannot accidentally acquire hosted-service dependencies?
- Which CI checks are mandatory on every branch, and which slower local/database/browser checks may run on a separate cadence?

### Phase 1 — Separate algorithm spikes and contracts

- Define one contract for versioned personal-ranking revisions, derived order coverage/repair/next-action projections, session lifecycle, comparison outcomes, and progress; define a separate `RecommendationEvidenceSource` and purpose-specific contribution-policy contract that consumes resolved evidence without depending on a ranking-list status or embedding the mandatory/optional decision in ranking code.
- Add a contract test proving that creating, editing, or deleting a personal comment cannot change ranking revisions, comparison evidence, recommendation-evidence extraction, scores, or model/cache invalidation.
- Test the expected mandatory policy and a non-production optional-policy fixture. Both must produce the same private ranking behavior; only policy-permitted model-training and personalization evidence may differ. Version policy decisions and verify deterministic exclusion reasons and artifact invalidation inputs.
- Build pure personal-ranking prototypes and property-based or exhaustive small-list tests. Test 2, 3, 10, 25, and larger lists; balanced, already ordered, reverse ordered, tied, skipped, and contradictory inputs; undo and resume.
- Validate the decided behavior for explicit equivalence tiers, skip, binary insertion, cycles, contradictions, and edits without reference to recommendation scoring, including repair after later evidence conflicts with an explicit tie.
- Do not implement a list-size cap or large-bucket splitting in the MVP; use spike measurements to record when either might become necessary.
- Build the category-specific low-rank generalized Plackett–Luce prototype with explicit tie support, regularized user/place factors, global place bias, fast per-user factor fitting, and a reproducible derivation from current published ranking revisions.
- Benchmark it against low-rank pairwise Bradley–Terry preference completion, common-place nearest-neighbor rank aggregation, and smoothed global/random baselines. Tune rank, regularization, tie propensity, supported-item rules, and eligibility buckets without sharing parameters across categories.
- Split held-out places or tier groups before deriving training observations. Measure pairwise accuracy, tie-aware Kendall's `tau-b`, NDCG/top-tier retrieval, coverage, novelty, calibration, cold-start behavior, and improvement over the global prior. Use only deterministic synthetic restaurant lists and hotel fixtures in this phase; record that these results select the initial approach but do not establish external validity or beta readiness.
- Validate the provisional serving gate of five ranked places, three resolved tiers, and four supported place factors separately for restaurants and hotels; change it when held-out evidence supports a better threshold.
- Verify if the proposed tied-tier insertion policy minimize questions without causing too many local repairs, and are the proposed `max(5 tiers, 25% of the list)` fallback threshold and second-member tie confirmation appropriate?
- Document each selected algorithm, limitation, version, and recomputation strategy independently.

**Exit:** deterministic engine contracts and evidence for the initial ranking and recommendation approaches.

**Open questions to answer before Phase 2A:**

- Which ranking algorithm, tie/insertion policy, contradiction-repair policy, and progress estimator won the Phase 1 tests, and what versioned ADR records the choice?
- What exact canonical locality representation will search and filtering use initially—administrative fields, normalized locality text, geographic radius/bounds, or a documented combination—and which parts come from OSM versus derived indexing?
- What are the final persistence invariants for revisions, unresolved relations, supersession, and recommendation-evidence extraction before the first migration is generated?
- Which synthetic dataset sizes, distributions, and acceptance metrics constitute the reproducible Phase 1 benchmark suite?

### Phase 2A — Core domain persistence and local catalogue

- Replace the example schema with the domain tables, relations, constraints, and indexes.
- Generate and review the first domain migration; add test-database setup and reset helpers.
- Implement repositories/services so route code does not contain raw domain queries.
- Persist personal comments behind an owner-scoped repository/service with database and domain length constraints, explicit plain-text handling, and category/account deletion behavior. Add authorization/IDOR tests and prevent comments from entering catalogue search or recommendation queries.
- Implement processing-restriction persistence plus the contribution-policy resolver and policy-enforcing recommendation-evidence source. Ship only the expected mandatory contribution policy in product configuration, while keeping alternate policy behavior available to automated contract tests rather than users.
- Add a repeatable TypeScript OpenStreetMap PBF import/update pipeline, initially importing Italian restaurants, with local manual/on-demand execution, atomic staging/promotion, and environment-safe synthetic users/rankings. Keep a runner-neutral command boundary for Phase 9 automation; do not integrate GitHub Actions yet.
- Normalize OSM nodes/ways/relations behind a catalogue provider interface and deduplicate by element identity plus geographic/name quality checks.
- Implement immutable source snapshots, canonical source mappings, the minimum effective-record resolution contract, and quarantine behavior needed to keep harmful records out of search/training/serving while preserving referenced identities.
- Build locality-aware restaurant search over the imported application database; do not use public Nominatim for autocomplete.
- Add OSM attribution, ODbL compliance documentation, source-version tracking, and licence-aware optional image handling.
- Run and record the loose Italian restaurant coverage audit; block the milestone only for issues that clearly break or deeply bias the system.
- Add explicit provenance and enforcement so beta/production synthetic rankings cannot attach to real places or influence their recommendations.
- Add effective-dated participation-cohort assignment and immutable capture provenance so internal developer evidence, private-beta evidence, and later general-release evidence remain separable in evaluation and analytics.

**Exit:** a user, their global restaurant list, private personal comments, immutable revisions, restaurants, session, and comparisons can be persisted and reconstructed; comment changes do not affect ranking evidence; derived order coverage and repair facts are reproducible without a list-status field; local restaurant import/search works against application-owned PostgreSQL and catalogue compliance is documented.

**Open questions to answer before Phase 2B:**

- Did the Italy restaurant audit reveal a severe identity, duplication, naming, coordinate, category, or geographic-skew problem requiring enrichment or a changed normalization rule?
- Which search/index strategy meets the measured local query targets, and what rebuild/versioning behavior does it require?
- What is the minimum moderation workflow required before product development continues: quarantine only, or also correction, merge, reversal, and user issue intake?
- Which imported facts may be locally overridden in the MVP, and what evidence, expiry, and review requirements apply to each?
- How will the first `admin` and `catalogue_curator` identities be provisioned, rotated, and recovered in each environment without using public routes or mutable client claims?

### Phase 2B — Catalogue governance and repair operations

- Implement effective overlay resolution, field-level overrides, canonical redirects, cycle prevention, and transactional/reversible merge impact handling. Imports must surface rather than overwrite conflicts with active overrides.
- Add protected curator/admin catalogue services and append-only audit records. Let authenticated users submit private, rate-limited structured issue reports without granting catalogue mutation rights; keep business claims out of scope.
- Define and implement the bootstrap procedure for the first administrator and catalogue curator without granting roles through public routes or mutable client claims.
- Test that hidden records leave existing rankings intelligible while being excluded from new search/training/serving, and that duplicate merges preserve/supersede evidence and request targeted ranking repair without inventing preferences.
- Keep moderation workflows service/API-testable locally; a minimal internal UI may be deferred until operationally needed, but every effective mutation must remain authorized, audited, and reversible.

**Exit:** the local catalogue can be corrected, quarantined, merged, reversed, audited, and reconciled with later source revisions without corrupting ranking evidence or requiring public users to edit catalogue facts.

**Open questions to answer before Phase 3:**

- Who is the provisional controller/contact for local notices, and what identifiers/version fields must be stored for Terms acceptance, age declaration, Privacy Notice, and contribution-policy disclosure before auth tables are extended?
- Which authentication and account fields are owned by Better Auth versus the application profile, and what migration boundary prevents provider integration in Phase 9 from changing product routes?
- What local rate-limit implementation and trusted-proxy abstraction will Phase 3 use, and which behavior must remain portable to Phase 9 hosting?
- What are the application-owned transactional-email and durable-job/outbox contracts? Phase 3 must implement only local/in-memory adapters; Brevo and hosted background delivery remain Phase 9 work.

### Phase 3 — Product shell, authentication, and onboarding

- Define semantic color, spacing, typography, focus, motion, and card tokens with light/dark behavior.
- Create reusable shell, button, form, place card, non-photo fallback, empty/error state, progress, and dialog components; use Bits UI only where it improves accessible behavior.
- Create a reusable localized personal-comment field and read-only presentation. Show the approved purpose/privacy explanation beside the optional field, include an accessible character counter and validation, preserve line breaks, render only escaped plain text, and test explicit-save versus autosave behavior before choosing one consistently.
- Install and use the official tree-shakable [`@lucide/svelte`](https://lucide.dev/guide/svelte) package for interface and category icons. Import icons statically by name so unused icons do not enter the bundle; centralize size, stroke, and semantic-color defaults in a small reusable icon wrapper or design tokens rather than restyling each use.
- Make the non-photo fallback occupy the same aspect ratio and layout slot as real media so cards do not shift. Use restrained category-specific surfaces, a large decorative category icon, and visible place name/category/locality; do not generate fake place-specific imagery or imply unavailable cuisine, amenities, quality, or branding.
- Treat fallback icons as decorative (`aria-hidden`) when adjacent text already communicates their meaning. Interactive icon-only controls require localized accessible names and tooltips where appropriate. Never rely on icon shape or color alone to distinguish category or state.
- Turn the Better Auth demo into product routes with validation, localized errors, safe redirects, rate-limit strategy, and session-aware navigation.
- Use email/password as the local-development authentication path. Keep provider-neutral account/session boundaries so late social-login integration does not require product-route changes.
- Introduce one application-owned transactional-email interface used by Better Auth callbacks. Through Phase 8, use only a console/in-memory surrogate that records the recipient, purpose, and complete verification/reset URL for manual testing; it must be impossible to enable this transport in preview, beta, or production. Automated tests should inspect the in-memory outbox rather than scrape console output. Define provider contract tests now, but implement and exercise the Brevo adapter only in Phase 9.
- Implement link-based email verification according to Better Auth's [email verification documentation](https://better-auth.com/docs/concepts/email), using `emailVerification.sendVerificationEmail`, `sendOnSignUp: true`, `sendOnSignIn: true`, `autoSignInAfterVerification: true`, and a one-hour `expiresIn`. Configure `emailAndPassword.requireEmailVerification: true` in every environment so email/password users receive no authenticated session before proving address ownership; local development exercises the flow through the surrogate transport.
- Add localized “check your email,” verification success/failure/expired-link, and explicit resend states. Use generic sign-up responses for existing addresses as provided by Better Auth when verification is required; do not reveal account existence.
- Implement “forgot password” and reset-password routes using Better Auth's documented [`sendResetPassword`, `requestPasswordReset`, and `resetPassword` flow](https://better-auth.com/docs/authentication/email-password). Use a one-hour `resetPasswordTokenExpiresIn`, always show the same request confirmation regardless of whether the account exists, and set `revokeSessionsOnPasswordReset: true`.
- Keep verification and reset delivery callbacks non-blocking as recommended by Better Auth. Route them through the application-owned outbox/job boundary and exercise it with a deterministic local worker through Phase 8; integrate hosted durable execution only in Phase 9. Never put tokens or full action URLs in analytics or ordinary production logs.
- Before collecting genuine internal-tester preferences or personal comments, implement and document an authenticated, operator-run local procedure for access/export, processing restriction, ranking-category deletion, and account erasure. Include personal comments in access/export and erasure, back the procedure with the same application services and contribution-policy exclusion path intended for later self-service flows, verify requester identity, and audit the request without retaining deleted preference or comment content. A canonical local JSON export is sufficient through Phase 8—hosted asynchronous archives, CSV convenience files, and self-service UI remain Phase 9 work.
- Build the landing page around the no-ratings value proposition and a single clear call to action; show the approved preference-sharing disclosure before registration.
- Expand Paraglide messages for every product string; add checks that Italian and English catalogues stay aligned.

**Exit:** a new user understands that private preference data contributes pseudonymously to community recommendations, creates an account, signs in, and reaches an accessible empty dashboard in either locale. Ranking routes reject unauthenticated access.

**Open questions to answer before Phase 4:**

- Which product route creates the per-category list: first category visit, first selected place, or an explicit user action?
- What exact empty-dashboard hierarchy and primary call to action best move a verified user into restaurant selection without confusing personal rankings and recommendations?
- Are the local rate limits, outbox retries/idempotency, generic auth responses, and disclosure/version records sufficient to proceed without a hosted dependency?

### Phase 4 — Visited-restaurant selection bucket

- Load or create the authenticated user's single global restaurant list.
- Add locality search/filter controls without changing list identity.
- Build debounced server-side search with loading, empty, error, attribution, and duplicate states.
- Let users add/remove places in a persistent unordered bucket.
- Let users add, view, edit, and delete an optional personal comment from a selected visited-place item or detail surface. Keep the field secondary to selection, use the approved “only you / memory aid / not a review / no recommendation effect” copy, and define removal behavior so a place cannot leave an orphaned comment (confirm comment deletion when removing the visited place).
- Enable “Order your top list” at two places and explain that adding more visited places improves recommendation confidence.
- Preserve unordered visited-place selections across navigation, refresh, and transient network failure. No anonymous authentication handoff is required.
- Instrument search, add/remove, threshold reached, and ranking-start events.

**Exit:** a user can create or resume a persistent visited-place selection, privately annotate a selected place, and start ranking it; this does not require a persisted `draft` list status.

**Open questions to answer before Phase 5:**

- What exact locality input, result grouping, and scope-expansion interaction tested best with the Phase 2A search contract?
- How should users correct an accidental visited-place addition before versus during an open ranking session?
- Which selected-place count and search/add behavior make the ranking call to action understandable without imposing a list-size cap?
- What comparison-session snapshot must be created when ranking begins so later catalogue or bucket changes cannot silently alter the active session?

### Phase 5 — Pairwise ranking experience

- Start/resume a server-owned ranking session and request one comparison at a time.
- Show two balanced place cards with the shared Lucide-based non-photo fallback when licensed media is absent or fails to load, plus name, area, and category-relevant metadata—never ratings.
- Provide an unobtrusive owner-only way to reveal each place's personal comment during a comparison when it helps recall the experience. Keep it collapsed by default so comment length does not unbalance the choices, and do not send comment content with comparison analytics or ranking evidence.
- Randomize left/right presentation independently of the logical comparison and persist the logical pair plus request reason so presentation bias does not become training evidence.
- Support card tap/click, explicit buttons, keyboard controls, tie, “skip / cannot compare,” and undo. Treat swipes as progressive enhancement, not the only input.
- A skipped comparison leaves both places in the list, records no preference edge, and allows the engine to continue or finish with a partial order when strict placement cannot be inferred.
- When skipped comparisons leave insufficient evidence for a total order, render the affected places as an unresolved tier. Preserve resumable state so targeted comparisons can be added later without blocking the initial MVP flow.
- After a skip, try a useful alternative comparison when it can narrow placement; do not repeat or replace the skipped outcome with inferred evidence merely to help recommendations.
- Save each response idempotently before advancing; handle double taps, stale revisions, multiple tabs, offline/interrupted requests, and session expiry.
- Add reduced-motion-safe transitions, selection feedback, and an honest progress estimate.
- Use occasional partial-ranking feedback only if it does not reveal unstable or misleading positions.
- On completion, present the ranked list/tier groups, show which places have a private personal comment without exposing its text unnecessarily, and allow owner-only viewing/editing alongside ranking confirmation or editing.
- After the persisted flow is usable, run controlled developer/internal-tester sessions using the participants' genuine preferences under the internal product-testing procedure. Do not collect those preferences until the Phase 3 manual rights procedure has been exercised successfully. Verify that entered data is marked with internal-cohort provenance, remains private, can be accessed/exported, restricted, and deleted through that procedure, and is excluded from beta funnel and success metrics.

**Exit:** the core flow is accessible, resumable, concurrency-safe, and produces a reproducible persisted ranking.

**Open questions to answer before Phase 6:**

- Did internal use validate the selected ranking algorithm's question count, progress estimate, tie/skip language, and recovery behavior at the measured list sizes?
- Which unresolved-order presentation is easiest to understand without implying that skipped places are tied?
- What session-expiry duration and resume/supersession UX should be retained after testing refresh, multiple tabs, and interrupted writes?
- Are internal participation provenance, notice, export, restriction, and deletion procedures ready before genuine developer/tester rankings are used more broadly in Phase 6 diagnostics?

### Phase 6 — Existing-list maintenance

- Add a new visited place to a current total-order revision using binary insertion while continuing to serve the previous revision's unaffected resolved evidence until the insertion publishes its successor.
- Implement targeted local repair when later transitive evidence contradicts an explicit tied tier; never split a tie silently.
- Detect preference cycles and ask a clarifying comparison. Pending clarification, retain the newest answer, temporarily exclude the oldest conflicting evidence, and prompt a focused reranking of the involved places.
- Do not age or decay personal-ranking evidence over time. After concrete contradiction or invalidation, derive the smallest repair requirement and exclude only affected evidence; do not mark the entire list stale.
- Support removing a place and changing an answer without unnecessarily discarding valid evidence.
- Support viewing, adding, editing, and deleting personal comments from maintained-list place details without creating ranking revisions or recommendation invalidations. When removing a place or deleting/rebuilding a category, clearly disclose the associated comment-deletion consequence; rebuilding order alone preserves comments.
- Show clearly labelled, recalculated ordinal positions in locality-filtered personal-list views without modifying the global ranking.
- Invalidate downstream recommendation results when the current published ranking revision changes; this is cache/model invalidation, not a ranking-list lifecycle state.
- Provide deliberate “rebuild this list” and delete actions with clear consequences.
- Continue controlled internal use through insertion, contradiction, repair, removal, and rebuild flows. Record qualitative defects and privacy-safe aggregate diagnostics; do not promote individual ranking examples into fixtures, documentation, or bug reports unless they have been deliberately minimized or replaced with synthetic reproductions.

**Exit:** rankings remain maintainable over time rather than being one-use onboarding artifacts.

**Open questions to answer before Phase 7:**

- Where will model artifacts and reproducible training metadata live locally, and what provider-neutral artifact-store contract will allow Phase 9 external storage without changing recommendation code?
- How will local training/rebuild jobs be triggered, locked, retried, cancelled, and promoted atomically, and what job contract will later map to hosted execution?
- What exact evidence/support thresholds from synthetic and internal diagnostics permit personalized serving, while remaining explicitly provisional until Phase 9 beta validation?
- What does “full predicted order” mean operationally: the entire eligible Italian catalogue, all supported candidates, or a bounded candidate universe defined by support and catalogue status?
- How is that order delivered: page/cursor size, maximum browsable depth, stable tie-breaking, snapshot/version consistency across pages, and invalidation behavior?
- Where do unsupported or newly imported places appear, if anywhere, and how are visited items interleaved without implying confidence the model does not have?
- What local latency, memory, artifact-size, and quality thresholds must the Phase 7 implementation meet before hotels are added?

### Phase 7 — Personalized recommendations

- Build versioned restaurant model artifacts only through the policy-enforcing `RecommendationEvidenceSource`, recording its contribution-policy version. From each permitted current published revision, consume every eligible resolved listwise segment or active relation regardless of total order coverage; exclude skips, unresolved relations, superseded evidence, temporarily excluded contradictory evidence, and policy-excluded revisions without disabling unaffected permitted evidence. Never mutate explicit personal rankings.
- Fit the current user's regularized factors from evidence permitted for current-user personalization in their current published revision while keeping the trained place factors fixed; return visited and not-yet-visited candidates ordered by latent utility with internal support/eligibility metadata. Do not assume that permission for personal inference and permission for community-model contribution are technically inseparable.
- Implement the “full predicted order” candidate-universe and pagination contract decided at the Phase 6 gate. Make that ordered view the default and display visited status clearly; do not default to an unseen-only discovery feed or imply that unsupported catalogue entries received meaningful personalized scores.
- Apply locality after the global order is scored. When filtered support is sparse, return fewer results and offer an explicit scope expansion rather than silently inserting broader candidates.
- Enforce the provisionally calibrated personalization gate from synthetic and internal diagnostics. Below it, use the regularized global place prior with a clear community-based/non-personalized label, ask the user to rank more visited restaurants, or show an honest insufficient-evidence state. Generalize the copy by category when hotels are added, and treat Phase 9 beta evaluation as the gate for confirming or revising the thresholds.
- Clearly distinguish predicted recommendation positions from personal ranking positions. Present concise recommendation reasoning and a path to mark “already visited,” feeding that place into the ranking UX for its category.
- Never use personal-comment text, presence, length, or edit history as a recommendation feature, explanation, support signal, or candidate filter. Once a recommended place is marked visited, offer the same optional private-comment affordance used elsewhere, not a public review prompt.
- Instrument recommendation exposure and conversion first-party: an exposure occurs only when an eligible, previously unvisited result is actually rendered to the user. Count at most one conversion per `(user, category, place)` when that place is added as visited within 90 days of its most recent eligible exposure. Exclude synthetic/demo data and places already marked visited at exposure time.
- Cache or snapshot only after measuring latency; version results and invalidate on relevant ranking, catalogue, processing-restriction, or contribution-policy changes.
- Evaluate recommendation quality with leakage-safe synthetic held-out fixtures and the separately identified internal product-testing rankings collected through Phases 5–6. Report results by data source, use internal evidence only as diagnostic end-to-end validation, and defer external-cohort claims and threshold confirmation to Phase 9. During beta, measure delayed agreement when recommended places are later added and ranked.

**Exit:** users who pass the provisionally calibrated evidence gate receive an explainable predicted order of visited and unseen restaurants, filterable by locality without altering their global restaurant list; all other users see an honest useful next step. Phase 9 beta evidence must confirm or revise the gate before general release.

**Open questions to answer before Phase 8:**

- Did the chosen candidate-universe, cursor/pagination, and stable-order contract remain understandable and performant with the full local Italy restaurant catalogue?
- Do internal diagnostic results justify keeping the provisional recommendation family and serving gate for the hotel implementation, or is an ADR/model change required first?
- Which recommendation explanations are accurate, privacy-safe, and understandable without exposing support/confidence as a rating?
- Which shared category contracts need extension for hotels, and which restaurant-specific assumptions must be removed before reuse?

### Phase 8 — Add hotels before beta

- Extend the Italy OSM importer and loose coverage audit to `tourism=hotel`, preserving the same canonical place/provider contracts and blocking beta only for clearly breaking or deeply biasing issues.
- Add hotel-specific catalogue metadata, search filters, empty states, and the `Hotel` variant of the shared Lucide-based card fallback, plus localized overall-preference copy without branching the shared ranking components unnecessarily.
- Enable one separate global hotel list per user and enforce that comparisons and recommendations never cross categories.
- Reuse the same personal-comment data/service/UI contracts for visited hotels, including owner-only authorization, localized purpose copy, deletion/export behavior, and optional reveal during comparison; do not create restaurant- or hotel-specific comment implementations.
- Exercise the existing ranking engine against hotel fixtures and behavior; introduce category-specific policy only where product evidence requires it.
- Validate the recommendation engine independently for hotels, including evidence/support thresholds, cold starts, locality filtering, and visited/unseen result labeling.
- Add restaurant-and-hotel integration, component, algorithm, and end-to-end coverage.
- Run an Italian hotel catalogue/licensing quality review and prepare the hotel flows, measures, and data separation needed for the private-beta research executed in Phase 9.

**Exit:** restaurants and hotels both support the complete authenticated selection → personal ranking → recommendation loop and meet their local implementation, catalogue, algorithm, accessibility, and internal-validation gates. External recommendation-quality and usability validation remains a Phase 9 private-beta gate.

**Open questions to answer before Phase 9:**

- What is the approved recurring beta budget, including hosting, database, email, error reporting, backups, domain, taxes, and operational headroom?
- What numeric latency, cold-start, availability, email-delivery, database-size/activity, backup/restore, and model-rebuild acceptance thresholds will determine whether the provisional vendors are retained?
- Which private-beta locality, cohort size/composition, recruitment method, research scripts, incentives, and category-specific success interpretation are approved in the external research brief?
- Has legal review approved mandatory reciprocal contribution, the 18+ approach, notices/Terms, provider processing, retention, and the Phase 9 research/data procedures; if not, which documented fallback must be activated before invitations?
- Which Koyeb, Neon, Brevo, Sentry, Google OAuth, backup, artifact-storage, and scheduled-job configurations are permitted, and who owns credentials, incident response, and rollback decisions?

### Phase 9 — Hardening and beta release

- Threat-model authentication, personal-comment authorization/IDOR and stored-content rendering, catalogue ingestion, comparison writes, rate limiting, CSRF, XSS, and abuse paths.
- Provision and validate the selected external deployment stack for the first time: deploy the SvelteKit Node application to Koyeb, migrate/import into Neon through its pooled endpoint, configure environment-separated secrets and health checks, and prove rollback without making provider APIs part of domain logic. Keep the environment access-restricted to authorized operators, use only synthetic or authorized internal-test data, and do not invite external users until the legal/privacy, security, email, backup/restore, and operational-readiness gates in this phase have passed.
- Implement and exercise the Brevo transactional-email adapter behind the existing interface. Verify SPF, DKIM, DMARC, bounce/suppression behavior, rate limits, provider branding, expired/reused links, durable background delivery, redacted logs, and provider-contract tests before invitations.
- Integrate Sentry's selected EU/Germany service behind the error-reporting boundary with source maps, releases, alerts, PII scrubbing, conservative tracing, and no session replay; retain structured redacted Koyeb logs and provider-independent health/audit signals.
- Validate the runner-neutral OSM importer through an explicitly triggered GitHub Actions job, and enable a conservative filtered-update schedule only after runtime, idempotency, atomic promotion, failure recovery, and cost are proven. Keep PBF files and database backups out of workflow artifacts.
- Integrate the selected hosted job and artifact/backup mechanisms behind the local contracts established earlier; test model build/promotion, retention jobs, export generation, erasure rebuilds, backup/restore, and tombstone replay under realistic failures.
- Near the end of beta hardening, add social login with Sign in with Google as the minimum provider. Configure separate development/preview/production OAuth clients and exact redirect origins; request only the minimum scopes needed for authentication.
- Link a social identity to an existing account only through Better Auth's verified, explicit account-linking rules. Test duplicate-email, provider-email changes, revoked consent, cancelled callbacks, state/PKCE and redirect validation, existing sessions, account deletion, and recovery so Google login cannot create duplicate profiles or orphan rankings.
- Retain email/password alongside Google login unless a later product decision explicitly removes it. Disable the local email surrogate outside local/test environments and run end-to-end hosted delivery checks before inviting beta users.
- Add independent database backup/restore and migration rollout/rollback procedures; do not treat Neon's restore window as the only backup.
- Complete accessibility testing for keyboard, screen reader, contrast, touch targets, zoom, reduced motion, and both locales.
- Complete and obtain legal review of the DPIA, processing record (including private personal-comment purpose, access, retention, and exclusion from model/analytics processing), contractual-necessity assessment for the expected mandatory reciprocal contribution policy, fallback legitimate-interest assessment if pursued, processor/transfer register, 18+ age approach, layered Privacy Notice, Terms, cookie/storage notice, and provider attribution. Record the approved contribution-policy version before launch. If mandatory contribution is not approved, activate and test the selected objection or optional-consent policy and matching user controls through the existing boundary before inviting users. Do not launch with placeholder legal text or a mismatch between disclosure, policy configuration, and model inputs.
- Implement self-service JSON/CSV access/export including personal comments; individual comment deletion; ranking-category and account deletion that erase applicable comments; processing-restriction enforcement; evidence exclusion and category-model rebuild; erasure tombstone replay after restore; retention jobs; privacy-request tracking; and the documented manual rights workflow.
- Verify that the MVP ships no marketing email, cross-site/third-party analytics, non-essential tracking, fingerprinting, pixels, advertising identifiers, or session replay, and that transactional templates contain no promotional material.
- Run responsive and cross-browser end-to-end tests of sign-up, draft/resume, ranking, insertion, recommendation, locale switching, and failure recovery.
- Verify beta synthetic-data labelling and isolation, including that no synthetic ranking evidence is associated with or affects real places.
- Run the approved private-beta cohort and research method with both restaurants and hotels in the chosen area. Collect the first external real-user evidence under the documented product-processing lawful bases, notices, participant controls, and—where a distinct research activity requires it—separate research consent.
- After sufficient beta evidence exists, repeat the leakage-safe recommendation evaluation on the external cohort, report synthetic, internal-testing, and beta results separately, and recalibrate category-specific support/personalization thresholds. Compare recommendation relevance with the global prior and review delayed predicted-versus-actual agreement before making launch or catalogue-expansion claims.

**Exit:** an operable private beta has run on the selected external stack with defined rollback, support, privacy, and measurement procedures; its evidence is sufficient to decide whether a general release or catalogue expansion is justified.

**Open questions to answer before general release or catalogue expansion:**

- Did restaurant and hotel beta cohorts independently meet the approved ranking-completion, recommendation-relevance, coverage, usability, privacy, and reliability targets?
- Did external-cohort evaluation confirm or change the model family, candidate universe, pagination behavior, personalization/support gates, and cold-start presentation for each category?
- Are measured recurring costs, operational load, backup/restore performance, email delivery, incident handling, and vendor/data-processing terms acceptable for continued operation?
- Which beta findings require remediation before release, and which explicitly documented limitations may be monitored after release without misleading users?

### Future — patron-confirmed review trust

Do not implement malicious/coordinated-ranking detection or public reputation scores in the MVP. When written reviews are reconsidered after the core loop is validated, prototype a positive trust signal in which independent patrons can confirm that another client's review is fair, honest, and useful. Require multiple independent confirmations before they affect trust so coordinated manipulation is materially harder; confirmations must never alter the reviewer's private personal ranking.

Design this as encouragement for kind, factual reviewing rather than as a public blame or downvote mechanism. Before implementation, define what makes a patron eligible to confirm, how visit/account independence is established, caps and conflict-of-interest rules, privacy and appeal behavior, and how confirmations may cautiously weight future recommendation evidence.

## Testing strategy

- **Pure unit tests:** personal-comment validation/plain-text normalization and its strict non-effect on ranking/recommendation outputs; ranking revision/projection invariants, session state machine, derived next action, progress bounds, ties, contradictions, undo, serialization/version migration, purpose-specific contribution-policy decisions/versioning, recommendation-evidence extraction from none/partial/total coverage under mandatory and optional-policy fixtures, recommendation scoring, recommendation-exposure attribution/deduplication, and permission helpers.
- **Database integration tests:** personal-comment uniqueness/length constraints, owner scoping, visited-place requirement, concurrent edits, and individual/category/account deletion; constraints, transactions, idempotency, list ownership, monotonic immutable revisions and atomic current-revision publication, one effective open session per list/revision, concurrent revision/session supersession, processing restrictions, policy-enforced evidence extraction with no raw-query bypass, contribution-policy version lineage, seed imports, source/override resolution, redirect-cycle prevention, reversible merge transactions, quarantine exclusions, append-only catalogue audits, verification/reset token expiry and purge, session revocation after password reset, retention jobs, erasure tombstones, category/account evidence exclusion, model invalidation/rebuild requests, and recommendation queries against isolated PostgreSQL.
- **Component tests:** place cards with missing/broken media, restaurant/hotel fallback variants, decorative versus interactive icon accessibility, bucket, personal-comment helper copy/counter/validation/collapsed comparison display/plain-text rendering, comparison controls, focus management, localization, reduced motion, and all loading/error/empty states.
- **End-to-end tests:** 18+ declaration, Terms acceptance, separately linked Privacy Notice, and registration disclosure; blocked sign-in before email verification; verification resend/success/expired link; generic duplicate-sign-up and password-reset responses; password-reset success/invalid or reused token/session revocation; Google sign-in and account linking before beta; create/resume a visited-place selection; create/view/edit/delete a personal comment and prove another user cannot access it; reveal it during comparison without affecting evidence; complete a 2-place and larger total order; tie/skip/undo; retain and serve unaffected resolved evidence after a skip, new unplaced item, or repair requirement; refresh mid-session; concurrent-tab conflict and session supersession; insert/remove a place and confirm associated comment deletion; submit a private structured catalogue issue; enforce user/curator/admin permissions; correct, quarantine, merge, reverse, and reconcile an upstream catalogue change with a complete audit; view the full predicted order with visited status and locality filtering; receive or fail gracefully to receive recommendations; request/download/expire a JSON/CSV export containing only the requester's comments; delete one ranking category; delete the account and verify session revocation, live-data/comment erasure, evidence exclusion, and restored-backup tombstone replay.
- **Algorithm tests:** exhaustive permutations for small lists and generated noisy/tied/partial rankings for larger lists; listwise likelihood and gradient checks; deterministic pairwise-view derivation; no double counting across revisions; skip/unresolved exclusion; tie handling; per-list normalization; cold-start shrinkage; locality-invariant scores; held-out split leakage checks; and reproducible benchmark metrics.
- **Non-functional tests:** mobile performance on a throttled connection, catalogue/recommendation query plans, basic load tests, automated accessibility checks backed by manual review, privacy scans proving the absence of forbidden trackers/marketing paths, and retention/processor-failure drills.

Use deterministic seeds and clocks where possible. Do not make routine tests depend on a live external place API.

## Analytics and success measures

Define events and privacy/retention before collection. The MVP has no third-party or cross-site analytics. Never put place names, personal-comment text, comment excerpts or derived topics, search text, precise coordinates, emails, full action URLs, or raw comparison pairs in analytics events. If comment-affordance usage is measured, allow only coarse allowlisted create/edit/delete events without content, length, place identity, or a persistent comment identifier.

For the MVP, collect an allowlisted event vocabulary through a first-party server-side service and store it inside the EU PostgreSQL boundary with explicit retention and cleanup. Prefer authoritative domain records for recommendation exposures, additions as visited, and ranking completion rather than duplicating them as untrusted client events. Stamp measurements with immutable environment/cohort provenance and report synthetic, internal-testing, private-beta, and general-release evidence separately; internal sessions never enter beta denominators or success targets. Do not create a separate browser analytics identifier or silently introduce a managed analytics product; either change requires a later explicit product and privacy decision.

Initial funnel:

- landing call-to-action → registration/visited-place selection started;
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
