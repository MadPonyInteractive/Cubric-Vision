# MPI-487 — validation

**Change:** `_tileState` in `js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js`
now returns `.mpi-tile__chip--partial` (`N% ON DISK`) for a partial-on-disk model instead of the
`.mpi-tile__prog` bar an active download draws. `_computePartial` itself is untouched — both
numbers are still computed, only the static one stopped wearing the moving one's costume.
The chip class already existed in `MpiTileSheet.css` (frost + `◑`) and was dead until now, so
the diff is 1 line of markup + 0 lines of CSS.

## Evidence — live, against the real app during the MPI-467 smoke fill (2026-08-08)

Read-only browser tab on :3000 (the user's Electron window was not touched; no Install/Cancel
clicked; the only server call was `GET /comfy/downloads/active`).

1. **The reported screen, fixed.** All four partials render chips, no bars:
   `Qwen Image Edit → 98% ON DISK`, `MiniMax H3 → 63% ON DISK`,
   `MiniMax H3 Reference → 59% ON DISK`, `Wan 2.2 5B → 99% ON DISK`
   — each `class="mpi-tile__chip mpi-tile__chip--partial"`. Screenshot shows them sitting in the
   same row position as `↓ INSTALL` / `✓ INSTALLED`, so the grid reads as four states, not four installs.
2. **The contrast, in one screen.** Injecting a client-side job for `qwen-edit`
   (`state.downloadJobs = [{status:'downloading', progress:0.62}]`, no server contact) put that
   ONE tile back on `.mpi-tile__prog` at `62%` while MiniMax H3 and Wan 2.2 5B stayed chips.
   A bar in the Library now means exactly one thing.
3. `npm test` → 508/508 pass. `eslint` on the changed file → clean. No test asserted the old
   markup (grepped `mpi-tile__prog` / `hasPartialProgress` across `tests/`), so nothing was
   loosened to make this pass.

## Adjacent gap found while verifying — NOT fixed here (see MPI-489)

The browser tab showed `MiniMax H3 → 63% ON DISK` while `GET /comfy/downloads/active` reported
that same model `status: "downloading"`. That tab's `state.downloadJobs` was empty: nothing
subscribes the SSE stream except `downloadService._start()` (i.e. a client that *itself* clicked
Install) and `MpiEngineInstall`. A client that did not start the download never connects, never
receives the `download:snapshot`, and so cannot draw the live bar at all. Pre-existing and
orthogonal to this card — but this change makes it *visible* (before, the partial bar happened to
look like the download it was not).
