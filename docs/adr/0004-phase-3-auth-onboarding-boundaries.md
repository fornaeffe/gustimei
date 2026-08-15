# ADR 0004: Phase 3 authentication and onboarding boundaries

- Status: accepted as the Phase 3 implementation boundary
- Date: 2026-08-15

## Provisional controller and registration records

Use the following provisional controller details in local notices through Phase 8:

- Luca Fornasari
- fornaeffe@gmail.com
- via Picedi Benettini 6, 43123 Parma, Italia

Legal review remains required before inviting external beta users. Keep controller details in
versioned notice content rather than copying them into every user's registration record.

Create an application-owned, immutable registration attestation linked to the Better Auth user ID.
It records a stable internal ID, the server-recorded timestamp, locale, Terms version accepted, age
declaration version, Privacy Notice version presented, and contribution-policy disclosure version
presented. A separately versioned document registry records document type, version, locale,
effective time, and a content hash. The presence of a registration attestation records the required
Terms acceptance and 18+ declaration. Privacy Notice and contribution-disclosure fields record
presentation, not consent; do not add a Privacy Notice consent flag.

## Authentication and application ownership

Better Auth owns its core user identity, email and verification state, credentials and linked
provider accounts, verification tokens, and sessions. The application owns product profile and
preferences, locale, registration attestations and disclosure history, rights/restriction records,
and authorization assignments.

Application tables reference the stable Better Auth user ID without adding product-policy fields to
Better Auth tables. Product routes depend on an application-owned account/session projection rather
than email/password or provider-specific data. Adding Google or another provider in Phase 9 may add
or link Better Auth account records, but must not change product route contracts.

## Local rate limiting and trusted client addresses

Define an application-owned rate-limit interface whose policy input is a purpose-specific scope and
opaque, normalized key and whose result reports whether the request is allowed and, when denied, a
retry interval. Use injectable time and deterministic fixed-window policies with an in-memory
adapter for development and tests through Phase 8. Auth policies may combine an ephemeral client
address key with a one-way-derived normalized account-identifier key; never expose which key caused
a generic auth rejection.

Resolve client addresses behind a separate SvelteKit-aware interface. Local direct connections use
the framework-provided client address, and forwarded headers remain untrusted through Phase 8.
Phase 9 must explicitly configure the known proxy topology and may replace rate-limit storage, but
must preserve scopes, normalization, decisions, retry behavior, generic responses, and deterministic
contract tests.

## Transactional email and background jobs

Keep transactional email and job delivery application-owned. The outbox contract uses typed email
purposes, stable job IDs and idempotency keys, recipient, locale, minimum template/action data,
creation and next-attempt times, attempt count, and retry outcome. Verification and password-reset
jobs contain the complete action URL, but tokens and URLs must never enter analytics, ordinary logs,
or error metadata.

Better Auth callbacks enqueue and return without waiting for delivery. A deterministic local worker
claims jobs, records attempts, applies bounded retry policy, and calls the email transport. Local and
test adapters retain inspectable messages and jobs in memory so automated tests never scrape console
output. The local transport must fail closed during configuration in preview or production. Brevo,
distributed storage, and hosted durable workers remain Phase 9 implementations behind the same
contracts.

## Consequences

- Phase 3 may extend application schema without coupling product data to Better Auth provider
  choices.
- Registration can prove which approved text was accepted or presented without misrepresenting a
  privacy notice as consent or retaining unnecessary request metadata.
- Local auth throttling and email flows are deterministic and testable without hosted dependencies.
- Phase 9 may replace infrastructure adapters only; changing policy behavior or record meaning
  requires a new decision and migration plan.
