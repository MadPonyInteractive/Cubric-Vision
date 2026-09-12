# Cue all — batch a gallery multi-select through the current prompt-box recipe

UMBRELLA: MPI-732. Read `tasks/MPI-732/plan.md` for the member list and phase order.

## Current State

Project mode: **scalable-foundation** — full guardrails, no prototype shortcuts.

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

### The op to run is the REMEMBERED one

With an empty prompt box the strip force-drops to a text-only op (MPI-388,
`dropToTextOpIfEmpty`), so the *displayed* op is not what the user picked.
`s_selectedOpByModel` records **only user picks** — `setSelectedOp` is guarded against
programmatic ones (`js/components/Organisms/MpiPromptBox/MpiPromptBox.js:1740`) — so
`getSelectedOp(modelId)` (`js/utils/modelHelpers.js:60`) still holds the real choice.
Read the op from there, never from the strip.

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

- [ ] Nothing yet.

## Remaining Work

Kept as sequential phases rather than a `## Parallel Batch`: the two files are joined
by one seam (the `cue-all` event contract), so the Block handler cannot be verified
before the menu entry that fires it exists. Splitting would create exactly the forward
dependency the plan rules forbid. The work is also small enough that a batch would cost
more in briefing than it saves.

## Phase 1: Eligibility, as a pure function

- [ ] Add a helper that answers "how many of these groups can this op consume", given
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

## Phase 2: The menu entry

- [ ] Add `cue-all` to the gallery card context menu in
      `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js`, beside
      `add-to-project`, labelled `Cue all (N)` off the eligible count and disabled at
      zero. It emits `cue-all` with the eligible groups, the skipped ones, and the
      reason; the grid imports nothing new from the generation layer.
      **Verify:** in the running app (`npm run app:isolated`, own port + profile),
      right-click on a 3-image selection with `edit` remembered shows `Cue all (3)`;
      with nothing remembered it is disabled and tooltipped. Nothing dispatches yet.

## Phase 3: The dispatch loop

- [ ] Handle `cue-all` in `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js`:
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

## Phase 4: Regression spec + docs

- [ ] Desktop spec under `tests/desktop/`, following `docs/testing-desktop-specs.md`.
      Assert the eligible count on the menu label, the disabled state with no
      remembered op, and that N cue-all clicks produce N queued jobs. Stub at the
      dispatch boundary — the spec must not need a GPU.
      **Verify:** `npm run test:desktop` passes with the new spec, and it fails when
      the eligibility helper is made to return everything.
- [ ] Document the feature in `docs/gallery.md` (selection section): the trigger, the
      eligibility rule, the remembered-op read, the click-order caveat, and the loop
      refusal. Keep the file under the 200-line rule; split if it crosses.
      **Verify:** `docs/gallery.md` line count checked, and the entry names symbols
      that exist.

## Plan Drift

- None yet.

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
