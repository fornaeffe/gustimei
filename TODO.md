- There is too much difference between different font sizes: large titles are too large compared to smallest text. Keep a small number of typography sizes and reduce the size of largest ones.
- Extend the reusable section-local `FormFeedback` pattern from review case/moderation forms to the remaining app forms so error, success, and warning feedback is consistently adjacent to the action that produced it.
- Form feedback when reporting a review should explain clearly which field is problematic and why, when rejecting a notice.

## Manual ranking placement UX

- [x] Keep traditional press-drag-release behavior separate from click/tap pick-up mode. A native drag now enters dedicated drag state only after the browser recognizes pointer movement; only an un-dragged handle activation enters click/tap mode.
- [x] Fix click/tap mode becoming unresponsive to later handle clicks after a completed placement unless the page is reloaded.
- [x] Dismiss click/tap mode automatically after a successful placement. Keep cancellation attached to the picked-up item and make clear that it cancels only an ongoing move.
- [x] Improve click/tap-mode visual feedback without changing scroll position or list height on pick-up:
  - [x] Keep inactive between-tier drop areas at zero height and reveal only the highlighted target.
  - [x] Render the picked-up restaurant as an otherwise identical but non-interactive ranked-place card, initially aligned with its source and animated slightly right into its picked-up position; leave only its move handle active.
  - [x] Select the drop target at the picked-up card's height rather than the viewport center.
  - [x] Consider both between-tier and into-tier targets when selecting by height, keep non-selected targets at zero height, and use one click on the picked-up handle to place into either target type.
