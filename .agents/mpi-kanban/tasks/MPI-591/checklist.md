# MPI-591 Checklist

Derived from `plan.md` phases 2026-08-31. Each phase has one gate in the plan;
do not tick an item until its gate is green.

- [x] 1 — Bench: seam proven on `ref2va`. **GATE PASSED by Fabio 2026-09-01 on arm
      F2** — and the route is NOT the E/G masked prefix this line used to name. F2 is
      stock `MiniMaxH3ReferenceToVideo` generating the new frames only, the source's
      last frame pinned with `MiniMaxH3AddGuide`, the source's audio in as
      `ref_audio_1`, and a PIXEL join. Nothing is written into the denoised latent, so
      the sparkle cannot occur: flash 1.05 mean / 2.03 worst against E/G's 5.37/18.51,
      seam 0.94x against the oracle's 1.40x, audio 0.973 band cosine. Thirteen arms in
      total. The masked-prefix route is dead for v1 (its nodes stay in MpiNodes,
      shipped and unused by this Flow), and with it the sparkle defect leaves this
      card's path.
- [x] 2 — The nodes in `ComfyUi-MpiNodes` (`h3.py`, sibling repo at
      `c:\AI\Mpi\ComfyUi-MpiNodes`, NOT covered by this card's `files.json`).
      `MpiH3MaskedPrefix` `f6d2484`, `MpiH3EncodeAV` `952919f`, changelog + README
      `53c0198`. Both verified REGISTERED on a live restarted bench, and the encode
      proven **bit-identical** to the pack's (`PSNR y:inf`). **Pin bumped off
      `5e07043` to `53c0198`**, archive URL 200. Gate green.
      Carried forward: `MpiH3MaskedPrefix` has an OPEN sparkle defect (see plan) —
      it does not block the pin, because no shipped graph calls it until Phase 3.
- [x] 3 — The workflow file `comfy_workflows/raw/flow_h3_extend.json` + API export,
      33 nodes, arm F2's graph. No `Input_Negative` node — the new test asserts its
      ABSENCE, not just the presence of the rest. Gate green:
      `tests/inject-params-titles.test.cjs` 22/22, `verify-workflow.mjs` and
      `validate-injection-rules.mjs` both ✓ against **48188** (the shipped engine),
      raw → API round trip **0 differences**, and the graph RAN on the bench in 70 s
      (94 frames, seam 0.65x, generated audio 0.989 vs source).
- [ ] 3b — fps, DECIDED by Fabio 2026-09-01: convert the source to 24 so both halves
      are true 24 fps. Add `force_rate` to `MpiLoadVideo` (sibling repo,
      `/mpi-nodes-sync`, then bump the pin), then set `Input_Video.force_rate = 24`
      and `MpiSaveVideo.fps` to a constant 24 in `flow_h3_extend`. Gate: the raw
      round trip and the bench run re-earned, since the graph changes.
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
