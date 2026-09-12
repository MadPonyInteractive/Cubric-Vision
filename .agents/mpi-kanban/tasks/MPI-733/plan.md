# Cue all — batch a gallery multi-select through the current prompt-box recipe

UMBRELLA: MPI-732. Read `tasks/MPI-732/plan.md` for the member list and phase order.

## Current State

Project mode: **scalable-foundation** — full guardrails, no prototype shortcuts.

**Where this stands, 2026-09-12.** Card in `doing`. **Phases 1 and 2 are DONE.** Phase 1's
`selectCueAllTargets()` lives in `js/data/commandRegistry.js` with 9 passing tests, returning
`{ eligible, skipped, reason }` with `reason` one of `'no-operation'` / `'not-batchable'` /
`'wrong-media-type'`. Phase 2's `cue-all` entry is wired in `MpiGalleryGrid.js` and **proven
in a real Electron window**, all three label/disabled/tooltip states observed — see
`validation.md` for the captured output. The MPI-730 block that stopped the previous session
had cleared (its claims are terminal).

**Phase 3 is BUILT too, and committed with Phases 1-2** — `_cueAllDispatch` in
`MpiGalleryBlock.js` reads `getRunPayload()` once and calls `enqueueGeneration` per eligible
group; `buildCueAllJobItems()` in `commandRegistry.js` decides which staged slot each card
sweeps (Fabio's follow-up: a pill-tagged `endFrame` sweeps end frames). Refuses under Loop,
reports the skipped count, passes no `getNextGeneration`. Machine-checked as far as a sandbox
can reach (949 unit, 12/12 gallery desktop specs, plus a sweep proving no batchable job can be
refused at enqueue). The commit EXCLUDED MPI-678's hunks in the two shared files via a
hand-built index blob, so those hunks are still uncommitted in the worktree — but
**the queue-depth and sidecar legs need Fabio's own app**: they want a project, installed
models and a real GPU, which is why this card is `user-ux`.

**Phase 4 is DONE too — all four phases are built (2026-09-12).** `tests/desktop/gallery-cue-all.spec.js`
mounts through the BLOCK and kills three mutants (op source → memory, staged chips shipped
instead of the card, eligibility returning everything); the docs entry is the new
`docs/gallery-selection.md`. Phase 4 was committed at its handoff, with `docs/gallery.md` and the root
`events.jsonl` staged as hand-built blobs (both also hold peer MPI-678/MPI-723 lines). `a2de7093`
(Phases 1-3) and that commit stay LOCAL until master CI is green — it was red from a peer commit.

**FABIO VERIFIED IT IN HIS APP, 2026-09-12.** H3 `i2v_ms`, a pill-tagged `endFrame` chip, 2
cards → Cue all → `i2v_001`/`i2v_002` in project `1.4 media`, whose sidecars each name a
different image (`t2i_006`/`t2i_007`) in the `endFrame` slot, run in order. His "the video starts
on the end image" scare was `Input_Duration: 1` (0.92 s clips — the LAST frames do match the end
images, and core anchors the keyframe at `frame_count - 1`); his 3 s re-run worked.
**Single next action: `mpi-end-session`** — close the card on that evidence and push once master
CI is green. **Committing `MpiGalleryGrid.js` / `MpiGalleryBlock.js` still sweeps in MPI-678's
uncommitted work** unless staged by hunk.

**The ask.** Fabio's photographer friend wants one operation run over many photos or
clips without a watch folder. Agreed shape (2026-09-12): import them into a Vision
project, select N gallery cards, right-click → **Cue all (N)**. Each selected card
becomes its own queued job, all sharing the prompt box's current recipe — prompt,
style, LoRAs, controls. Selection clears afterwards.

Investigation was done inline during the design conversation, with every claim below
read out of the tree rather than remembered. No sub-agents were spawned because there
were no independent unknowns left to farm out; what follows is the finished result.

### Why the context menu, and not the Cue button or a hotkey

Both of the obvious triggers are already taken, and the second one is what decides
the whole design:

- `q` is `queue.toggle` — "Toggle Cue panel", `js/managers/hotkeyRegistry.js:249`.
  `generation.run` is `control+enter`. Neither is free, and neither should be
  re-pointed.
- **Entering selection mode HIDES the prompt box** —
  `grid.on('selection-start', () => _pb?.el?.hide())`,
  `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js:1710`. So by the time a
  multi-select exists, the Cue button is off screen. Fabio found this by testing.

