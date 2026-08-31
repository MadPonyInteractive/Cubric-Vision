# MPI-591 Checklist

Derived from `plan.md` phases 2026-08-31. Each phase has one gate in the plan;
do not tick an item until its gate is green.

- [x] 1 — Bench: seam proven on `ref2va` against the pack as oracle. Six arms run;
      **E (masked prefix + a single frame-0 guide) is the route** — fully stock, no
      pack, no patch. Head preserved at PSNR ~38 dB. **Gate still open: Fabio has
      not judged the clips, and only a MOVING shot was run — a static one is owed.**
- [ ] 2 — The masked-prefix node in `ComfyUi-MpiNodes` (`h3.py`, sibling repo at
      `c:\AI\Mpi\ComfyUi-MpiNodes`, NOT covered by this card's `files.json`).
      Written + registered, self-check green, UNCOMMITTED. Also needs
      `MpiH3EncodeAV` (~10 lines) so the shipped graph does not depend on the pack.
      Gate: committed → pushed → `node_lock.json` commit bumped off `5e07043`.
- [ ] 3 — The workflow file `comfy_workflows/raw/flow_h3_extend.json` + API
      export. No `Input_Negative` node. Gate: `tests/inject-params-titles.test.cjs`
      extended and green.
- [ ] 4 — Wire the pick: `byModel` + `getUniversalWorkflow(key, modelIds)` +
      the `flowsRegistry` slot. Gate: `tests/flow-model-choice.test.cjs` green.
- [ ] 5 — Verify in an isolated app. Gate: Fabio watches one H3 extend end to end.
- [ ] 6 — Docs: `existing-flows/ltx-extend.md` + `any-of-models.md`.

## Phase 1/2 ordering — decided 2026-08-31

The plan's Phase 1 says "build the masked-prefix graph by hand". It cannot be
built from existing nodes: a live `/object_info` probe on the bench (core 0.34.2)
shows no node composing a masked prefix — core has `MiniMaxH3AddGuide`,
`MiniMaxH3ReferenceToVideo`, `EmptyMiniMaxH3LatentAV`, `MiniMaxH3SigmaShift`, and
ours are only `MpiH3Length` / `MpiH3References`. `MiniMaxH3VideoExtend` and
`MiniMaxH3EncodeAV` are fork-only.

So the Phase 2 node is written FIRST, directly in `ComfyUi-MpiNodes/h3.py`, which
is symlinked into the bench `custom_nodes/` and therefore live on restart. Phase 2
then reduces to commit → push → pin. Fabio approved 2026-08-31; that approval is
also what moved this card into `doing` at Phase 1 rather than Phase 2.

## Phase 1 running notes

Bench = `G:\ComfyUi\ComfyUI` on `:8188` (PID confirmed by CommandLine, not by
port alone). Bench writes to `D:\WORK\Images\Outputs`, never `<ComfyUI>\output`.
