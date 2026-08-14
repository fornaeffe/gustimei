# ADR 0003: Phase 2A persistence and locality boundaries

- Status: accepted as the Phase 2A migration input
- Date: 2026-08-14

## Persistence invariants

- A ranking list is the durable `(owner, category)` aggregate and has no workflow status.
- Revisions are immutable, monotonically numbered per list, and published by atomically advancing
  `current_revision_id`.
- A revision records ordered explicit-equivalence tiers, unresolved relations, active evidence,
  excluded/superseded evidence and reasons, ranking-engine version, and capture provenance.
- Comparisons store two different logical place IDs, presentation-independent outcome, request
  reason, sequence, supersession/undo provenance, and session ownership.
- Sessions alone store `open`, `completed`, or `superseded`; enforce at most one effective open
  session for a list/base revision.
- Recommendation extraction reads only the current revision through the purpose-specific policy
  resolver. Skip and unresolved relations do not become preferences; unaffected resolved evidence
  from a partial revision may contribute.
- A personal comment is an owner/place aggregate with no foreign-key or service path into revision,
  comparison, model, score, or artifact invalidation generation.

## Canonical locality representation

Keep imported OSM facts immutable and derive an effective locality projection containing:

- ISO country code;
- OSM boundary/source identities and names for region (`admin_level=4`), province/metropolitan area
  (`admin_level=6` where available), and municipality (`admin_level=8` where available);
- settlement/locality name and postal code when available;
- representative latitude/longitude for radius/bounds filtering;
- a normalized, accent-insensitive search text projection and localized display label.

The source fields remain attributable to OSM; boundary assignment, normalization, fallback locality
text, centroid/representative point, and search tokens are derived index data with their own version.
Initial named filtering uses stable municipality/boundary identities when available, with documented
text fallback for incomplete OSM coverage. Radius or map-bounds filtering uses coordinates. Locality
filters are applied after global recommendation scoring and never identify a ranking list or train a
local model.

This combination avoids committing search identity to unreliable free text while still allowing
Italy-wide imports with incomplete administrative tags. Phase 2A's coverage audit may refine
fallback rules without changing the ranking/recommendation contracts.
