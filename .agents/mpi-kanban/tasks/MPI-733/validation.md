# MPI-733 Validation

## Phase 1 — eligibility as a pure function: DONE, auto-verified 2026-09-12

### What landed

`selectCueAllTargets(operation, model, groups)` in `js/data/commandRegistry.js`, plus
`tests/cue-all-eligibility.test.cjs` (9 tests).

**Placement differs from the plan, deliberately** — see Plan Drift. The plan said to split
the helper into its own module "the way `js/utils/galleryRenditions.js` was split out"
because Node could not otherwise reach it. That premise does not hold:
`js/data/commandRegistry.js` has **no imports at all** and is already dynamically imported
by ~10 `.cjs` tests (`tests/gallery-entry-text-op.test.cjs:31` is the pattern). A separate
file would have held one function away from the three registry functions it reads.

### The rule is narrower than the plan's, and the registry is why

The plan's rule was "the op declares at least one slot of the selected media type". The
shipped rule is **exactly one REQUIRED slot, whose type matches the group**. This was not a
preference — enumerating every op's slots showed the looser rule dispatches broken jobs:

| op | slots | looser rule would… |
|---|---|---|
| `flowHeadSwap`, `flowScribObj`, `flowObjectStamp` | REQ image,image | queue N graphs each missing their 2nd required input |
| `flowVoiceChanger` | REQ audio,audio | same, on the audio side |
| `t2v_ms`, `flowDramaBox` | REQ none, OPT audio | make a text op "batchable" over its decoration |
| `ref2v_ms` | REQ none, OPT ×15 | same, spectacularly |
| `i2v_ms` on LTX | REQ image, OPT image,audio | make an AUDIO selection eligible through the optional audio slot — queueing image-to-video jobs with no image |

The tighter rule still lands on exactly the ops the plan promised, verified by an assertion
rather than by reading: `edit`, `krea2Edit`, `kleinEdit`, `qwenEdit`, `i2i`, `control`,
`upscale`, `pid`, `i2v` for image and `extend` for video all batch, and each is confirmed
single-required-input. It also picks up later single-input ops for free, which a whitelist
would not.

`inpaint`/`detail` still need no exclusion code: the Gallery mounts its PromptBox with
`canMask: false`, so a mask op is never the remembered op on this surface.

### Evidence

**`node --test tests/cue-all-eligibility.test.cjs` — 9 tests, 9 pass, 0 fail.** Covers the
four cases the plan named (mixed selection → images only; text-only op → zero; `extend`
over video → all; null op → zero) plus the four the slot enumeration turned up
(two-required-input ops, optional slots as a non-axis, wrong-media-type distinguished from
nothing-picked, junk input).

**The test is not vacuous — proven by falsification.** Replacing the type filter with
`list.filter(() => true)` turned **3 of the 9 red** (mixed selection, optional-slots,
all-wrong-type), and reverting turned them green again. The probe was removed and its
absence re-grepped (0 occurrences).

**`npm test` — 944 tests, 944 pass, 0 fail, exit 0**, run twice consecutively.

*Honest note:* one intermediate run of the full suite reported `fail 1` without naming the
test, and it did not reproduce on either of the two runs after it (both exit 0, 944/944).
Three peer sessions are editing this shared tree live, so a file changing mid-run is the
likely cause. It is recorded rather than hidden; if it recurs it is worth chasing, but
nothing in this card's diff is implicated — the new test passes in isolation and in-suite.

**`npm run lint` — clean.**

### Reasons the caller gets

`reason` is set only when nothing is eligible, so Phase 2's disabled tooltip can tell the
cases apart rather than showing one generic string:

- `'no-operation'` — nothing remembered, or a key that no longer exists
- `'not-batchable'` — the op does not take exactly one required input
- `'wrong-media-type'` — the op is batchable, but nothing selected matches its slot

## Phase 2 — the menu entry, VERIFIED IN A REAL ELECTRON WINDOW (2026-09-12)

The MPI-730 block recorded below had cleared: all three of its claims on
`MpiGalleryGrid.js` (`2ff07de9`, `3a1c6d54`, `ad47a12c`) were terminal
(`complete`/`verified`), absent from `active_file_claims`, and its card was `done`. Claimed
as `523c5ece` and built.

**Automated checks.** `npm run lint` clean · `npm run lint:components` clean ·
`npm test` **944/944, 0 fail** · `npx playwright test --config=playwright.desktop.config.js
tests/desktop/gallery-archive.spec.js` **3 passed** — that last one matters as a regression
guard, because it dispatches a real `contextmenu` and reads a menu row, so a throw in the
new `cue-all` block would have taken the whole menu down with it.

