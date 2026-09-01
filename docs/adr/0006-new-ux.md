# GustiMei UX Specification — Map-first continuous discovery and ranking

## 1. UX concept

GustiMei should be organized around a continuous cycle:

**discover → record experiences → occasionally rank → receive better recommendations → discover again**

The application should not feel like a sequence of onboarding tasks that eventually leads to a finished ranking. The user's personal ranking is a continuously maintained representation of their experiences.

The **map is the primary everyday workspace**. Ranking is a focused secondary activity that GustiMei proposes when there is useful new preference information to collect.

The principal UX states — **visited**, **ranked**, **recommended**, and **reviewed** — must remain independent:

* **Visited** means that the user says they have visited the place.
* **Ranked** means that sufficient preference evidence exists to position the place, wholly or partially, in the user's private ranking.
* **Recommended** refers to the recommendation engine's predicted order and is not a user rating.
* **Reviewed** means that the user has separately published a public textual review.

---

# 2. Primary user flow

The prototypical recurring flow is:

**Landing page**

→ authentication / registration / verification

→ **full-screen Discover map**

→ search, pan, zoom, or inspect nearby restaurants

→ hover, focus, or tap a restaurant

→ **restaurant preview opens**

→ user marks the restaurant **Visited**

→ optionally opens the review flow

→ returns to the map

→ marks other restaurants as Visited over time

→ when enough useful unranked experience has accumulated, a **ranking invitation** becomes noticeable

→ user starts a ranking session when convenient

→ GustiMei presents pairwise comparisons

→ user chooses one restaurant, declares a tie, skips, undoes, or exits

→ session completes or is suspended

→ user returns to the map

→ discovery continues

→ later visited additions cause the ranking invitation to reappear when ranking work is useful again.

The desired mental model is therefore not:

> Select restaurants → finish ranking → obtain recommendations.

It is:

> Keep using the map. Tell GustiMei where you have been. Occasionally help it update your ranking.

---

# 3. Application information architecture

The main authenticated product navigation should expose a small number of stable destinations:

### Discover

Primary/default destination.

Contains the full-screen map, location search, recommendation companion list, and restaurant inspection controls.

### My ranking

The user's private ranked list of visited places.

Also contains ranking-maintenance actions and any unresolved places.

### Reviews

Management of the user's public reviews.

### Account / Settings

Locale, public pseudonym, privacy/data controls, authentication and account management.

---

# 4. Discover — full-screen map

## 4.1 Purpose

The map is the primary environment for:

* discovering places;
* checking recommendation status;
* locating known restaurants;
* marking restaurants as visited;
* opening restaurant details;
* entering the ranking workflow when prompted.

It should maximize geographic context while keeping frequently used controls immediately available.

## 4.2 Layout

The map occupies essentially the entire usable viewport below or behind the application navigation.

Overlaid controls should be compact and avoid permanently obscuring significant map area.

The map includes:

1. **primary navigation**
2. **compact location search**
3. **compact collapsible recommendation list**
4. map attribution
5. optional ranking invitation
6. normal map controls where useful.

On narrow/mobile layouts, controls may use edge sheets or compact overlays rather than permanently visible panels.

---

# 5. Location search

The location search is intended principally to **move the map**.

It should:

* remain visually compact;
* accept explicit location searches;
* display a small set of candidate locations where necessary;
* move/zoom the map to the selected result.

---

# 6. Recommendation companion list

The recommendation list is an alternative and complementary representation of the recommendation overlay visible on the map.

It should be **collapsed or compact by default**, especially on smaller screens.

When expanded, it shows the recommendation order for the relevant visible area according to the already defined map/recommendation semantics.

The list should:

* remain synchronized with the map viewport;
* expose recommendation position clearly;
* distinguish visited places independently;
* distinguish recommended/ranked places from places for which no meaningful recommendation exists;
* permit keyboard-only use as an accessible alternative to marker interaction;
* allow selecting a restaurant to locate/highlight it on the map and open its preview.


---

# 7. Restaurant marker interaction

A restaurant marker can be:

* hovered with a pointer;
* tapped/clicked.

These actions open the same conceptual **restaurant preview**.

Pointer hover should be treated as an enhancement. Any information or action available on hover must also be accessible through click/tap and keyboard interaction.

---

# 8. Restaurant preview / map tooltip

The preview is an intermediate layer between the map and the full restaurant page.

It should contain only enough information and actions to support fast map-based decisions.

## Required information

* restaurant name;
* address and/or locality;
* link/action to open the full restaurant page;
* visited/unvisited state;
* recommendation state.

For recommended restaurants, indicate whether the restaurant belongs to the highlighted **top 10% of nearby recommendations**.

## Actions when unvisited

Primary contextual action:

**Mark as visited**

After activation:

* update the marker immediately when safely possible;
* update the preview to its visited state;
* update the ranking-invitation state;
* do not automatically force the user into ranking or review composition.

A lightweight acknowledgement may appear, but the user should be able to continue exploring immediately.

