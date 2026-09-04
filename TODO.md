## Manual ranking placement UX

- [x] Keep traditional press-drag-release behavior separate from click/tap pick-up mode. A native drag now enters dedicated drag state only after the browser recognizes pointer movement; only an un-dragged handle activation enters click/tap mode.
- [x] Fix click/tap mode becoming unresponsive to later handle clicks after a completed placement unless the page is reloaded.
- [x] Dismiss click/tap mode automatically after a successful placement. Keep cancellation attached to the picked-up item and make clear that it cancels only an ongoing move.
- [x] Improve click/tap-mode visual feedback without changing scroll position or list height on pick-up:
  - [x] Keep inactive between-tier drop areas at zero height and reveal only the highlighted target.
  - [x] Render the picked-up restaurant as an otherwise identical but non-interactive ranked-place card, initially aligned with its source and animated slightly right into its picked-up position; leave only its move handle active.
  - [x] Select the drop target at the picked-up card's height rather than the viewport center.
  - [x] Consider both between-tier and into-tier targets when selecting by height, keep non-selected targets at zero height, and use one click on the picked-up handle to place into either target type.
  - [x] Let a click or tap anywhere on the picked-up card confirm placement, except for its cancel control, and hide the cloned up/down actions while placement is pending.
