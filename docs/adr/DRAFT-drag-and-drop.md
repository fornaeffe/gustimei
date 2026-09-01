THIS IS A DRAFT. DO NOT TAKE IT AS SETTLED ARCHITECTURAL DECISION RECORD. DO NOT CONSIDER FOR IMPLEMENTATION WHILE IT IS IN DRAFT STATE.

# 18. Explicit list reordering

Direct manipulation of the personal ranking could be highly useful, particularly once lists become long, but it needs a strict domain boundary.

## 18.1 Compatibility with the current ranking engine

The current ranking architecture stores direct pairwise/tie/skip evidence and derives immutable ranking revisions from it.

A drag-and-drop operation expresses a different kind of user statement:

> “Place this restaurant here in my ordering.”

It therefore **must not simply be converted behind the scenes into fabricated pairwise answers**.

For example, moving restaurant D above A might mathematically imply:

D > A, D > B, D > C

but the user did not explicitly answer those three comparison questions.

Consequently, immediate arbitrary reordering is **not fully compatible with the current evidence model without an explicit extension**.

Before implementing it, choose one of two domain designs.

### Preferred long-term design: first-class manual placement evidence

Extend the ranking domain with an explicit operation such as a `manual_move` / direct-placement fact.

The ranking engine can then create a successor revision from this direct statement while retaining provenance distinguishing:

* pairwise choices;
* explicit ties;
* skips;
* direct list placements.

Contradictions with existing explicit evidence can invoke targeted repair rather than silently rewriting historical answers.

This gives drag-and-drop its natural UX semantics.

### MVP-compatible fallback

If the evidence model is not extended, selecting a new location in the list should launch the existing targeted insertion/move ranking process.

The chosen drop position can serve as a hint or target boundary, but the system asks the minimum comparisons necessary to establish a valid new position.

In this design the operation should not visually pretend that the item has already been committed.

---

# 19. Reordering interaction model

If first-class explicit reordering is implemented, support **both conventional drag-and-drop and click/tap pick-up mode**.

This is not merely an enhancement. WCAG 2.2 requires functionality relying on dragging to have a single-pointer alternative. The proposed click/tap mechanism is therefore a particularly appropriate design direction.

## 19.1 Conventional pointer drag

1. Pointer down on drag handle.
2. Item enters picked-up state.
3. Pointer movement moves the item/drag representation.
4. Candidate insertion location is highlighted.
5. Pointer release commits the move.

Dragging should start only from the dedicated handle, not from the whole restaurant row, so ordinary row interaction remains predictable.

## 19.2 Click/tap pick-up mode

First click/tap on the drag handle:

* item enters **picked-up** state;
* a floating representation appears in a fixed screen position;
* the original list remains visible;
* the nearest/current insertion boundary is highlighted.

While picked up:

* user scrolls normally;
* floating item stays fixed relative to the viewport;
* highlighted insertion boundary updates as the underlying list moves.

Second click/tap on the floating item's handle:

* item is placed at the currently highlighted boundary;
* picked-up state ends;
* focus follows the moved item;
* an accessible status message confirms the new position.

This directly provides a non-dragging pointer alternative, consistent with WCAG 2.2's requirement that drag functionality be achievable without a dragging movement.

## 19.3 Cancel

While picked up:

* Escape on keyboard cancels;
* an explicit **Cancel move** control is available for pointer/touch users.

The item returns to its original position.

## 19.4 Scrolling

Picking up an item must never lock normal page scrolling.

This is particularly important for touch users moving an item across a long list.

Auto-scroll near viewport edges may be added to conventional dragging, but the click/tap mode must not depend on it.

---

# 20. Keyboard list reordering

Keyboard reordering should be designed as a first-class interaction rather than attempting to simulate pointer dragging.

Recommended behavior:

* focus restaurant row or move handle;
* activate **Move**;
* use Up/Down arrows to move the prospective insertion point;
* Home/End optionally move toward extremes;
* Enter/Space confirms;
* Escape cancels.

Alternatively, explicit **Move up / Move down** actions may supplement this interaction.

After movement, announce the resulting position through an appropriate live region.

WAI's rearrangeable-list examples similarly retain focus on the moved option and announce completed movement; this is preferable to losing focus after DOM reordering.

Do not place complex interactive restaurant-card content inside an ARIA `listbox` merely to copy the APG example: listbox options have semantic limitations for nested interactive content. Native lists plus appropriately labelled buttons may be the better structure for GustiMei.

---

# 21. Reordering visual state

A picked-up item should be unmistakable without relying solely on colour.

Use a combination of:

* elevation/outline;
* slight spatial displacement;
* move icon/handle state;
* text accessible to assistive technologies.

Potential insertion boundaries should be displayed **between** list rows rather than highlighting another restaurant as though it were the target.

For example:

Restaurant 4

──────── Drop here ────────

Restaurant 5

This better communicates that the operation changes ordinal position rather than replacing or grouping an item.

Pointer targets should comfortably exceed WCAG 2.2's 24×24 CSS-pixel minimum; for primary touch interactions GustiMei should generally aim larger than that minimum.

---

# 22. Ties and manual reordering

The reordering UX must account for equivalence tiers explicitly.

Possible drop locations include:

* before a tier;
* after a tier;
* potentially **into a tied tier**.

Dropping into an existing tied tier should not silently assert equality unless the UI clearly exposes that meaning.

Prefer either:

* a dedicated **Make equal with these** target; or
* after dropping onto a tier, ask whether the moved restaurant is approximately equal to that tier or should be placed immediately above/below it.

Never destroy an existing tied tier merely because another item was moved through it.