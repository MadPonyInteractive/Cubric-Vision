# MPI-587 Validation

**Verify mode:** user-ux — **CONFIRMED BY FABIO IN THE APP, 2026-08-21.** He ran the in-app check
below and accepted it ("1"). That closes the card: the WRITE half (`_persistResult` firing from a
real completion, from the surface toggle, and from the `_run` reset) is exercised only by a real
run, and his run is the evidence for it.

## Automated evidence (run 2026-08-20, PASSED)

- `npm test` → **655 passed, 0 failed**.
- `npx eslint js/state.js js/components/types.js js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js`
  → clean.

## Live probe on an isolated instance (PASSED)

Own app instance (`node scripts/launch-instance.mjs`, agent profile, port 50449 — the user's
:3000 untouched), driven with `playwright-cli`. A generation was NOT run; instead
`state.s_flowResults['character-sheet']` was seeded directly, which exercises the whole
seed → probe → replay half against the real component.

**1. A remembered result is restored on a fresh instance.** Seeded a snapshot pointing at a real
file, emitted `flow:open` (which destroys and remounts the flow — the exact reopen boundary),
navigated to the run slide:

```json
{"hasPane":true,
 "imgSrc":"/project-file?path=C%3A%2F…%2Fmascot-greet.png",
 "imgNaturalW":2000,
 "noteHidden":false,
 "status":"Done - saved to your gallery.",
 "emptyHidden":true}
```

`naturalWidth: 2000` — the image DECODED, not just an element with a src. The pending note and
the status line came back with it.

**2. A dead path falls back to the empty pane, and forgets itself.** Same seed with a filePath
that does not exist, reopened:

```json
{"mediaCount":0,"emptyHidden":false,"noteHidden":true,"status":"",
 "persisted":"null (forgotten)"}
```

Zero media elements — no broken image painted — the empty state visible, the note and status
cleared, and the stale entry dropped from `state.s_flowResults`. The console shows the single
`404 /project-file?…DELETED-BY-USER.png`, which IS the probe working.

## What Fabio's run proved (2026-08-21)

The probe seeded state by hand, so it exercised the READ half. The WRITE half — `_persistResult()`
firing from `_showResults`'s remember branch on a real completion, from the surface toggle, and
from the reset at the top of `_run` — could not be executed without a real generation. Fabio ran
one and confirmed all five steps below.

## In-app check (PASSED — Fabio, 2026-08-21)

1. Open a Flow, fill it, Generate, wait for "Done — saved to your gallery."
2. Close the Flow. Reopen it → the result is on screen, on the same surface, with the pending
   note and a "Generate again" button.
3. Toggle compare↔player, close, reopen → back on the surface you chose.
4. Delete that result from the gallery, reopen → empty pane, no broken image.
5. Start a new run → the old result drops the moment the run starts.