## Actions when visited

When the place has no current review:

**Write a review**

When the place has no current personal comment:

**Write a personal comment**

---

# 9. Marking a restaurant as visited

“Visited” should be one of the lowest-friction high-value interactions in GustiMei.

When the user activates **Mark as visited**:

1. persist visited membership;
2. update all visible representations of visited status;
3. recompute whether ranking work is now useful;
4. keep the user in their current discovery context.

Do **not** immediately open a ranking session.

Do **not** immediately open a review composer.

A new visited restaurant should normally feel like a small record-keeping action, not the beginning of a workflow.

Where the user already has a stable ranking, the existing ranking engine may internally prepare the place for later insertion, but the user should be free to accumulate more than one newly visited place before starting ranking work.

---

# 10. Ranking invitation

## 10.1 Purpose

GustiMei should make ranking discoverable without interrupting discovery.

The invitation appears when the system has useful ranking work available, especially when one or more visited places are not sufficiently positioned in the current ranking.

It should become more noticeable as pending work accumulates, but should not behave like an error, warning, or mandatory task.

## 10.2 Presentation

Possible manifestations include:

* notification badge on **My ranking**;
* small persistent chip/button over the map;
* compact banner;
* an item in the recommendation/list panel.

These may be combined carefully, but the interface should have **one dominant ranking CTA**, not several competing alerts.

Suggested semantic wording:

**3 places to rank**

or:

**Update your ranking**

rather than:

**Ranking incomplete**

The first frames the activity as available work; the latter implies that the user's data is defective.

## 10.3 Trigger

The ranking affordance may technically appear as soon as useful ranking work exists.

Its visual prominence should depend on factors such as:

* number of visited but unresolved/unplaced restaurants;
* existence of an interrupted ranking session;
* existence of a targeted repair request.

An interrupted session should generally take precedence:

**Continue ranking**

A contradiction requiring clarification may use:

**Review 2 comparisons**

Avoid exposing algorithmic concepts such as revisions, insertion sessions, repairs, or evidence graphs in normal consumer copy.

## 10.4 Dismissal

Ranking should normally be deferrable.

Dismissal hides the prominent prompt for the current context but does not discard pending work.

The persistent navigation badge may remain as a quiet reminder.

---

# 11. Ranking-session entry

Activating the ranking invitation opens the ranking experience.

If an open resumable session exists, resume it.

Otherwise determine the smallest appropriate ranking operation from the current ranking state:

* initial ordering;
* insertion of new places;
* resolution of unplaced places;
* targeted repair;
* wider rebuild only where required.

This decision is made by the ranking domain/engine and should generally be invisible to the user.

The user-facing concept is simply:

**Help update your ranking.**

---

# 12. Pairwise ranking page

## 12.1 Focus

The ranking page should deliberately remove most map/discovery complexity and become a focused comparison environment.

The principal question remains stable:

**Overall, which restaurant did you prefer?**

Two restaurants are displayed symmetrically.

Neither card should appear preselected or visually privileged.

## 12.2 Restaurant cards

Each card shows a deliberately comparable subset of information:

* name;
* locality;
* category-appropriate metadata already considered reliable;
* standard non-photo fallback where licensed imagery is absent;
* optional owner-only access to the user's private memory note.

Private comments remain collapsed initially so comment length cannot bias layout.

No recommendation position, public review count, review sentiment, or community score should appear during pairwise comparison.

## 12.3 Actions

Required actions:

* choose left restaurant;
* choose right restaurant;
* **Tie / About the same**;
* **Skip / Can't compare**;
* Undo previous choice;
* Leave / continue later.

Card click/tap may choose that restaurant, but explicit labeled controls must remain available.

Keyboard controls may accelerate interaction but must not be required.

## 12.4 Leaving

The user can leave a ranking session at any time.

Completed responses are persisted.

Returning to the map should therefore be a normal action, not presented as cancelling or abandoning the ranking.

---

# 13. Ranking progress

Progress should be shown as approximate where the algorithm cannot know the final question count precisely.

Prefer:

**About 6 comparisons left**

or a suitably qualified progress indicator.

Avoid a conventional deterministic “73% complete” indicator unless the engine can truthfully guarantee that interpretation.

The progress UI should communicate that every answer advances the ranking without pressuring the user to finish the entire session immediately.

---

# 14. Ranking completion

After publication of the successor ranking revision:

1. briefly confirm successful completion;
2. show the updated ranking or a compact summary;
3. provide a clear **Back to map** primary continuation;
4. optionally offer the already defined low-pressure review invitation where eligible.

The map should remain the natural destination after ranking.

Ranking completion should not feel like an end-state for the application.

---

# 15. Restaurant page

The restaurant page provides information that would overload the map preview.

## Core sections

### Identity and catalogue information

* name;
* address/locality;
* available relevant catalogue information;
* map/location context;
* OSM attribution where applicable.

### Personal state

For authenticated users:

