# MPI-466 - checklist

Derived from `brief.md`, 2026-08-07. Order matters: the graph has to exist before the
ModelDef can point at it, and nothing can be tested until the dep resolves.

## 1. R2 + the dep

- [x] Upload `ltx-2.3-22b-distilled-1.1_transformer_only_int8_convrot.safetensors`
      (21,505,993,424 B) to `cubric-r2:cubric-models/vision/models/diffusion_models/`
      -- DONE 2026-08-07 05:55Z, `Multi-thread Copied (new)` at the 3 MB/s cap
- [x] sha256 computed and pinned in the dep entry
- [x] `HEAD` the public URL -- `HTTP/1.1 200`, `Content-Length: 21505993424`, byte-exact
      to the local file and to the sha256 pinned in the dep
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

- [x] `npm test` green — 482/482 after the two fixes below
- [x] One generation THROUGH THE APP - and read the DISPATCHED graph off `/queue` to
      confirm every `Input_*` landed. Injection skips an unmatched title silently, so a
      run that merely finishes is not evidence
      -> 22/22 titles landed, 126 dispatched == 126 shipped, `457:videos` produced
- [x] Preview -> Continue exercises `MpiStageLatents` end to end
      -> preview wrote `470:Output_Preview`; continue dispatched `is_continue:true` with
         the staged UUID latent and emitted NO stage-1 latent
- [x] This also closes MPI-465's last open item
- [x] `PROGRESS_STAGES` re-measured per run mode off each run's own `/history` window:
      single 3, preview 2, **stage2 1 -> 3** (corrected; `output-prompt-capture` probe
      updated with it)

## Three defects fixed to get there — none in the LTX re-wire itself

- [x] MUTED reroutes in the export severed `VAEDecode.samples`, `LTXVAudioVAEDecode.samples`
      and both `CFGGuider.model` -> every output ignored. **Mute severs, bypass passes
      through.** Fixed by re-export
- [x] `workflow-to-api.mjs` treated a V3 union widget type (`"FLOAT,INT"`) as a SOCKET —
      emitted nothing AND consumed no positional value, shifting every later widget by one
      (`batch_size: 24` was the frame rate). Fixed + a conversion gate added that checks
      every node against the same `/object_info` it converted with
- [x] `_inject` clobbered the wired `MpiStageLatents.latent` with the load filename ->
      `TypeError: string indices must be integers`. Fixed on both injection paths;
      FLEET-WIDE (H3 + WAN carry the same node). Pinned by
      `tests/inject-never-clobbers-link.test.cjs`

## Coordination

A parallel session is deprecating WAN text-to-video in `js/data/modelConstants/models.js`.
Re-read that file immediately before every write, and commit by explicit pathspec.