**The Phase 2 verify itself**, run through a temporary probe spec mounted in a real Electron
window on its own `globalSetup`-assigned `CUBRIC_PORT` (the archive run reported 50164; the
probe runs each took their own, and the user's `:3000` was never touched). The
probe was deleted after the run; Phase 4 owns the permanent spec. Captured output:

```
[probe] no remembered op ->
  {"modelId":"sdxl-realistic","label":"Cue all","disabled":true,
   "info":"Pick an operation first","selected":3}
[probe] i2i remembered, 3 images + 1 video ->
  {"modelId":"sdxl-realistic","label":"Cue all (3)","disabled":false,
   "info":"Queue one job per selected card on the current settings","selected":4}
[probe] t2i remembered ->
  {"modelId":"sdxl-realistic","label":"Cue all","disabled":true,
   "info":"This operation can't run one card at a time","selected":2}
```

That covers the plan's two named cases plus one it did not ask for:

- **nothing remembered** → present, greyed, `Pick an operation first` (decision 1)
- **`i2i` remembered over 3 images + 1 video** → `Cue all (3)`, enabled — the mixed
  selection *filtered to the op's type instead of refusing*, which is decision 2 proven
  live rather than reasoned about
- **`t2i` (text-only) remembered** → greyed with the not-batchable string

**The assertion is non-vacuous, and this was demonstrated rather than assumed.** The first
run FAILED with `Cue all (1)` against an expected `Cue all (3)`. The cause was the probe,
not the product: ctrl-click toggles, so case 2 re-clicking case 1's still-selected cards
deselected them, the right-clicked card was then outside the selection, and the handler took
its documented single-card fallback. Fixed by resetting selection mode between cases, and a
`selected` count was added to the probe output so a silent fallback can never again read as
a pass — the 3/4/2 above is that guard reporting the real selection size.

### Fabio tested it in his own app and it FAILED — corrected, re-verified

The run above is the FIRST attempt, and it passed while the feature was wrong. Recorded, not
tidied away, because the gap is the lesson: every check above mounted the grid standalone and
**fed it the op itself**, so none of them could see that the op *source* was wrong. A green
harness proved the label arithmetic, never the wiring.

What Fabio found: `s_selectedOpByModel` is written only for user-driven picks, and dragging
an image into the prompt box auto-selects `i2i` **programmatically** — so `Cue all` was
greyed while the strip visibly showed `i2i`, and after the chip was removed the stale memory
left it *enabled* under `t2i`. Both directions wrong.

**Fix:** `MpiGalleryBlock.js` passes `getCueContext: () => ({ operation: activeOperation,
model: activeModel })` into the grid mount; the grid calls it at right-click time.
`activeOperation` is assigned unconditionally by the `operation-change` handler
(`MpiGalleryBlock.js:1344`), so it follows programmatic picks. This **deleted** the
`modelHelpers` import the first attempt had added.

Re-verified with a probe built to catch this specific class of fault — mounted ONCE, the
callback's return mutated between right-clicks, and `s_selectedOpByModel` poisoned to the
opposite value each time, so any regression to the memory read inverts the assertions:

```
[probe] live i2i (auto-selected by a drag) -> {"label":"Cue all (3)","disabled":false,
  "dataInfo":"Queue one job per selected card on the current settings",
  "hasTitleAttr":false,"selected":4,"reads":1}
[probe] live t2i (chip removed)            -> {"label":"Cue all","disabled":true,
  "dataInfo":"Cue all does not support the current operation",
  "hasTitleAttr":false,"selected":2,"reads":2}
[probe] live op null                       -> {"label":"Cue all","disabled":true,
  "dataInfo":"No operation selected","hasTitleAttr":false,"selected":2,"reads":3}
```

`reads` climbing 1→2→3 with no remount is the proof it reads live rather than caching at
mount — the property the bug was made of. `hasTitleAttr:false` pins the other correction:
**this app has no tooltips and none was written.** `info` reaches `MpiButton` as `data-info`,
which is the status-bar feed in Fabio's screenshots; the earlier write-ups called it a
tooltip, which was sloppy wording, not stray code.

Re-run after the fix: `lint` + `lint:components` clean · `npm test` **944/944** · gallery
desktop specs (`gallery-archive`, `gallery-renditions`, `gallery-media-release`) **11/11**.
The probe was deleted; Phase 4 owns the permanent spec, and it must mount through the BLOCK,
not the grid alone — a standalone mount is what let this ship broken.

## Phase 3 — the dispatch loop, BUILT 2026-09-12

`_cueAllDispatch` in `MpiGalleryBlock.js`. One `getRunPayload()` read, so all N jobs share
one recipe; `mediaItems` is the only field that varies. Per eligible group it builds the item
in the same shape `_tryAddMedia` produces (`{id, url: sel.filePath, file: null, mediaType,
source: 'app', name}`), tags it with the op's single required slot's key, maps through the
existing `_galleryGenerationFromPayload`, and calls `enqueueGeneration` with **no
`getNextGeneration`** — one batch must not become an endless queue. Refuses under
`state.loopArmed` (the `_onLaneDrain` re-fire would never let a batch end). Reports queued
and skipped counts via `StatusBar.notify`. No second `_exitSelectionMode` — the grid already
does it.

**One design decision worth keeping:** the `grid.on('cue-all')` subscription lives OUTSIDE
`_wirePromptBox`, which runs at two mount sites. Registering inside it would stack a second
listener on the same grid on a re-wire and **cue every job twice**. The handler reaches the
closure through a `_cueAllDispatch` variable instead.

### Two things the sweep found

1. **The video row of the plan's op table is unreachable, and that is correct.** `extend`
   declares exactly one required video slot so the rule accepts it, but **no model declares
   `extend`** — Video Extend ships as a Flow, and Flows are not gallery ops. So selecting
   VIDEO cards does nothing; it gains that free if a model ever declares such an op.
   **The batch axis is an image selection — the output can still be video.** `i2v`
   (wan22-5b) and `i2v_ms` (wan-22, ltx-23, ltx-23-balanced, minimax-h3) are batchable, each
   selected image becoming that clip's `startFrame`: 5 photos → 5 clips, one of the card's
   two headline wins. Their `endFrame`/`inputAudio` slots are optional and rightly not batch
   axes. Verified per model, not assumed.
2. **Eligibility and the enqueue guard read different slot lists.** Eligibility filters by
   model; `findMissingMediaSlot` (`generationService.js:114`) does not. An op with a second
   required slot of another type in its unfiltered list would pass the menu then be refused
   at enqueue on *every* job — precisely "Cue all does nothing". Swept all **67** accepted
   (model, op, mediaType) combinations: **0 refused.** Now pinned by a permanent test.

### The batch slot follows the user's choice (Fabio, 2026-09-12)

Phase 3 first tagged every batched item with the op's **single required slot**. Fabio spotted
what that costs: on `i2v_ms` the role pill (MPI-466) toggles a lone staged image between
`startFrame` and `endFrame`, so "try five different END frames" is a real request — and the
required-slot rule would have run all five as START frames. A wrong result that looks like a
working one, which is the worst kind.

Now `buildCueAllJobItems(operation, model, staged, card)` in `js/data/commandRegistry.js`,
pure and sitting beside `selectCueAllTargets`. Verified across 7 real-registry scenarios
before extraction, then pinned by 4 tests:

| staged chips | op | job 1 |
|---|---|---|
| `startFrame` (untagged) | `i2v_ms` | `[CARD:startFrame]` — old default unchanged |
| `endFrame` (pill toggled) | `i2v_ms` | `[CARD:endFrame]` — **sweeps end frames** |
| `startFrame` + `endFrame` | `i2v_ms` | `[staged:startFrame, CARD:endFrame]` — **holds the start** |
| `startFrame` + audio | `i2v_ms` | `[CARD:startFrame, staged:inputAudio]` — audio survives |
| `inputImage` + `inputImage2` | `krea2Edit` | `[staged:inputImage, CARD]` — base stays at 0 |
| `inputImage` | `i2i` | `[CARD:inputImage]` |
| nothing | `i2i` | `[CARD:inputImage]` — required-slot fallback |

Two rules make that work. Roles arrive **pre-assigned** by the PromptBox's
`_withAssignedRoles`, so an untagged image still reads `startFrame`. And the card
**substitutes in place, never appends** — `control`, `krea2Edit`, `kleinEdit` and `qwenEdit`
declare ORDINAL slots whose roles `stripOrdinalMediaRoles` drops so chip ORDER alone decides
(MPI-330); appending would shuffle a two-chip edit's base image into the slot being swept.

Both new assertions discriminate by construction: `i2v_ms`'s required slot IS `startFrame`,
so a regression to the old rule yields `startFrame != endFrame`; and appending yields a
3-element array against an expected 2.

**Note for Phase 4:** the sidecar assertion must read the **swept** slot, not `mediaItems[0]`
— on a two-chip sweep index 0 is the fixed chip and identical across every job.

### What was run

`lint` + `lint:components` clean · `npm test` **945/945** (the new sweep is test 945) ·
gallery + smoke desktop specs **12/12**. The new
`tests/cue-all-eligibility.test.cjs` sweep was proved live, not vacuous: 67 required-slot
assertions actually execute, and all 67 fail under a deliberately wrong expectation. It also
carries an `accepted > 0` guard so it cannot silently start testing nothing.

### Still owed to Fabio — the legs a sandbox cannot reach

Phase 3's plan verify is deliberately app-level and this card is `**Verify mode:** user-ux`:

- **queue depth reads N, N placeholder cards appear, they run in order.** Needs a project
  with installed models; the test app has neither.
- **each output's `.meta` sidecar names a DIFFERENT source image** under
  `generationSettings.mediaItems`. Needs real generations on a real GPU. This is the check
  that actually matters — thumbnails alone cannot prove the right input went in
  (`docs/generation-lifecycle.md` § History dispatch).

`layers` as the icon: **confirmed fine by Fabio, 2026-09-12.**

### One thing found for free, for whoever takes Phase 3

`MpiGalleryGrid.js:1528` already runs `if (useSelection) _exitSelectionMode();` after every
context-menu action. Phase 3's "exit selection mode after" is therefore already handled by
the grid — do not add a second exit in the Block handler.

## Phase 4 — regression spec + docs: DONE, auto-verified 2026-09-12

### The spec — `tests/desktop/gallery-cue-all.spec.js`

Mounts through **`MpiGalleryBlock`** via `navigate(PAGE_GALLERY)` on a real project folder
(3 images + 1 video), never the grid alone. `sdxl-realistic` is stubbed installed (a plain flat
model, so `installed` alone makes it usable) and re-stubbed from a `models:checked` listener
registered after the app's (testing-desktop-specs trap 5). One test, three legs:

1. Empty box → live op `t2i`, memory POISONED to `i2i` → `Cue all`, disabled,
   `Cue all does not support the current operation`, 4 selected.
2. A synthetic `application/mpi-media` drop stages an image, and the box picks `i2i` itself
   (asserted), memory POISONED to `t2i` → `Cue all (3)`, enabled, 4 selected.
3. One Cue all click → `peekCueQueue()` holds **3 jobs, all `i2i`, each carrying exactly one
   image — its own card's still, in click order, the video skipped in place, the staged chip in
   none**. Held pending by patching `generationStore.getSnapshot` to report both lanes busy
   (`_laneBusy` reads it), so `_dispatchNextCue` never calls `startGeneration`. No GPU.

`selected` is asserted every read so a right-click that fell outside the selection (the
single-card fallback) can never read as a pass.

### Mutation — 3 of 3 KILLED (`scripts/mutate-check.mjs`, restored byte-identical)

| mutant | file | killed by |
|---|---|---|
| op source → `getSelectedOp(activeModelId)` (the exact bug Fabio hit) | `MpiGalleryBlock.js` | leg 1 label/disabled/info |
| `mediaItems: staged` (ship the chip, not the card) | `MpiGalleryBlock.js` | leg 3 `not.toContain(STAGED)` |
| `const eligible = list;` (the plan's named verify) | `commandRegistry.js` | leg 2 label `Cue all (4)` |

After: all three mutant strings grep 0, `commandRegistry.js` has no diff vs HEAD, and the
block's diff is MPI-678's pre-existing hunks only.

### Runs

- `npx playwright test --config=playwright.desktop.config.js tests/desktop/gallery-cue-all.spec.js` — **1 passed (5.0s)**
- same config, cue-all + gallery-archive + gallery-renditions + gallery-media-release — **12 passed (1.7m)**, after the mutations
- `npx eslint tests/desktop/gallery-cue-all.spec.js` — clean

### Docs

New `docs/gallery-selection.md` (32 lines): trigger and why the context menu, live-op read,
eligibility rule + reasons, image-axis/video-output note, role-pill slot choice + in-place
substitution, click-order caveat (corrected — see Plan Drift), Loop refusal, the two dispatch
traps, spec pointer. Every named symbol grepped present. `docs/gallery.md` stays **199** lines
in the WORKTREE, which includes peers' uncommitted MPI-678/MPI-723 sections (**171** committed at
`581a3363`), with its selection section moved out and a 3-line pointer in. `docs/README.md` map row added.

### Fabio's app (`user-ux`) — PASSED 2026-09-12

Fabio ran Cue all in project `1.4 media` on H3 (`minimax-h3`, `i2v_ms`) with one staged chip
pill-tagged **`endFrame`** — the harder sweep case — over 2 selected cards. Read back from disk:

- `i2v_001` sidecar: one item, `role: endFrame`, `t2i_006.png`; `i2v_002`: `role: endFrame`,
  `t2i_007.png`. **A different image in the SWEPT slot per job**, run in order.
- ComfyUI `/history` for both: `Input_Start_Frame = ''`, `Input_End_Frame = <that card's path>`.
- Two earlier Cue all batches (18:36, 18:37) were Stopped by Fabio — two global interrupts each
  in `app.log`, queue resumed as designed. Not a defect.

His concern that H3 "started from the end frame" was NOT a wiring fault: all three clips were
**0.92 s** (`Input_Duration: 1`). Extracted last frames match each end image, and core
`MiniMaxH3ImageToVideo` anchors a lone `last_frame` at `frame_count - 1` (honoured in
`comfy/ldm/minimax/model.py`). 22 frames leave no room for an entrance. His 3 s re-run worked,
and he confirmed: "We already proved that it works."
