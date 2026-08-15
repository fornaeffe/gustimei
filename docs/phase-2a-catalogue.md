# Phase 2A catalogue operations and compliance

## Local import boundary

The restaurant catalogue is imported from a user-supplied Italy OpenStreetMap PBF extract. The
application never calls public Nominatim or another public OSM endpoint at request time. Phase 2A
commands are deliberately blocked in preview and production; Phase 9 will put the same importer
behind a runner-neutral scheduled-job boundary after its runtime and cost are measured.

Recommended source: the current `italy-latest.osm.pbf` extract from Geofabrik. Record the download
date and source URL outside the repository, then run:

```powershell
npm run catalogue:import:restaurants -- C:\path\to\italy-latest.osm.pbf
npm run catalogue:audit:restaurants
```

The importer calculates and stores a SHA-256 source checksum. Re-running an already promoted file
with the same normalizer and locality-index versions is idempotent. A processing-version change
creates a new import lineage even when the PBF bytes are unchanged. Interrupted or failed imports
with the same checksum and versions resume their staging record. Promotion changes source mappings
and the effective search projection in one transaction; source snapshots remain immutable. Records
missing from a later full extract are quarantined rather than deleted, preserving identities
referenced by rankings.

Expect a long local run on a laptop: the pipeline reads the file once for its checksum and three
times to discover candidates/boundaries, resolve referenced ways, and resolve only their nodes. It
does not retain every Italy node in memory. Keep the laptop powered and allow the process to finish;
an interrupted run can be invoked again with the same file.

## Normalization and locality

Nodes, ways, and relations use `(provider, element type, numeric ID)` as source identity and map to
one stable application place. Ways and relations receive a representative point from referenced
nodes. Missing geometry is counted and excluded instead of guessed.

Administrative boundary relations at levels 4, 6, and 8 are resolved from the PBF. Relations with a
missing member way or node are excluded from the locality index instead of being interpreted as an
open polygon. A spatial grid narrows point-in-polygon checks, and the smallest containing complete
boundary at each level wins deterministically. Boundary identities and their source snapshots are
stored. Imported address tags remain in the immutable snapshot; normalized accent-insensitive text,
display locality, boundary keys, and coordinates form the versioned effective locality index. Text
address/locality is an explicit fallback when a stable municipality identity is unavailable.

Records without a usable name or with a representative point outside the extract's Italian
admin-level-2 boundary are quarantined. Exact-name candidates within five metres are retained as
separate OSM identities but the later deterministic identity is quarantined as a possible duplicate
for review. These are catalogue-sizing and harm-reduction rules, not a permanent Italy-only domain
invariant; future regional/global providers can supply a different import boundary without changing
place identity, provenance, search, or promotion contracts. The intentionally loose duplicate rule
avoids silently merging distinct businesses.

## Attribution, ODbL, and images

Catalogue surfaces must render “© OpenStreetMap contributors” linked to
<https://www.openstreetmap.org/copyright>. The reusable attribution constant lives in
`src/lib/domain/catalogue/licensing.ts`. Database/source version and checksums support attribution
and derived-database provenance. Before distributing a production database or extract, review the
ODbL share-alike and produced-work obligations for that distribution.

Phase 2A imports no photos or other optional media. A future image adapter must supply the image
URL, source page, attribution, and licence; incomplete image provenance is rejected by the shared
licensing guard. The MVP non-photo fallback therefore remains authoritative.

## Coverage audit status

**Passed on 2026-08-15 under the loose Phase 2A gate.** The user-supplied, gitignored
`downloaded_data/italy-260814.osm.pbf` was 2,219,629,256 bytes. Its SHA-256 checksum is
`5f409b6298c84929e81b23e64fd79a4d4da049825a1e5e335340196e32fa540a`. The promoted processing
versions are `osm-restaurant-v2` and `osm-admin-4-6-8-text-v2`; the final wall-clock import took
14 minutes 29 seconds on the development laptop.

The audit found 77,007 source candidates: 72,507 active (94.16%) and 4,500 quarantined (5.84%).
Quarantine reasons were 4,260 missing names, 130 representative points outside the Italy boundary,
108 possible duplicates, and 2 explicit non-Italian country tags. All candidates had usable
geometry. Municipality identity was present for 76,896 records; 111 (0.14%) lacked it. The active
region distribution contained the 20 named Italian regions plus 25 records with no region identity.
Source element counts were 66,446 nodes, 10,467 ways, and 94 relations.

Settlement text is absent for 50,466 records (65.53%) and postcode for 49,617 (64.43%). These fields
remain optional because stable municipality identity, normalized locality text, and coordinates are
available for search/filtering. The audit did not independently ground-truth category correctness,
closure/staleness, or OSM completeness. Those are recorded limitations for refreshes and Phase 2B
issue intake, not Phase 2A blockers. Minor extract-edge membership is also non-blocking because Italy
is presently a manageable catalogue scope rather than a permanent product restriction.

## Measured storage and search behavior

The development PostgreSQL database occupied 344 MB after retaining three complete import lineages
created while correcting and re-running the same source. The largest relations were immutable source
snapshots (118 MB), the effective projection (98 MB), import-element history (72 MB), and source
mappings (32 MB). This is intentionally not presented as a single-import steady-state estimate;
retention/compaction policy remains a later operational decision and must preserve referenced
provenance.

Warm `EXPLAIN (ANALYZE)` measurements against the 77,007-record catalogue were approximately:

- 17.5–19.0 ms for broad name-plus-locality prefix searches using the GIN full-text index;
- 1.2 ms for text combined with the municipality B-tree index;
- 5.8 ms for a representative Milan coordinate-bounds query;
- 21.0 ms for the empty initial page after removing an unnecessary relevance expression so the
  normalized-name B-tree index is used (down from about 68.7 ms).

PostgreSQL `simple` full-text prefix search plus the existing municipality, coordinate, and
normalized-name indexes therefore meets the measured local Phase 2A need. Re-measure with realistic
concurrency and a larger/global catalogue before changing search technology or setting hosted beta
latency/cost thresholds.

Loose blocking policy: block only identity, geometry, naming, category, or geographic-skew defects
that make the product unusable or deeply biased. Record incomplete municipality identity,
settlement, and postal-code coverage as limitations unless measurements show such a severe defect.
