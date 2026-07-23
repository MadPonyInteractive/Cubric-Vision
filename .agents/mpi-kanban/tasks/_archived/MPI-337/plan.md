# Simplify operation-forcing — keep the user's op, tell them what's missing

## Current State

Project mode: scalable-foundation.

Six places auto-switch the active op today. The op yanks out from under the user
whenever a *requirement is lost*, which is the reported annoyance (on `detail`,
load a maskless History card → flips to `upscale`; paint a mask → stuck on
upscale).

Approved design (brainstorm, Option A): **the op changes ONLY on (1) adding
media a text op can't use (force-UP, kept) and (2) Reuse Prompt. A lost
requirement never switches — the op stays selected and Run toasts the missing
input.**

Entry points (verify line numbers at edit time — the repo moves):
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`
  `_refreshOpOptions()` (~L812-838) — the `if (!currentStillOk) { fallback… }`
  force (~L826-832) is the detail→upscale bug.
- `js/components/Organisms/MpiPromptBox/MpiPromptBox.js` `_emitMediaChange()`
  (~L262-306) — the `else if (!hasMedia && …)` branch (~L279-290) is the
  force-DOWN to a text op. The `if (hasMedia && curIsTextOnly)` branch above it
  is force-UP (KEEP).
- `js/services/generationService.js` — `_findMissingMediaSlot` /
  `_warnMissingMediaSlot` (~L108-122) + the two guard sites (enqueue ~L446,
  dispatch ~L716). Covers image/video/audio slots; NO mask guard exists.
  `requiresMask` ops = `detail`, `change`, `remove` (`js/data/commandRegistry.js`).
- `js/shell/navigation.js` `_mapOpsToRadialItems` (L91-95) —
  `.filter(o => !o.disabled)` hides unavailable ops (positions shift).
- `js/components/Primitives/MpiRadialMenu/MpiRadialMenu.js` — no disabled-item
  state today; item render at ~L125.

Conventions in play (`.claude/rules/`): `Events.on/emit` (store+call unsub),
`js/utils/dom.js` `on()`, `js/utils/icons.js`, BEM, no bare `console.log`
(`clientLogger`), no hardcoded colors (`styles/01_base.css` tokens). Root-cause
rule: this is a shared-primitive touch (op-selection) — sweep gallery + history
consumers of `_emitMediaChange` / `updateContext`, not just the reported site.

## Implementation

- [x] **Kill force-DOWN, keep force-UP, and gate Run on mask.** (a) In
  `_refreshOpOptions`, remove the `!currentStillOk → fallback` force so the
  active op is preserved even when disabled; let it render disabled in the
  dropdown (already supported) and radial. Keep the `_preferredOperation`
  up-restore only if still needed (with force-DOWN gone, activeOp already ==
  preferred — remove it if it becomes dead). (b) In `_emitMediaChange`, delete
  the media-removed → text-op branch; keep the media-added → media-op branch.
  Confirm the History `filterNoInputOps` (MPI-281) path still behaves — it
  should simplify, not conflict. (c) In `generationService`, add a
  `requiresMask` guard mirroring the media guard: read `commandRegistry`
  `requiresMask` for the op, and if no `maskDataUrl` in the config, emit
  `ui:warning` "Paint a mask before generating — this operation needs one" and
  abort dispatch — at BOTH the enqueue (~L446) and dispatch (~L716) sites, same
  copy. (d) In `_mapOpsToRadialItems`, stop filtering disabled ops; pass a
  `disabled` flag through; add a dimmed, non-selectable item state to
  `MpiRadialMenu` (dim via `styles/01_base.css` tokens; block the select/emit
  path for disabled items). Radial op positions must be stable across
  availability changes. Run affordance stays toast-on-click (no live-disabled
  button). Sweep the gallery PromptBox path (`MpiGalleryBlock`
  `updateContext hasMask:false`) to confirm no gallery regression.
  **Verify:** see `## Verification`.

## Completed

- [x] (a) `MpiGroupHistoryBlock._refreshOpOptions` — removed the
  `!currentStillOk → fallback` force. Active op now stays selected (renders
  disabled) when it loses a requirement. Preferred-restore kept (still live:
  manual dropdown pick remembers `_preferredOperation`, so it never yanks a
  user choice).
- [x] (b) `MpiPromptBox._emitMediaChange` — deleted the media-removed → text-op
  force-DOWN branch; kept media-added → media-op force-UP. Orphaned
  `_pickTextOnlyOp` removed. MPI-281 pin subsumed (nothing forces down now).