Right-click is also simply where users already go with a multi-select: `compare`,
`combine`, `add-to-project`, `reveal`, `archive`, `download` and `delete` all live
there, and all already resolve a selection through the same `targetIds` block at
`js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js:1434`.

### Why this is cheap — the hide is `hide()`, not `destroy()`

The PromptBox component stays mounted while hidden, so `_pb.el.getRunPayload()`
(`js/components/Organisms/MpiPromptBox/MpiPromptBox.js:2171`) still returns the live
recipe — operation, positive (including an approved enhancement), negative,
negativeAudio, sourcePrompt, injectionParams, previewOnly, forceLocal. **`mediaItems`
is the single field a batch varies.**

Everything downstream already handles N jobs: `enqueueGeneration` pushes to `_cueQueue`
(`js/services/generationService.js:499`), lanes and the dispatch guard are per-job,
`_galleryGenerationOptions` already mints a placeholder card per job, and the Cue panel
renders pending rows from `getGenerationQueueSnapshot`. **No queue work is in scope.**

### Why media must NOT go through the chip rail

Op availability is `requires* <= staged count <= #slots of that type`
(`getAvailableCommands`, `js/data/commandRegistry.js:1614`), and `edit` declares
exactly ONE image slot. Staging five images therefore makes `edit` **disappear from
the op strip** — the rail is structurally incapable of expressing "five inputs, one
at a time". Each job carries exactly one item, and the rail is bypassed for that slot.

### Which ops qualify

The rule is **the selected op declares at least one media slot of the selected media
type** — not a whitelist. Enumerated from the registry, the gallery-reachable ops that
qualify:

| media | ops |
|---|---|
| image | `edit`, `krea2Edit`, `kleinEdit`, `qwenEdit`, `i2i`, `control`, `upscale`, `pid`, `i2v` |
| video | `extend` |

`upscale` (a folder of stills) and `i2v` (5 photos → 5 clips) are the two biggest wins
and must not be excluded — the first draft of this design whitelisted `edit`, and
Fabio corrected it.

`inpaint` / `detail` need **no exclusion code**: the gallery passes `canMask: false`
(`js/components/Organisms/MpiPromptBox/MpiPromptBox.js:209`), so mask ops are already
absent from the gallery strip. A mask painted on image A would be meaningless on image
B, and the existing gate is what makes that unreachable rather than merely discouraged.

### The op to run is the CURRENT one — reversed 2026-09-12, see Plan Drift

**This section's original claim was wrong and is kept only as the record of it.** It said
to read the REMEMBERED op (`getSelectedOp(modelId)` → `s_selectedOpByModel`) rather than
the displayed one, reasoning that with an empty prompt box the strip force-drops to a
text-only op (MPI-388, `dropToTextOpIfEmpty`) so the display cannot be trusted.

The reasoning skipped the case that dominates real use. `setSelectedOp` is guarded against
**programmatic** picks — and dragging an image into the prompt box auto-selects `i2i`
programmatically. So the memory stays *empty* through the exact gesture that makes the op
valid, and Fabio hit it immediately: `Cue all` greyed while the strip plainly showed `i2i`,
then still enabled after the chip was removed and the strip had dropped to `t2i`.

**Read the op the user can SEE:** the block's `activeOperation`, which its
`operation-change` handler assigns unconditionally (`MpiGalleryBlock.js:1344`), handed to
the grid as a `getCueContext()` callback. The consequence to keep in mind for Phase 3 is
that the staged chip must STAY staged — it is what makes the op available at all — and each
job simply overrides `mediaItems` with its own card, so the chip is harmless.

## Decisions (front-loaded — no open questions remain)