* Visited / Not visited;
* action to mark visited;
* editable private personal comment where applicable;
* current relationship to the personal ranking where useful.
* the belonging to the top 10% of local, regional, national or worldwide recommendation list for the user (display only the widest scope information) if applicable

### Public reviews

Separate clearly labelled section containing public textual reviews and their required disclosures.

### Review action

If eligible:

**Write a review**

or:

**Manage your review**

Review controls remain independent from visited/ranking controls.

---

# 16. Review flow

From either the restaurant preview or restaurant page, the user can enter the existing place-scoped review composer.

When the review is committed successfully, return the user to the logical origin:

* map preview → map;
* restaurant page → restaurant page;
* review management → review management.

For the map-origin case, preserve as much of the map state as practicable:

* centre;
* zoom;
* selected restaurant;
* recommendation-list state.

Returning from reviewing should therefore feel like closing a temporary task rather than restarting discovery.

The public-review workflow must continue to use its independent eligibility, pseudonym, service-date, declaration, expiry and moderation contracts.

---

# 17. Personal ranking list

## 17.1 Purpose

The **My ranking** page is the durable representation of the user's own preferences, not the primary discovery screen.

It provides:

* the ranked list of visited restaurants;
* tied tiers;
* unresolved/unplaced places where applicable;
* filtered positions when locality filtering is active;
* maintenance controls.

## 17.2 Ranked list

Display clear ordinal positions.

Explicit ties share a position according to the established ranking semantics.

Unresolved items must not be shown as if they were tied.

Where some visited places still require ranking, display them in an explicit secondary section such as:

**Not placed yet**

rather than assigning provisional-looking numbers.

## 17.3 Main actions

Provide:

**Update ranking**

when pending work exists.

**Re-rank entire list**

as an explicit secondary/destructive-in-effort operation.

The latter should explain that it rebuilds the ordering but does not delete the user's visited places or private comments.

---

# 18. Navigation and state preservation

The user should be able to move freely among map, restaurant detail, review composition and ranking without repeatedly rebuilding context.

Especially preserve:

* map centre and zoom;
* selected category;
* recommendation-list expanded/collapsed state;
* selected restaurant where reasonable;
* active ranking session server-side;
* harmless unsent review text according to the existing scoped snapshot policy.

Do not preserve sensitive evidence, tokens, notifier details, or restricted moderation data in general browser state.

---

# 19. Mobile behavior

The same conceptual architecture should remain on mobile rather than switching to a fundamentally different application.

Recommended composition:

* map fills the viewport;
* navigation becomes compact;
* location search floats near the top (if praticable, make it collapsible to a single search icon);
* restaurant preview becomes a bottom sheet/popover;
* recommendation list expands as a bottom sheet;
* ranking invitation occupies a compact persistent location without obscuring map interaction.

Restaurant preview sheets should leave enough map visible to preserve geographic orientation.

Pairwise ranking may use the whole viewport because ranking is intentionally a focused task.

---

# 20. Interaction principles

Across all surfaces:

### Preserve context

Small actions such as marking a restaurant visited should not unexpectedly navigate away.

### Ask for effort at the right time

Do not force pairwise ranking immediately after every visited addition.

### Keep the map useful without ranking

Unranked and unsupported restaurants remain discoverable.

### Make recommendations distinguishable from judgments

Recommendation emphasis expresses predicted relevance to this user, not restaurant quality.

### Keep ranking private

Nothing about the ranking UI should resemble publishing, reviewing or voting publicly on restaurants.

### Keep reviews optional and separate

Review creation must always feel like an independent public-content action.

### Prefer resumability to completion pressure

Ranking is maintenance work that can be resumed.

### Never hide uncertainty

Skipped/unresolved places should visibly remain unresolved rather than receiving invented positions.

---

# 21. Suggested primary-screen hierarchy

For the ordinary returning restaurant user, the ideal hierarchy is:

**1. Map / discovery**

What can I explore around here?

**2. Restaurant preview**

What is this place, and have I been there?

**3. Visited action**

Record something I already know about my experience.

**4. Recommendation indication**

How relevant might it be to me?

**5. Ranking invitation**

GustiMei has enough new experience to improve my ranking.

**6. Ranking session**

A temporary focused task.

**7. Personal ranking**

A durable private result that I inspect or maintain when desired.

**8. Reviews**

Optional public expression, reachable from the place but not part of the ranking loop.

---

# 22. Revised canonical user journey

A mature GustiMei session should therefore look like this:

**Open GustiMei**

→ map appears immediately

→ move/search map

→ inspect restaurant

→ mark visited

→ continue exploring

→ mark another visited

→ ranking badge changes from 0 to 2

→ continue using map or choose **Rank 2 places**

→ answer a small number of comparisons

→ ranking revision publishes

→ **Back to map**

→ recommendations now reflect the improved ranking

→ days or weeks later, add another visited restaurant

→ ranking invitation quietly reappears

→ repeat.

This loop should become the central UX identity of GustiMei.