- [x] (c) `generationService` — added `_needsMaskButHasNone` + `_warnMissingMask`
  (mirror of `_findMissingMediaSlot`/`_warnMissingMediaSlot`); guard fires at
  BOTH enqueue (~L457) and dispatch (~L722). Mask travels as `config.maskDataUrl`
  (verified end-to-end to `commandExecutor` `Input_Mask`) so no valid run is
  false-blocked.
- [x] (d) Radial — `_mapOpsToRadialItems` passes `disabled` through (no more
  `.filter`); `MpiRadialMenu` tracks `_itemDisabled[]`, renders
  `.mpi-radial__item--disabled` (dimmed 0.28), and the resolver skips disabled
  indices (incl. single-item case) so positions stay stable and dimmed ops can't
  be highlighted/selected.

- [x] (d.2) Gallery radial parity (user-caught: plan scoped radial to History
  only). `_buildGalleryItems` now maps every op with `disabled = !cmd.available
  || (hasMedia && isTextOnly)` instead of `.filter`-hiding — same dim-not-hide,
  stable-position treatment as History. MpiRadialMenu already consumes `disabled`
  so no extra wiring.
- [x] (e) Op availability UPPER bound (user-caught: only the MIN was gated).
  `getAvailableCommands` now also requires `count <= maxSlots` where maxSlots =
  # of declared input slots of that type (`_maxMediaSlots` helper). i2i/depth
  (poseReference)/upscale = 1 image slot, so they gate at 2 chips; only krea2Edit
  (2) / qwenEdit (3) stay available. This makes the dim-not-hide correct — the
  1-slot ops now render dimmed + non-selectable with 2 chips staged. Shared
  primitive: swept all 5 consumers (History `_opOptions`, gallery, PromptBox
  dropdown/`_pickOpForModel`/`_pickFallbackOp`) — all read `available` for
  disabling or already cap via `_maxMediaForOperation`, so they agree; force-UP
  uses `_maxMediaForOperation` (not `available`) → unaffected. Self-check:
  scratchpad `mpi337_gate.mjs` asserts the 2-chip gate + min/mask unchanged — PASS.
  Video verified too (`mpi337_video_gate.mjs`): i2v gates at 3 frames (2 slots),
  extend gates at 2 videos (1 slot), t2v gates once media staged — PASS. The
  universal/app ops (interpolate/videoUpscale/resizeVideo/appVideoStitch,
  `universal:true`) are outside getAvailableCommands, so not part of the op-switch
  surface — no gap.

Auto-verify done: `node --check` clean on all 5 files; guard trace
`getCommand('detail').requiresMask === true`; blast-radius swept (gallery
PromptBox shares the force-DOWN removal — consistent with Option A; KNOWN-EDGE
gallery masked-Reuse now fails gracefully with the mask toast instead of an
empty run).

## Remaining Work

- USER-UX pass in running Electron app (`npm start`) — the 5 checks under
  `## Verification`. Verify mode = user-ux; code is logic-verified only.

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux

Auto (agent, before handing to the user): `node --check` on every edited JS
file; grep that no other consumer relied on the deleted force-DOWN / radial
filter; confirm the mask guard fires on a `detail` op with no `maskDataUrl`
(unit-trace the guard).

User-UX (must be felt in the running Electron app, `npm start`):
1. History workspace, `detail` op → load a card with NO mask → op **stays
   `detail`** (does NOT flip to upscale). Paint a mask → still `detail`, Run
   works.
2. On `detail` with no mask, press Run → toast "Paint a mask before
   generating…", nothing dispatches.
3. On an image op, remove the only image → op **stays put** (no force to a text
   op); press Run → existing "Add an image…" toast.
4. On a text op (t2i), drop an image → still force-UP to a media op (unchanged).
5. Radial (Tab in History): all ops always present; unavailable ones dimmed +
   non-selectable; positions do NOT shift as mask/media availability changes.

## Preservation Notes

- If the `_emitMediaChange` / `_refreshOpOptions` contract changes (events,
  op-selection wiring), CLAUDE.md rule 5 requires asking the user before
  updating `.claude/rules/`. Candidate docs: `docs/generation-lifecycle.md`,
  `docs/component-contracts.md` (PromptBox), `.claude/rules/component-events.md`.
- MPI-338 (dev-only Ctrl+Tab radial) depends on this card's radial changes —
  coordinate the `MpiRadialMenu` item-state work so 338 can reuse it.
- Update memory `project_media_roles_agnostic_op_fit_by_count` neighborhood only
  if the op-fit behavior it documents changes materially.
