# MPI-466 - checklist

Derived from `brief.md`, 2026-08-07. Order matters: the graph has to exist before the
ModelDef can point at it, and nothing can be tested until the dep resolves.

## 1. R2 + the dep

- [ ] Upload `ltx-2.3-22b-distilled-1.1_transformer_only_int8_convrot.safetensors`
      (21,505,993,424 B) to `cubric-r2:cubric-models/vision/models/diffusion_models/`
- [x] sha256 computed and pinned in the dep entry
- [ ] `HEAD` the public URL and confirm `content-length` matches the local byte count
- [x] `ltx23-transformer-int8` added to `modelDeps.js`; `-fp8` and `-mxfp8` removed
      (sweep every consumer, not just `models.js`)

## 2. The graph

- [x] `raw/ltx_i2v_t2v_template.json` -> API via `scripts/workflow-to-api.mjs` against a
      live `/object_info`
- [x] `generate_ltx.py` updated: ONE file, no `_fp8`/`_mxfp8` suffix, no `_stage2` twin
- [x] The ~18 muted/bypassed nodes normalized -- by the CONVERTER, not the generator:
      `workflow-to-api.mjs` drops mode 2/4 nodes exactly as the ComfyUI frontend does
      (215 LiteGraph nodes -> 123 API nodes)
- [x] Old runtime files deleted (6 t2v/i2v x arch + 6 `_stage2`)
- [x] Verify: `validate-injection-rules.mjs` passes on both files

## 3. models.js

- [x] `ltx-23-balanced` deps: int8 in, arch block DELETED
- [x] `capabilities.singleFileStages: true` on both LTX cards
- [x] `workflows` collapsed to the single file
- [x] `ltx-23` (bf16 High) points at the same graph

## 4. Prove it

- [x] `npm test` green
- [ ] One generation THROUGH THE APP - and read the DISPATCHED graph off `/queue` to
      confirm every `Input_*` landed. Injection skips an unmatched title silently, so a
      run that merely finishes is not evidence
- [ ] Preview -> Continue exercises `MpiStageLatents` end to end
- [ ] This also closes MPI-465's last open item

## Coordination

A parallel session is deprecating WAN text-to-video in `js/data/modelConstants/models.js`.
Re-read that file immediately before every write, and commit by explicit pathspec.
