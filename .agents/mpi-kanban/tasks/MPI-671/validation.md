# MPI-671 validation

Run against an isolated instance (`npm run app:isolated`, port 56204, agent
profile) driving the real renderer through `playwright-cli`, into a throwaway
project `MPI-671 probe`, since deleted. The user's app on :3000 was not touched.

## The card appears on drop and is replaced on completion — PASSED

A real `drop` event carrying a real `File` was dispatched at the gallery's
`.mpi-media-drop-overlay`, so the whole `onDrop` → `uploadMediaFile` →
`media:import-started` path ran. The grid was sampled every 200 ms:

```
t0     ["imported_004", "imported_003", "imported_002", "imported_001"]
t200   ["final_probe[BUSY][SPIN]", "imported_004", …]      <- placeholder
t1600  ["imported_005", "imported_004", …]                 <- real card, placeholder gone
```

- The placeholder is up **within 200 ms** of the drop, named from the dropped
  file, at the head of the grid.
- `[BUSY]` = `mpi-group-card--generating`, `[SPIN]` = the spinner is displayed.
  Only the placeholder carries `[BUSY]`; the finished cards do not.
- It is replaced by the finished card (`imported_005`) with no intermediate
  state — the service settles in a `finally` and the caller emits
  `media:imported` on the next microtask, so both `setGroups` calls drain before
  the frame paints.

Playwright's `drop` command could not be used directly: the overlay is hidden
until a `window` `dragenter` fires, and a file drop from the CLI never fires
one, so `locator.drop` times out on the actionability check. Dispatching the
event at the same element runs the identical handler.

## The visual — a spinner, not the mascot

First implementation reused `setGenerating`, and the placeholder rendered the
**generation mascot**: `setGenerating` does `spinner.style.display = 'none'`
with the comment *"Mascot replaces the spinner as the waiting indicator."*
Correct for a generation, wrong here — the mascot means a model is cooking
something, and an import is a file copy plus a transcode.

Added `cardEl.setImporting()` as its twin: same in-progress card, mascot
suppressed, spinner shown. Screenshot of a held placeholder confirms the pink
spinner ring on a blank card at the head of the grid, no mascot.

## Static checks

- `npx eslint` on all four changed files — exit 0, `--max-warnings=0`.
- `npm test` → **831 pass, 0 fail**.

## Not verified by an agent

The same limit as MPI-670: a real OS drag-drop, in the user's own app, of a file
big enough that the spinner is up for a while. Everything above used a
synthesised drop event in a different client. The mechanism is proven; what is
unproven is that it feels right at 26+ seconds on a real drag.
