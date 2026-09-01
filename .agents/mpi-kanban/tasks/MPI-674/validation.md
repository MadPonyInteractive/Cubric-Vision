# MPI-674 Validation

**Closed 2026-09-01 on Fabio's word**, after he read the rendered Settings row in his
own app and the copy was rewritten on his call. MPI-674 also owns MPI-673's dialog copy
from this point — see "The copy carries no internal identifiers" below.

Phase 2 of **MPI-672** (issue #2). Implemented 2026-09-01.

## The brief asked for something that cannot work

The brief says: make `checkUniversalWorkflowDepsStatus()` import-aware so the boot
repair at `js/shell.js:335` fires. **That gate cannot ever see import state, and no
change to that function can give it one.**

Measured, not reasoned: `_bootApp()` (`js/shell.js:249`) fetches `/engine/version-check`,
then `/engine/deps-status` at line 335, and only reaches the ComfyUI auto-start at
**line 541** — inside the same function, after the gate. There is no engine process in
existence when `deps-status` answers. Import failure is a property of a *running*
engine, so a disk check running before any engine starts is not merely inaccurate
there, it is asking a question that has no answer yet.

So `checkUniversalWorkflowDepsStatus` is left alone, and it is correct as it stands:
it answers "is a folder missing or at the wrong commit", both of which ARE repairable
by `_installOutstandingUwDeps` reinstalling folders. Import health is a second,
genuinely different question, and it is answered where the engine exists — which is
also where MPI-673 already built a channel for exactly this verdict.

## What shipped

| File | Change |
|---|---|
| `routes/comfy.js` | `_scanForImportFailures()` — reads the engine's own stdout for the packs it could not import, with a carry so a chunk boundary cannot drop one; `_importFailureWarning()`; the scan runs on the RAW chunk before the existing trim; `/comfy/status` folds it into `depsWarning`; the fresh-start reset clears both the list and the carry |
| `routes/shared.js` | `processState.comfyImportFailures` |
| `routes/engine.js` | `POST /engine/repair-python-deps` — removes the curated-deps marker, THEN stops the engine |
| `js/services/comfyController.js` | `repairPythonDeps()` (idle guard → repair → 2s → `ensureServerRunning`); `DEPS_BROKEN_MESSAGE` now names the repair |
| `js/services/commandExecutor.js` | the mirrored dialog title, retitled with the other |
| `js/components/.../MpiSettings.js` | "Engine health" section — hidden unless `state.comfyDepsWarning`, with a Repair engine button |

### The copy carries no internal identifiers (user call, 2026-09-01)

Shipped first as: a plate that rendered `state.comfyDepsWarning` verbatim
(`custom node packs failed to import: RES4LYF, comfyui-videohelpersuite`) under a
description naming Python packages and custom nodes. Fabio, on seeing it in his own app:
*"a user should not be prompted with model names or anything like that. That's geeky
stuff that is for us. This is an artist app, not a geek app."*

Rewritten on that rule, and the rule read wider than the names — our vocabulary for the
machinery is the same problem:

| Surface | Now |
|---|---|
| Dialog title (both sites) | **Part of the engine did not install** |
| Dialog body | *Part of the local engine did not install, so some models will fail to generate.* / *Open Settings and press "Repair engine" under Engine health. It reinstalls the missing part and restarts the engine — a few minutes, and your models are untouched.* / *If it keeps failing, check your internet connection or proxy, then use "Show log file" below and send us the log.* |
| Settings row | **Part of the engine did not install** — *Some models will fail to generate until this is repaired. Repairing takes a few minutes and your models are untouched.* No reason line at all. |

`state.comfyDepsWarning` is now a **condition** for the UI and never its content. The
packs are not lost: `_scanForImportFailures` logs each one and `_noteDepsWarning` logs
the whole reason, so `app.log` — which "Show log file" reaches and MPI-675 made sendable
— still carries everything needed to diagnose it.

Guarded at both ends so it cannot come back: the unit suite asserts a jargon list against
the `DEPS_BROKEN_MESSAGE` constant and that `mpiSettingsEngineHealthReason` no longer
exists; the desktop spec asserts the same list against the rendered section's whole
`textContent`, so moving an identifier into a different element does not dodge it.

Recorded as a standing rule in
`~/.claude/projects/C--AI-Mpi-Cubric-Vision/memory/feedback_no_internal_identifiers_in_user_copy.md`.

### Why not the `/object_info` class diff

The brief proposes diffing the `class_type`s in `comfy_workflows/*.json` against what
`/object_info` registered. That **false-positives on a healthy engine**: a workflow for
a model the user has never installed legitimately names classes from a node pack that is
not on disk, so the diff reports a hole that is simply an uninstalled model.

The engine states the fact directly instead. ComfyUI prints, per failed pack, both
`Cannot import <path> module for custom nodes: <reason>` and an `(IMPORT FAILED): <path>`
row in its import-times summary. A pack that was never installed is never imported and
prints neither, so the signal is exactly the packs that *should* have loaded. It also
names them, which the class diff cannot.

### Why the marker removal is the load-bearing half of the repair

`ensureCuratedPythonDeps()` skips its whole pass when its marker matches the hash of
`python_deps.txt`. The reporter's case stamped no marker (the pass failed), so for them a
fresh start alone would retry. But the same broken end state is reachable with a marker
*present* — a pass that succeeded once, then packages lost afterwards — and in that state
every subsequent start reports a clean install and changes nothing, for ever. Removing
the marker is what makes the retry possible at all; stopping the engine is what makes the
next start a fresh one, since the pass runs inside `/comfy/start` with the engine down
(MPI-459).

## Evidence

- **`node --test tests/engine-import-failure.test.cjs` → 10/10 pass.** Both line forms
  recognised by folder name; a healthy boot records nothing; a pack reported twice is
  recorded once; a line split across a chunk boundary is still caught; an unterminated
  line is not matched until its newline arrives; `/comfy/status` reports import failures
  through `depsWarning` and the pip reason wins when both are present; an attached engine
  answers unknown rather than healthy; the fresh-start reset clears list and carry; the
  repair clears the marker *before* stopping the engine; the dialog names the repair.
- **`npm test` → 853/853 pass.** (840 before this card; +10 new, the rest from a peer
  session's uncommitted `inject-params-titles.test.cjs`.)
- **`npm run lint` → clean.**
- **The real reproduction harness.** The shipped scanner was fed both of
  `D:\tmp\cu126-repro`'s actual boot logs, streamed at **1, 7, 64 and 4096-byte chunks
  and whole-file** — a 1-byte stream being every possible line split at once:

  | Log | Result |
  |---|---|
  | `comfy-nodeps.log` (3 curated packages removed) | **5 packs, at every chunking**: `comfyui_controlnet_aux`, `comfyui-impact-pack`, `ComfyUI-Impact-Subpack`, `RES4LYF`, `comfyui-videohelpersuite` — exactly the 5 the umbrella measured |
  | `comfy-boot.log` (healthy) | **silent, at every chunking** — no false positive |

- **`npx playwright test --config=playwright.desktop.config.js tests/desktop/engine-repair-reachable.spec.js tests/desktop/deps-warning-blocks-generation.spec.js` → 2 passed (6.6s).**
  The new spec mounts the real Settings component on a real Electron shell and proves:
  the section is present but hidden on a healthy engine; shown on a degraded one; the
  button reads "Repair engine"; pressing it POSTs `/engine/repair-python-deps` exactly
  once and leaves the button disabled and reading "Repairing…"; and the rendered section
  contains none of `RES4LYF`, `videohelpersuite`, `custom node`, `Python`, `pip`,
  `import`. MPI-673's spec is re-run alongside because this card changed the title and
  body it asserts on.
- **Seen in the user's own app, twice.** Fabio set `state.comfyDepsWarning` by hand,
  opened Settings and read the row — which is how the identifier leak was caught. He did
  not press the button (the route is new, so a running app 404s it, and on a restarted
  one it would have cost him a real pip pass).

## Not verified here

**The live end-to-end repair was not run**: a real `repairPythonDeps()` deletes the
marker next to the user's engine interpreter and costs them a full multi-minute pip pass
on their next start, on a shared tree with peer sessions live. The route is unit-pinned
(including the marker-before-stop ordering), the button-to-route leg is proven on a real
Electron shell, and the sequence it drives — stop, wait 2s, `ensureServerRunning` — is
the same one `js/shell/navigation.js` `_restartEngine` has shipped since MPI-501.

**Why pip failed on the reporter's machine** is still open, unchanged and still not a
dependency of any of the three fixes. MPI-675 is what makes their log obtainable.

## Harness disposal — deliberately NOT done

`D:\tmp\cu126-repro` (~10 GB) stays. This card owns disposing of it, and the condition
for disposal is not met: **1.4.3 is unreleased**, and this is the only place the broken
state exists on demand — the phase-3 release verification may still want it. Dispose at
the umbrella's close-out, not this card's, and say so there.
