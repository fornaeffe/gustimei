# Phase 7.5 map-first discovery

Date: 2026-08-31

## Product and ranking contract

The authenticated Discover destination is the restaurant map at
`/recommendations/restaurants`. The dashboard remains available as an account and workflow overview,
but successful sign-in and verification, already-authenticated auth routes, and the primary Discover
navigation now lead to the map.

The map displays every active restaurant in the application-owned OSM catalogue. It loads that
catalogue by current viewport rather than shipping the national dataset to the browser. The Phase 7
candidate universe—at most 1,000 supported places plus the user's active visited places—remains a
separate recommendation overlay. Unsupported restaurants are visible and explicitly labelled as
having no recommendation data; they are never assigned a synthetic score or position.

“Nearby” is the current Leaflet viewport. Filtering a viewport preserves the stable global predicted
order, so nearby rank is the one-based index after that filter. The highlighted group contains
`ceil(nearby count × 0.10)` places, with a minimum of one for a non-empty viewport. Moving or zooming
the map changes only this presentation scope; it does not change the personal list, global scores,
artifact, or ranking evidence.

Every marker tooltip and popup includes name, address or locality, visited state, and recommendation
coverage. Ranked places show their nearby position; the highlighted group is labelled as the top ten
percent. A native `details` element exposes the complete ranked viewport order as a collapsible,
keyboard-operable list. Selecting a list row moves the map to its marker. The list is the non-visual
equivalent for users who cannot operate or interpret the recommendation overlay.

Recommendation state has three visual levels: orange star for top-ten-percent, green dot for ranked
but non-top, and a neutral dashed hollow marker for unranked. This third level is appropriate because
it tells users whether a position is supported, but it is deliberately low-emphasis so it does not
look like a negative quality judgment. Visited is an orthogonal check/double-ring treatment, retained
for every recommendation level. A textual legend and popup labels duplicate all visual meanings.

At zoom levels below 13, the server groups every visible restaurant into deterministic geographic
grid cells sized to leave roughly one standard cluster radius between cell centers and returns exact
cluster counts and bounds. Cells containing one restaurant remain exact, individually interactive
restaurant markers rather than clusters. Cluster clicks zoom into their contents;
clusters summarize visited and ranked restaurants, while top recommendations and visited restaurants
remain individually emphasized. At zoom 13 and above the server returns individual places, capped at
2,000; exceptionally dense views fall back to progressively finer clusters. Move requests are
debounced, previous requests are aborted, and per-user reads are rate-limited.

Exposure attribution remains artifact-bound. The browser submits only previously unvisited place IDs
when their markers first enter the current viewport during that page visit. The existing server
boundary rejects ineligible/synthetic entries and deduplicates eligible exposure/conversion records.
Search text, precise map coordinates, bounds, and map interaction events are not product analytics.

## Map and geocoding providers

Leaflet 1.9 is the viewer. The default base layer is the standard raster endpoint at
`https://tile.openstreetmap.org/{z}/{x}/{y}.png`, with visible copyright attribution. The URL is
configured by `OSM_TILE_URL`; there is no prefetch, offline download, tile scraping, custom no-cache
header, or attribution suppression. Browser defaults retain the referrer and HTTP cache behavior
required by the OSM Foundation tile policy.

Location search uses an application-owned `NominatimGeocoder` behind authenticated
`/api/geocode`. It is deliberately submit-only; no keystroke autocomplete reaches Nominatim. Queries
are trimmed, bounded to 2–160 characters, restricted to Italy, limited to five results, cached in
memory for 24 hours, limited per user, and serialized process-wide with at least 1.1 seconds between
provider requests. Requests carry `GustiMei/0.0.1` and the configured application origin in the user
agent and time out after eight seconds. `GEOCODING_BASE_URL` permits a self-hosted or contracted
replacement without changing the route or UI.

The public OSM tile and Nominatim services are best-effort development defaults, not a capacity or
availability commitment. Phase 9 must reassess measured usage and provider terms before external
traffic. Switching to a dedicated OSM-derived provider changes configuration, not the recommendation
or map contracts.

## Automated and deferred verification

Pure unit tests cover viewport filtering without order changes, exact top-decile rounding, wrapped
longitude bounds, geocoder request shape, identification, coordinate conversion, caching, query
validation, and environment/provider validation. The normal Svelte check, official autofixer, lint,
unit suite, and production build are the implementation gates. An authenticated local runtime smoke
test also verifies that the imported Italy catalogue produces non-empty cluster responses from the
map endpoint. When a newly added endpoint unexpectedly returns the application's HTML 404 during
development, check for stale Vite processes bound separately to `::1` and `127.0.0.1`; one process
per configured origin avoids serving an obsolete route manifest through `localhost`.

The following are provisional and changeable after targeted human testing: initial Italy-wide framing,
marker density on small screens, touch and hover comprehension, list collapse behavior, search-result
wording, base-tile contrast in dark mode, and full-candidate-universe interaction performance. These
do not block Phase 8 because the most probable usable behavior is implemented and the provider,
ranking, and UI boundaries permit localized revision.
