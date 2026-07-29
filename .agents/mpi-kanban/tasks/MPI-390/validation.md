# MPI-390 Validation

Status: **DONE — user-verified in the app 2026-07-30.**

## What shipped

| # | File | Change |
|---|---|---|
| 1 | `js/core/storage.js` | `skipLocalEngine: false` in `DEFAULT_RUNPOD_CONFIG` **and** in `normalizeRunpodConfig` |
| 2 | `js/shell.js` | `else if (runpodCfg.skipLocalEngine)` boot branch; the gate promise now resolves on `engine:ready` **or** `engine:install-skipped` |
| 3 | `MpiEngineInstall.js` | Setup-phase hatch + RunPod video link; `docsLink` wiring generalised `qs` → `qsa` to cover both links with one handler |
| 4 | `MpiEngineInstall.css` | `.mpi-engine-install__hatch*` BEM block |
| 5 | `MpiRunpodSettings.js` | "Skip the local engine install" plate + switch, mirroring the auto-connect pattern |
| 6 | `js/services/engineGate.js` | New — the shared `hasNoEngine()` / `blockedByNoEngine()` ladder |
| 7 | `js/shell/projectUI.js` | Gate on both project-entry paths |
| 8 | `js/shell.js` (again) | Gate on `models:open` + `apps:open`; new `engine:install-request` handler |
| 9 | `tests/runpod-skip-local-engine.test.cjs` | New — 4 cases |

## The no-engine gate

Skipping the local install makes "no engine at all" reachable. Dispatch falls to
local when no Pod is connected (`forceLocal ? 'local' : isRemote() ? 'remote' :
'local'`), so every graph op — generate, SAM3 masking, upscale, right-click
Describe — would die on the `routes/comfy.js:343` guard with *"Provision engine
first"*, the opposite of the advice a deliberate skipper needs.

**Gated at the three doors out of the landing page** — open a project, open the
Model Library, open the App Library.

The fine-grained alternative (gate the things that fail, not the doors) was
costed out with the user and rejected: it needs a guard on Gallery card open,
App Generate, PromptBox Run, right-click Describe, and one more for every tool
added later. Five and growing, each one a chance to miss one. Three doors cannot
be forgotten.

Gating entry costs the user nothing, because **"Open in file system" lives on the
landing-page project right-click** — every image and video stays reachable
without opening a project at all. (An earlier draft gated only card-open and App
submit on the theory that browsing should stay free; the file-system entry point
is what makes that unnecessary.)

`models:open` and `apps:open` are gated on the **listener** in `shell.js`, not on
the landing-nav emitters, so the Gallery radial's emitters are covered by the
same check. Apps matter specifically because they have no PromptBox — just a
Generate button — so nothing inside them would surface the no-engine state. They
are dev-gated today; the gate belongs there before that changes.

Ladder, cheapest-first so the common path does no I/O:
1. `skipLocalEngine` off → the boot gate guaranteed an engine. Allow.
2. Pod connected → routes remote. Allow.
3. A local engine exists anyway (the user toggled the skip ON while already
   having one — the skip means "don't install", not "don't use"). Allow.
4. Otherwise block, naming both ways out.

Fails OPEN on a version-check error: trapping a user on the landing page because
a health check hiccuped is worse than the engine error they would have met anyway.

Sweep: `openProject(` has exactly two live call sites (create dialog, project
row); both gated. `MpiProjectCard.js:35` is a JSDoc example, and drag-drop
`addProjectByFolder` only adds to the grid without opening. `forceLocal` is never
structural — its only source is the user's own PromptBox local override, shown
only during a remote session — so nothing is local-only by design.

## Turning the skip back OFF re-arms immediately

A toggle that appears to do nothing until you restart is a toggle users do not
trust. So switching "Skip the local engine install" OFF emits
`engine:install-request`; shell re-runs the version check and shows the same
install modal the boot gate uses — hatch and all. Press Skip on it and
`skipLocalEngine` goes straight back to true, with the Settings switch following
it back ON via an `engine:install-skipped` listener.

