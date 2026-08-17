# MPI-325 Checklist

- [x] Phase 1 - `allowOverflow` on cropTool (position clamps only; MpiVideoViewer untouched)
- [x] Phase 2 - MpiStepBox honours `step.overflow`, `_normToSourcePx` stops edge-clamping
- [x] Phase 3 - node half: MpiBox x/y min widened, MpiBoxCrop optional `pad`
- [x] Phase 4 - wire it (steps declare `overflow`, node 89 `pad: true`, injector origin guard)
- [x] Phase 5 - doc drift in `ui/box-gizmo.md` (§ Out of bounds CLAMPS now says the opposite)

## Blocked on the user

- [ ] Push + pin `ComfyUi-MpiNodes` in `dev_configs/node_lock.json` (push is user-authorized).
      Until then the graph sends `pad: true` to a node that does not declare it - ComfyUI
      drops it silently, so an off-frame box hands the model a squashed reference head.
- [ ] One real Head Swap generation through an overhanging box (GPU; ruled out this session).
      Steps in `validation.md` § NOT verified.