1. **Ineligible or absent remembered op → the entry is disabled, with a tooltip.**
   On a fresh launch with nothing picked, or with a text-only op remembered, the menu
   entry reads `Cue all` greyed with `Pick an operation first`. Rejected the
   alternative (fall back to the model's first image op) because it would silently run
   an operation the user never chose, across N images, spending N generations — the
   single most expensive way to be wrong here.
2. **Mixed image+video selection filters to the op's type; it does not refuse.** The
   label counts only what qualifies (`Cue all (3)` on a 3-image/2-video selection), and
   clicking toasts which were skipped and why. Matches how every other multi-select
   action in this menu degrades.
3. **Loop mode armed (`control+l`) refuses the batch with a toast.** `_onLaneDrain`
   re-fires the last job while `state.loopArmed`, so a batch draining under loop would
   never end. Refusing is honest; silently disarming the user's loop is not.
4. **Selection order is click order, and that is all it is.** `_selectedIds` is a Set,
   so ctrl-click order survives, but shift-range select clears and re-adds in render
   order (`MpiGalleryGrid.js:319`). Document the behaviour; build no ordering
   machinery for it.
5. **The grid emits, the Block dispatches.** The grid owns no generation knowledge —
   it emits `cue-all` with the resolved groups exactly as `compare` / `combine` /
   `add-to-project` do, and `MpiGalleryBlock` owns the N× `enqueueGeneration` loop.
   This keeps `MpiGalleryGrid` free of any import from `generationService`.

## Known rough edge, out of scope here

To *pick* `edit` in the first place the user must have an image staged, because op
availability is driven by the staged chip count — with an empty box the strip offers
only text ops. So the real first-time sequence is: stage one image → pick the op →
clear or keep it → select N cards → Cue all. On any later batch the remembered op
makes this invisible, because `s_selectedOpByModel` survives.

This is pre-existing behaviour, not something Cue all introduces, and the fix (letting
a gallery selection feed the op strip's context) is a separate change to a gated
mechanism that several other cards depend on. **Do not widen this card to fix it.**
Raise it with Fabio as its own card if the friction proves real in use.

## Completed

- [x] **Phase 1 — the eligibility helper, 2026-09-12.** `selectCueAllTargets(operation,
      model, groups)` in `js/data/commandRegistry.js` + `tests/cue-all-eligibility.test.cjs`
      (9 tests, all pass, proven non-vacuous by falsification). `npm test` 944/944, lint
      clean. Two deviations from what this plan said, both forced by the tree and both
      recorded in Plan Drift: where the helper lives, and how the rule is stated.
      Evidence: `validation.md`.
- [x] **Phase 2 — the menu entry, 2026-09-12.** `cue-all` in `MpiGalleryGrid.js` beside
      `add-to-project`: `layers` icon, label `Cue all (N)` off the eligible count (bare
      `Cue all` at zero), `disabled` at zero, `data-info` (the STATUS BAR, not a tooltip)
      mapped from `reason`. Emits `{ groups, skipped, reason }`; no generation-layer import.
      **Shipped twice** — the first attempt read the remembered op and Fabio found it broken
      in the app both ways; it now reads the live op through a `getCueContext()` callback
      from `MpiGalleryBlock.js`. See Plan Drift. Evidence: `validation.md`.

- [x] **Phase 3 — the dispatch loop, 2026-09-12.** `_cueAllDispatch` in
      `MpiGalleryBlock.js`: one `getRunPayload()` read, then one `enqueueGeneration` per
      eligible group with `mediaItems` replaced by that card's own item (built in the same
      shape `_tryAddMedia` produces, tagged with the op's single required slot's role).
      Refuses under `state.loopArmed`; reports queued and skipped counts through
      `StatusBar.notify`; passes no `getNextGeneration`. Subscribed ONCE outside
      `_wirePromptBox` so a PromptBox remount cannot double-cue. Evidence: `validation.md`.

- [x] **Phase 4 — regression spec + docs, 2026-09-12.** `tests/desktop/gallery-cue-all.spec.js`
      through `MpiGalleryBlock`: label/disabled follow the LIVE op in both directions with the
      memory poisoned opposite, and one click queues 3 jobs whose single image slot is each
      card's own still, in click order. Jobs held pending by reporting both lanes busy through
      `generationStore.getSnapshot` — no GPU. 3/3 mutants killed. Docs split into
      `docs/gallery-selection.md`. Evidence: `validation.md`.

## Remaining Work

Kept as sequential phases rather than a `## Parallel Batch`: the two files are joined
by one seam (the `cue-all` event contract), so the Block handler cannot be verified
before the menu entry that fires it exists. Splitting would create exactly the forward
dependency the plan rules forbid. The work is also small enough that a batch would cost
more in briefing than it saves.

## Phase 1: Eligibility, as a pure function — DONE

- [x] Add a helper that answers "how many of these groups can this op consume", given
      the remembered op, the model, and the selected groups. It returns the eligible
      groups in selection order plus the skipped ones with a reason, and it reads slot
      capacity through `getCommandMediaInputs` / `filterMediaInputsForModel` rather
      than hardcoding any op list. Pure, no DOM, no dispatch.
      **Verify:** a Node unit test (`tests/*.test.cjs`, the existing bare-Node pattern)
      covering: an image op with mixed selection returns only the images; a text-only
      remembered op returns zero eligible; `extend` over video groups returns all;
      a null remembered op returns zero eligible. Test must import the helper without
      pulling in browser-absolute paths — put it where Node can reach it, the way
      `js/utils/galleryRenditions.js` was split out for exactly this reason
      (`docs/gallery.md` § the rendition ladder).

## Phase 2: The menu entry — DONE

- [x] Add `cue-all` to the gallery card context menu in
      `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js`, beside
      `add-to-project`, labelled `Cue all (N)` off the eligible count and disabled at
      zero. It emits `cue-all` with the eligible groups, the skipped ones, and the
      reason; the grid imports nothing new from the generation layer.
      **Verify:** in the running app (`npm run app:isolated`, own port + profile),
      right-click on a 3-image selection with `edit` remembered shows `Cue all (3)`;
      with nothing remembered it is disabled and tooltipped. Nothing dispatches yet.

## Phase 3: The dispatch loop — BUILT, needs Fabio's queue test

- [x] Handle `cue-all` in `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js`:
      read `_pb.el.getRunPayload()` once, then for each eligible group call
      `enqueueGeneration` through the existing `_galleryGenerationFromPayload` mapper
      with `mediaItems` replaced by that group's selected item alone. Refuse with a
      toast when `state.loopArmed`. Toast the skipped ones. Exit selection mode after.
      Pass no `getNextGeneration` callback — a batch job must not re-fire itself.
      **Verify:** in the running app, select 3 images, Cue all → queue depth reads 3,
      three placeholder cards appear, they run in order and each output's `.meta`
      sidecar names a different source image under `generationSettings.mediaItems`.
      That sidecar read is the check that matters; the output thumbnails alone cannot
      prove the right input went in (`docs/generation-lifecycle.md` § History dispatch).

## Phase 4: Regression spec + docs — DONE

- [x] Desktop spec under `tests/desktop/`, following `docs/testing-desktop-specs.md`.
      Assert the eligible count on the menu label, the disabled state with no
      remembered op, and that N cue-all clicks produce N queued jobs. Stub at the
      dispatch boundary — the spec must not need a GPU.
      **Verify:** `npm run test:desktop` passes with the new spec, and it fails when
      the eligibility helper is made to return everything.
- [x] Document the feature in `docs/gallery.md` (selection section): the trigger, the
      eligibility rule, the remembered-op read, the click-order caveat, and the loop
      refusal. Keep the file under the 200-line rule; split if it crosses.
      **Verify:** `docs/gallery.md` line count checked, and the entry names symbols
      that exist.

## Plan Drift

- **2026-09-12 — the helper lives IN `commandRegistry.js`, not a new module.** This plan
  said to split it out "the way `js/utils/galleryRenditions.js` was split out" so Node
  could reach it. That premise is wrong: `commandRegistry.js` has **no imports at all** and
  is already dynamically imported by ~10 `.cjs` tests (`tests/gallery-entry-text-op.test.cjs:31`
  is the pattern). `galleryRenditions.js` needed splitting because *it* had browser-absolute
  imports. A separate file would only have moved one function away from the three registry
  functions it reads.
- **2026-09-12 — the eligibility rule is narrower than this plan stated, because the
  registry forced it.** Planned: "declares >= 1 slot of the selected media type". Shipped:
  **exactly one REQUIRED slot, whose type matches**. Enumerating every op's slots showed
  the looser rule queues jobs that cannot run: `flowHeadSwap`/`flowScribObj`/
  `flowObjectStamp` (REQ image,image) and `flowVoiceChanger` (REQ audio,audio) would each
  get N graphs missing a required input; `t2v_ms`/`ref2v_ms`/`flowDramaBox` (zero required
  slots) would become "batchable" over their optional decorations; and `i2v_ms` on LTX
  would accept an AUDIO selection through its optional audio slot, queueing image-to-video
  jobs with no image. The tighter rule still lands on exactly the ops the plan's table
  promised — asserted in the test, not assumed — and still picks up future single-input ops
  for free. **The spirit is unchanged: no whitelist.**
- **2026-09-12 — Phase 2 was BLOCKED on a live peer, and the block CLEARED.**
  `MpiGalleryGrid.js` was under an active write claim from MPI-730 item 3 (session
  `44919499-034d-4a40-be05-24a7409a81a1`). By the time Phase 2 started, all three MPI-730
  claims on the file were terminal (`complete`/`verified`) and absent from
  `active_file_claims`, and the card was `done`. Claimed as `523c5ece` and built. No
  negotiation was needed.
- **2026-09-12 — REVERSED BY FABIO IN THE APP: the op source is the CURRENT op, not the
  remembered one.** Phase 2 first shipped reading `getSelectedOp(modelId)`, per the plan
  section above. Fabio found it broken in two directions within minutes: dragging an image in
  auto-selects `i2i` **programmatically**, and `setSelectedOp` is guarded against exactly
  that, so `Cue all` was greyed while the strip showed `i2i`; and after removing the chip the
  stale memory left it *enabled* while the strip had dropped to `t2i`. His read — "it's not
  getting information from the currently selected operation… it's probably triggering when
  the user selects an operation, which is the wrong approach" — was exactly right.
  **Fix:** the block passes `getCueContext: () => ({ operation: activeOperation, model:
  activeModel })` into the grid's mount; the grid calls it at right-click time.
  `activeOperation` is assigned unconditionally by the `operation-change` handler
  (`MpiGalleryBlock.js:1344`), so it tracks programmatic picks too. This **removed** the
  `js/utils/modelHelpers.js` import the first attempt added — the grid now resolves nothing
  and decision 5 is cleaner than before, not merely intact. Verified by a probe that mutates
  the callback between right-clicks *while poisoning `s_selectedOpByModel` to the opposite
  value*, so a regression to the memory read inverts the assertions.
- **2026-09-12 — "tooltip" was the wrong word throughout; this app has no tooltips.**
  Fabio: "We don't use tooltips in this app. The info shows up in the status bar." No tooltip
  code was ever written — `MpiContextMenu` passes `info` to `MpiButton`, which renders it as
  `data-info`, and that is the status-bar feed the screenshots show. Nothing to remove; the
  plan/checklist/validation wording is corrected, and the probe now asserts `data-info` is
  set **and** that no `title` attribute exists, so a future tooltip cannot creep in silently.
- **2026-09-12 — the three info strings, reworded on Fabio's instruction.** Decision 1 asked
  for one string, `Pick an operation first`; the helper returns three distinct reasons, and
  `not-batchable` also covers genuinely multi-input ops like `flowHeadSwap`, where that
  wording is false. Shipped: `no-operation` → `No operation selected`, `not-batchable` →
  `Cue all does not support the current operation` (Fabio's suggested sense), and
  `wrong-media-type` → `No selected card matches the current operation`. With the op now read
  live, `no-operation` is nearly unreachable — there is almost always a displayed op — so
  `not-batchable` is the string users will actually meet.
- **2026-09-12 — `MpiGalleryGrid.js` carries ~83 lines of MPI-678's UNCOMMITTED work.**
  The archive scope toggle, the Record-button removal and the `archive` menu entry are all
  in the working tree under claim `ba2ba065` (`needs_verification`, heartbeat 2026-09-01 —
  no live writer), along with an untracked `tests/desktop/gallery-archive.spec.js`. Phase 2's
  edit is additive on top and did not clobber it — but **a whole-file
  `git add js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js` would commit MPI-678's
  feature under an MPI-733 message.** Stage this file by HUNK
  (`~/.claude/memory/tools/git-shared-tree.md`), or leave it to whoever closes MPI-678.
- **2026-09-12 — Phase 3 gets one step for free.** `MpiGalleryGrid.js:1528` already runs
  `if (useSelection) _exitSelectionMode();` after every context-menu action, so the Block
  handler must NOT add a second exit.

- **2026-09-12 — the video row of the "Which ops qualify" table is unreachable, and that is
  correct.** The table promises `extend` for video. `extend` does declare exactly one
  required video slot, so the rule accepts it — but a sweep of every model found **no model
  declares `extend` in `supportedOps`**, so selecting VIDEO cards is not batchable today.
  That is by design elsewhere: Video Extend ships as a **Flow**, and Flows are not ops on the
  gallery strip. It will start working for free the day a model declares a
  single-required-video-slot op. No code changed; nothing to fix.
  **Read this precisely: the batch AXIS is an image selection, but the OUTPUT can be video.**
  `i2v` (wan22-5b) and `i2v_ms` (wan-22, ltx-23, ltx-23-balanced, minimax-h3) are batchable —
  each selected image becomes that clip's `startFrame`, so 5 photos → 5 clips, which the
  card named as one of its two biggest wins. Their `endFrame` and `inputAudio` slots are
  OPTIONAL and correctly not batch axes; counting them would queue clips built from a stray
  decoration with no real input. An earlier note here said "Cue all is image-only in
  practice", which reads as though image-to-video were excluded. It is not.
- **2026-09-12 — the two rules read DIFFERENT slot lists, and it is safe by a hair.**
  Eligibility filters slots by model (`filterMediaInputsForModel`); `enqueueGeneration`'s
  `findMissingMediaSlot` does **not**. An op whose unfiltered list carried a second required
  slot of another type would pass the menu and then be refused at enqueue on every job —
  the exact "Cue all does nothing" symptom. Swept all 67 accepted (model, op, mediaType)
  combinations: **0 would be refused.** Pinned by a new test in
  `tests/cue-all-eligibility.test.cjs` that asserts the invariant rather than restating the
  guard, and proved live (67 assertions execute; all 67 fail under a wrong expectation).

- **2026-09-12 — RAISED BY FABIO: the batch varies the slot the USER chose, not the op's
  required slot.** On `i2v_ms`, MPI-466's role pill toggles a lone staged image between
  `startFrame` and `endFrame`, so "try five different END frames" is a real request. Phase 3
  first hardcoded the op's single required slot — which would have run all five as START
  frames: a wrong result that looks like a working one. Now
  `buildCueAllJobItems(operation, model, staged, card)` in `js/data/commandRegistry.js` (pure,
  beside `selectCueAllTargets`) takes the role of the **last staged chip of the batched media
  type**, falling back to the required slot when nothing is staged. Roles arrive pre-assigned
  by the PromptBox's `_withAssignedRoles`, so an untagged image still reads `startFrame` and
  the old default is unchanged. **Every other staged chip rides along untouched**, which is
  what makes "hold this start frame, sweep the end frame" work — and a staged audio chip
  survives too. The card **substitutes in place, never appends**, because `control`,
  `krea2Edit`, `kleinEdit` and `qwenEdit` declare ORDINAL slots whose roles
  `stripOrdinalMediaRoles` drops so chip ORDER decides (MPI-330); appending would shuffle a
  two-chip edit's base image into the slot being swept. Four new tests cover it.
  **Consequence for Phase 4's spec:** the sidecar assertion should check the SWEPT slot, not
  `mediaItems[0]` — on a two-chip sweep index 0 is the fixed chip and identical across jobs.

- **2026-09-12 — the docs entry is a NEW file, `docs/gallery-selection.md`.** `docs/gallery.md`
  was already at 199 lines (with MPI-678/MPI-723 peer sections uncommitted in it), so any entry
  crossed the 200-line rule. Moved its "Selection survives setGroups refresh" section out beside
  the Cue all entry and left a 3-line pointer: `gallery.md` stays at 199. `docs/README.md` map
  gained a row.
- **2026-09-12 — decision 4's click-order caveat was half wrong.** It said shift-range select
  "clears and re-adds in render order". `_rangeSelect` actually REPLACES the selection: it clears
  `_selectedIds` and walks from the anchor (last ctrl-clicked card) to the clicked one, so earlier
  ctrl-picks outside the range are dropped and the order is that walk. Documented as read.

## Verification

**Verify mode:** user-ux

Fabio must judge this one in the running app — whether queueing five feels right, how
the toast reads, and whether the disabled-entry tooltip explains itself. The automated
half (unit test + desktop spec + sidecar read) is necessary but does not settle it.

End to end: in a real project, select five imported photos with `upscale` remembered,
Cue all, and confirm five jobs queue, run in order, and produce five upscaled cards
each traceable to its own source via its sidecar.

## Preservation Notes

- `docs/gallery.md` gains the feature entry (above). No rule file should need editing
  — this adds no new component, event contract or workspace — but if the `cue-all`
  event ends up in `.claude/rules/component-events-blocks.md`, **ask Fabio before
  touching any rule file** (CLAUDE.md cardinal rule 5).
- Worth a memory line only if the hide-vs-destroy fact turns out to be load-bearing
  elsewhere; otherwise it belongs in `docs/gallery.md`, not in memory.
