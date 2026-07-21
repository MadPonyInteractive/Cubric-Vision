# MPI-330 Validation

## Root cause (confirmed structurally, hypothesis A — no Pod involved)

Sticky ORDINAL slot roles. Chain:

1. `_saveMedia` (MpiPromptBox) persists the DERIVED roles from `_withAssignedRoles()` — so after any nav/reload/reuse, every chip carries an explicit role tag (`inputImage`, `inputImage2`, `inputImage3`).
2. `_removeItem` splices the chip but never touches the survivors' role tags. Removing chip 1 (role `inputImage`) leaves chips tagged `inputImage2`/`inputImage3`.
3. Both slot-assignment twins (`_withAssignedRoles` in MpiPromptBox AND the role-first passes in `commandExecutor._buildParams`) honor explicit roles FIRST. All surviving items get consumed by slots 2/3; the required `inputImage` slot finds nothing → `Input_Image` never injected.
4. Qwen-Edit's `Input_Image` MpiLoadImageFromPath is `block_if_empty:true` → ExecutionBlocked → zero output → card silently discarded (`Generation completed but no output returned`).

Why intermittent: fresh drops carry NO role — the bug needs role-tagged chips, i.e. chips restored after nav/reload or injected via reuse. Pod deletion timing was coincidence. "Changing the image chip" fixed it because the new chip was untagged and filled slot 1.

The reorder feature (`d52e7b90`) itself was NOT the direct bug — `_moveMediaItem` deletes all roles then re-derives by order. But the same commit's premise ("strip order is the source of truth") was only applied on reorder, never on removal.

## Fix (2026-07-22)

- `commandRegistry.js`: `ordinal: true` on qwenEdit + krea2Edit image slots; new `stripOrdinalMediaRoles(slots, items)` — drops role tags pointing at ordinal slots so positional fill (= chip badge order) always wins. Semantic roles (startFrame/endFrame, Head Swap image1/image2) stay sticky — MPI-306 sparse-slot contract preserved.
- `MpiPromptBox._withAssignedRoles` + `commandExecutor._buildParams`: both twins strip ordinal roles before assignment (engine-agnostic — runs upstream of local/remote split).
- Silent-discard UX: dispatch guard in `commandExecutor.executeCommand` — a REQUIRED media slot with no assigned asset while matching media IS attached → `ui:warning` toast ("Could not load the input image...") + clean abort, instead of a vanishing card. Gated on media presence so stage-2 latent runs / media-less dispatches never trip it.
- Regression test: `tests/media-slot-ordinal-roles.test.cjs` (repro precondition + fix + sticky-role preservation). 12/12 pass incl. adjacent injection tests.

## Manual validation steps (user)

1. Qwen-Edit: attach 2–3 image chips, navigate away and back (or reload) so roles persist, remove the FIRST chip, generate → must produce output; result must use the chip shown as badge "1".
2. Reorder chips via drag, generate → injection order must match badges.
3. i2v start/end frames: set an end frame, swap start/end via the swap control → must still swap (sticky roles untouched).
4. Head Swap app: still swaps in the right direction with only source or only target present.
5. Negative check: with a chip whose file is unresolvable, generate → warning toast, no vanishing card.

## Out of scope / left open

- Hypothesis B (stale Pod-uploaded path after Pod delete): the guard only catches EMPTY slots, not resolvable-looking-but-dead paths. If it recurs post-fix, that's the remaining suspect.
- MPI-312 (chip labels show bare numbers on krea2 edit) — separate card.
