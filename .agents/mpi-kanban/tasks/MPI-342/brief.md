# MPI-342 — Bump ComfyUI v0.27.0 → v0.28.0

## Why

**Resolved 2026-07-23 (user checked the video):** the Krea2 storyboard/inpainting
capability is NOT gated on ComfyUI core. It is `Krea2 Edit (grounded)` (+ `grounding_px`,
`system_prompt`) from **`comfyui-krea2edit`** — a node we ALREADY ship, pinned at commit
`17af88332728c97ab5c7d26296b2cae59c935976` — driving the **`krea2_identity_edit_v1_2`
LoRA we already ship**, with the `qwen3vl_4b_fp8_scaled` CLIP we already ship. No new
weight, no ModelDef change. If the grounded variant is missing from our pin, that is a
**node-commit bump in `node_lock.json` only** — `installRequirements:false` means it rides
the volume, so it needs NO image rebuild (`.claude/rules/comfy_engine.md` § bake vs volume).
**Check that first** — it may be reachable today, independent of everything below.

So the bump stands on its own merits (user: "there are a lot of improvements in 0.28,
specifically int8, and it might help with other things"). From the v0.28.0 notes
(Comfy-Org/ComfyUI, ~2026-07-15 — **no breaking changes stated**):

1. **`Qwen3-VL` tokenizer crash fixes.** The most directly relevant item: we ship
   `qwen3vl_4b` as the Krea2 edit CLIP *and* as the image describer.
2. **int8/int4:** "more optimized int8 and int4 on turing" (#14927), int8 perf-regression
   fix on 16xx (#14941), convrot int4 support (#14859), black-image-on-Turing-with-int4 fix
   (#14864). Honest scope: Turing/16xx = **older LOCAL GPUs**. Pods run Ada/Blackwell, so
   these are a local-user win, not a Pod speedup — don't size the card on Pod gains. We do
   ship an int8 story for Krea2 (`docs/models/krea2/int8-quant.md`).
3. **Support PID 1.5 models** (#14894) — the NVIDIA PID upscaler wave.
4. Small speedup for text-model sampling (#14773); VAE dynamic-method `AttributeError` fix;
   new core nodes (text overlay, Save Text, Save 3D advanced, SeedVR2, bounding-box input).

## The pin rule (memory `project_comfyui_bump_cadence`) — apply BEFORE choosing 0.28

Model support trails across minors: a node often lands one or two releases AFTER the model
first appears. So do not bump to "the version that has the one node we noticed" — research
the exact minor each node in the near-term wave needs and pin to the HIGHEST floor, once.
Check at least: the Krea2 edit/inpaint node (above), MPI-339 (NSFW LTX 2.3), MPI-323
(FLUX.2 Klein 4B removal), and anything MPI-4 / MPI-259 still wants. If any of them needs
>0.28, take that version instead — one bump per wave, not two.

## Pins to move (all of them, one pass)

| File | Field | From |
|---|---|---|
| `dev_configs/node_lock.json` | `comfyui.core.tag` + `.commit` | `v0.27.0` / `bb131be9e83d2f773c90f1d6f1e4b248a498c8c5` |
| `dev_configs/node_lock.json` | `comfyui.frontend` pins | `comfyui-frontend-package 1.45.20`, `comfyui-workflow-templates 0.11.1` — take what 0.28 ships |
| `dev_configs/system_dependencies.json` | `comfyui.version` | `0.27.0` (LOCAL engine) |
| `mpi-ci/cubric-vision-pod/node_lock.json` | whole file | copied fresh from the canonical lock every build (MPI-117) |
| `mpi-ci/cubric-vision-builder/Dockerfile` | `COMFYUI_REF` | `eca4757…` (v0.25.1) — **that is MPI-183**, retarget it 0.27.0 → 0.28.0 |
| `routes/remotePodLifecycle.js` | `POD_IMAGE_VERSION_DEV` / `_CPU_DEV` | after the dev image builds (MPI-340) |

The core `commit` must be the SHA of the v0.28.0 tag, but the **CI input is the TAG** —
`git clone --branch` rejects a bare SHA (`exit 128`, the MPI-189 first-build failure).

## Execution — build it as ONE dev image, bundled with MPI-341

MPI-341 (node-import smoke test + constraints torch pin) is already scoped to "build to the
dev tag, do not rebuild the released v0.16.0". A ComfyUI core bump is a baked layer too. So
both land in a **single CI dispatch** at `manifest_version=0.17.0-dev`, both legs (GPU +
CPU — the `v0.10.3-cpu` 404 trap). Two separate dev builds would be a wasted cycle, and
MPI-341's smoke test is exactly what should be guarding a core bump.

Bonus: that build is also the last untested leg of MPI-340 — the dev IMAGE tag path has
only ever resolved a tag equal to the stable pin. Building a real `-dev` tag proves it.

Order of operations: `/build-pod-image` (step 1 → **dev** build) → verify on a dev Pod from
a source run → then a clean rebuild at a real version when the wave is ready to ship.

## Verify

- ComfyUI boot log reports 0.28.0; MPI-341's `--quick-test-for-ci` passes at build (that IS
  the regression net for a core bump: a node that no longer imports on 0.28 fails the build
  instead of dying live as `Node 'X' not found`).
- Every workflow still loads: LTX 2.3 (MPI-4), Krea2 t2i + edit + masked edit, Qwen-Edit,
  Head Swap. A core bump moves node schemas — a silently renamed input is the failure mode.
- Krea2 masked edit still stitches with no seam (MPI-282 acceptance).
- Local engine on 0.28 too (`system_dependencies.json`) — do not let LOCAL and Pod drift.

## NOT in this card

Wiring the Krea2 grounded/storyboard/inpainting behavior. That is a `comfyui-krea2edit`
node-commit question (see above), NOT a core-version question — it gets its own card and
probably needs no image at all. Keep the bump verifiable on its own: a core bump that also
ships a feature is a bisect nightmare when a workflow breaks.

## Related

- MPI-341 — build hardening; same dev image.
- MPI-183 — Builder parity; retarget to 0.28.0 and use the same core SHA.
- MPI-282 — Krea2 masked edit, the thing that wanted the 0.28 node.
- `docs/builder/02-image-and-rebuild.md`, `.claude/commands/build-pod-image.md` (Flow A).
