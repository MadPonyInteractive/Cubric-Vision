# MPI-236 Validation

## What was verified (live, by user)

Two reload+install passes in the running Electron app (RunPod remote-connected, Wan 2.2 5B then Wan 2.2 Smooth):

- **Pass 1 (per-dep-complete gate only):** grid re-drew ~3× at start + once at verify. Better, but full rebuilds remained.
- **Pass 2 (after `download:started`/`_install` → `_patchTile`):** only a single small flash on the progress bar when the button was pressed, then one more right after — no repeated whole-grid redraws through the download. User: "This is great already… This is done."

## Expected steady state (confirmed screenshot, pass before the tile-patch change)
- Ends on **Uninstall** button + "N installed" count + "Download complete" toast — correct terminal state was never broken; only the mid-install churn was.

## Remaining (out of scope, correct behaviour)
- One full `renderList()` at `download:complete` — the model genuinely moves Available → Installed section, which needs a re-layout. Not a bug.

## Not fixed here (separate issue)
- `/remote/ws-token` 503 (remote event channel unavailable) — unrelated to the flash; the install ran via the download SSE stream and succeeded. Left for a future card if it recurs.
