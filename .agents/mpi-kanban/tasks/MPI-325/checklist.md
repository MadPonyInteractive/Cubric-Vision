# MPI-325 Checklist

- [x] Phase 1 - `allowOverflow` on cropTool (position clamps only; MpiVideoViewer untouched)
- [x] Phase 2 - MpiStepBox honours `step.overflow`, `_normToSourcePx` stops edge-clamping
- [x] Phase 3 - node half: MpiBox x/y min widened, MpiBoxCrop optional `pad`
- [x] Phase 4 - wire it (steps declare `overflow`, node 89 `pad: true`, injector origin guard)
- [x] Phase 5 - doc drift in `ui/box-gizmo.md` (§ Out of bounds CLAMPS now says the opposite)

## Blocked on the user

- [x] Push + pin `ComfyUi-MpiNodes` in `dev_configs/node_lock.json` - DONE 2026-08-17.
      Fabio authorized it; `38b3a27` is on `origin/main` (branch is `main`, not master) and
      the pin now names it, so the released engine installs the node that declares `pad`.
- [x] One real Head Swap generation through an overhanging box - PASSED 2026-08-17.
      No padded strip on the delivered image. `/history` shows node 89 got `pad: true`
      and the reference box dispatched at 1354 square, origin `-267,-5` - over the image
      WIDTH and off-frame on both axes, so both fixes ran in one dispatch.

## Folded in this session (same files, same system)

- [x] Box may grow past the frame, capped at the media's LONGEST edge (Fabio's rule -
      a square on a portrait must pass the WIDTH to take in hair or a neck tattoo).
      Verified live: readout `1354 x 1354` on a 768x1354 portrait.
- [x] Root fix under it: normalized space is where the media RENDERS, not the padded
      canvas. The old fit scaled every coord up by the padding (~18%), so the drawn box
      was not the crop the readout promised.
- [x] `skipLocalEngine` no longer disables node-drift repair: boot clears a stale flag,
      Settings greys the switch once an engine is installed. NOT yet seen live.
