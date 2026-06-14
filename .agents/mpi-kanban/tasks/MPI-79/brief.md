# MPI-79 Brief — Stop slide container from closing on click-away / pop-up open

## Problem
The app's slide containers (the right-hand slide-over panels) — **Settings, Queue, About, Hotkeys** — all
close when the user clicks away OR when any child pop-up/modal opens. This is annoying: e.g. opening an
MpiOkCancel confirm or an error dialog from inside Settings closes Settings underneath it. Same component
drives all these panels, so this is ONE fix applied to the shared slide-container, not four separate bugs.

## Root cause (already diagnosed during MPI-64, 2026-06-11)
The slide-over subscribes to the `ui:close-all-popups` event. `OverlayManager.request` fires
`ui:close-all-popups` on EVERY modal open → so any pop-up (MpiOkCancel / `showError` / etc.) closes the
slide-over along with it. Click-away closes ride the same path.

## Fix options (from the MPI-64 backlog note)
- **Option A (correct, touches global):** register the slide-over on the overlay stack via `Overlays.request`
  and DROP the `ui:close-all-popups` subscription, so child modals stack ON TOP of the slide-over instead of
  closing it.
- **Option B (targeted):** add an "ignore close-all while a child modal is open" flag on the slide container,
  so a child pop-up doesn't take the panel down with it.

## GOTCHA (do not skip)
Escape-close currently rides the **empty-stack close-all path** — so you CANNOT simply delete the
`ui:close-all-popups` subscription, or Escape-to-close + click-away-to-close break. The fix must preserve:
- Escape closes the panel (when no child modal is open),
- click-outside-the-panel closes the panel (intentional),
while STOPPING a child pop-up open from closing the panel.

## Scope
Apply to the shared slide-container component so it covers Settings + Queue + About + Hotkeys in one change.
Verify each of the four panels: open the panel → open a child pop-up/modal → the panel STAYS open underneath;
press Escape / click the backdrop → the panel closes as before.

## Provenance
Generalized from the MPI-64 backlog item "Settings slide-over closes on any pop-up open"
(MPI-64 OPEN-ITEMS.md §H3, plan.md L105, events.jsonl 2026-06-11). User promoted it to its own card 2026-06-14
because it's the same component across all four panels. To be worked in a separate parallel session.