Trap: the modal only **emits** `engine:ready` (`MpiEngineInstall.js:578`); it
never hides itself. The boot gate did that, and its listeners unsubscribed once
boot finished — so this post-boot path wires its own close for both outcomes
(`engine:ready` and `engine:install-skipped`). Without that the modal would
install successfully and then sit there forever.

## Two traps found during implementation that the brief did not name

**1. `normalizeRunpodConfig` is a WHITELIST, and it runs on read AND write.**
`js/core/storage.js:104-120` rebuilds the config field by field. Adding
`skipLocalEngine` to `DEFAULT_RUNPOD_CONFIG` alone would have been silently
stripped on every save and every load — the hatch would appear to work and then
forget itself on the next boot, with no error anywhere. Same failure class as
MPI-370's `requirementsDrop` vanishing through the `_createDepJob` whitelist.
This is what the new test exists to pin.

**2. The boot gate is an `await new Promise` resolved ONLY by `engine:ready`**
(`js/shell.js:268-274`). Hiding the modal would have hung boot forever behind a
gate no longer on screen. The hatch emits `engine:install-skipped` instead of
faking `engine:ready`, because the engine genuinely is not ready and
`engine:ready` consumers (comfy controller, status bar) must not be told it is.

**3. The hatch writes through `state.runpodConfig`, not `Storage.setRunpodConfig`.**
`state.runpodConfig` is seeded once at module load (`js/state.js:164`) and
write-throughs to Storage (`js/state.js:245`). A raw Storage write would have
left state stale, so Settings would have rendered the new toggle OFF and the
next state write would have clobbered the flag.

## Deliberate non-implementation

The hatch does NOT auto-open the Settings slide-over. First launch — exactly when
`needsInstall` is true — also runs the 18+ maturity gate and the changelog
overlay, and navigation calls `Overlays.reset()` (`js/shell.js:305-311`).
Auto-opening a slide-over into that chain would either be wiped or stack two
near-opaque backdrops, which is the MPI-333 black-slab bug. The destination is
named in the button copy instead ("Skip this — set up RunPod in Settings"), which
needs no new import into a boot-critical modal.

## Evidence — automated (done)

- `node --check` clean on all 5 changed JS files.
- `npx eslint` clean on all 5.
- Full suite: **279 tests, 279 pass, 0 fail** (275 pre-existing + 4 new). The
  275 baseline is the MPI-389 green baseline, so any red would be a real
  regression.
- **Negative control run on the new test**: commenting out the single
  `skipLocalEngine` line in `normalizeRunpodConfig` fails all 4 cases; restoring
  it passes all 4. The test has teeth — it is not passing trivially.

## Evidence — in-app (DONE, user-verified 2026-07-30)

Run against a forced fresh-install state. `CUBRIC_ENGINE_ROOT` pointed at an
empty folder makes `.mpi_engine_version` absent, so `/engine/version-check`
returns `needsInstall: true` and the real modal comes up — without touching the
installed engine, and without moving the model weights (which live under
`<engine>/mpi_models` by default, so moving the engine folder aside would have
moved GBs of weights with it). The user's models root is set explicitly to
`G:\CubricModels`, so it was unaffected either way.

1. Install modal shows the hatch under the Install button, with the video link;
   the link opens `https://youtu.be/drpZOrMDEq8` in the real BROWSER, not an
   in-app window.
2. Clicking the hatch dismisses the modal and boot completes to the landing page.
3. Settings → RunPod shows the panel (the hatch sets `enabled: true`) with
   "Skip the local engine install" ON.
4. RunPod connects and generates with **no local engine installed** — the card's
   first acceptance criterion, and the only one that proves the point.
5. Relaunch: no install gate.
6. Toggle "Skip the local engine install" OFF → relaunch → the install gate is
   back.
7. Project entry gate: with the skip ON and NO Pod connected, clicking a project
   row (and "+ New project") warns instead of opening. Connect a Pod → both work
   again. With the skip OFF, entry is untouched — step 1 of the gate returns
   before any I/O.

Video link: the DIRECT YouTube URL (`https://youtu.be/drpZOrMDEq8`, "No GPU? No
Problem"), not the docs anchor. The user's call — the docs anchor landed on a
section holding three videos, and this video's description already carries the
rest of the docs links.
