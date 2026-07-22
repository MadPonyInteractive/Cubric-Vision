# MPI-337 — Validation & MPI-END checklist

Verify mode: **user-ux**. Code complete, logic + unit verified, **NOT committed**.
Resume here to finish.

## Files touched (commit set — 6 files)

1. `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` — (a) removed
   force-DOWN fallback in `_refreshOpOptions`.
2. `js/components/Organisms/MpiPromptBox/MpiPromptBox.js` — (b) removed force-DOWN
   branch in `_emitMediaChange`; deleted orphaned `_pickTextOnlyOp`.
3. `js/services/generationService.js` — (c) `requiresMask` run-guard (`_needsMaskButHasNone`
   + `_warnMissingMask`) at enqueue + dispatch.
4. `js/shell/navigation.js` — (d) `_mapOpsToRadialItems` + `_buildGalleryItems` pass
   `disabled` through (dim-not-hide), both workspaces.
5. `js/components/Primitives/MpiRadialMenu/MpiRadialMenu.js` (+ `.css`) — (d) dimmed,
   non-selectable disabled item state; resolver skips disabled indices.
6. `js/data/commandRegistry.js` — (e) availability UPPER bound (`_maxMediaSlots`); op
   now needs `count <= #slots` of that type, not just `>= requires*`.

## Live-test matrix (USER — must be felt in `npm start` Electron)

History / Gallery (image):
- [ ] `detail`, load maskless card → stays `detail` (no upscale flip). Paint mask → runs.
- [ ] `detail` no mask, Run → mask toast, no dispatch.
- [ ] image op, remove image → op stays put; Run → "Add an image…" toast.
- [ ] t2i, drop image → force-UP to media op (unchanged).
- [ ] Radial both workspaces: all ops present, unavailable dimmed + non-selectable,
      positions do NOT shift.
- [ ] KREA 2 chips: only `edit` live; i2i/depth(poseReference)/upscale dimmed.

Video (LTX 2.3 = `t2v_ms`/`i2v_ms`, audio:true):
- [ ] no media → `t2v_ms` live, `i2v_ms` dimmed (needs image); run t2v works.
- [ ] drop 1 image → force-UP to `i2v_ms`; `t2v_ms` dims.
- [ ] drop 2nd → stays `i2v_ms` (2 frame slots); 3rd → evicted, still 2.
- [ ] radial each step: both ops present, one dimmed, positions stable.
- **Coverage:** LTX test validates `wan-22` directly (identical `t2v_ms`/`i2v_ms`).
  `wan22-5b` uses plain `t2v`/`i2v` — same slot shape, already covered by the
  automated `mpi337_video_gate.mjs`. So one LTX pass = all 4 video models.

Auto-verify already PASSED (scratchpad, real registry): `mpi337_gate.mjs` (image
2-chip gate), `mpi337_video_gate.mjs` (i2v@3 / extend@2 / t2v), `mpi337_ltx_gate.mjs`.

## MPI-END doc checklist (future-proofing — the ask: new ops auto-gate)

The gating is now **fully data-driven**: an op that declares correct `mediaInputs`
(slot list) + `requiresImages`/`requiresVideo`/`requiresMask` in `commandRegistry.js`
AUTOMATICALLY (1) enters the radial + dropdown via `getAvailableCommands`, (2) gets
min+MAX+mask gating, (3) dims-not-hides when unavailable, (4) Run-toasts a missing
mask. **No per-op radial wiring.** The one trap: **max capacity of a type = the number
of `mediaInputs` slots of that type** — wrong slot count = wrong gate (e.g. a 2-image
op with 1 declared slot would gate at 1). Document this so future authors know slot
count == capacity.

- [ ] `docs/playbooks/add-model/04-ops-and-controls.md` — after the media-slot checklist
      item (~L145): add that availability/radial/mask-gating derives from `mediaInputs`
      slot count + `requires*` (MPI-337); slot count = capacity; no radial wiring needed.
- [ ] `docs/playbooks/add-app/01-descriptor-and-ops.md` — same note for universal ops
      (they also flow through the two-bound gate when they appear in an op surface;
      note that `universal:true` ops are EXCLUDED from `getAvailableCommands`, so they
      are NOT on the model op radial — their media handling is the app's own).
- [ ] `docs/generation-lifecycle.md` and/or `docs/component-contracts.md` (PromptBox):
      record the op-change contract — a LOST requirement never switches the op (op stays
      selected + dimmed; Run toasts the missing input); op changes only on media-add
      force-UP + Reuse. (MPI-337 Option A.)
- [ ] **`.claude/rules/` — ASK USER FIRST (CLAUDE.md rule 5).** Op-selection/radial wiring
      changed. Candidates: `component-events.md` (radial disabled-item + no force-DOWN),
      `components.md` (radial primitive disabled state). Do NOT edit without explicit OK.

## Coordination

- MPI-338 (dev Ctrl+Tab radial) depends on this card's `MpiRadialMenu` item-state work
  — the `_itemDisabled` + dimmed-item state is now available to reuse.
