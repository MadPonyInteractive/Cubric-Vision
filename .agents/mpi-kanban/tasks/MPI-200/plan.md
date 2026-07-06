# LTX transformer quality tiers: bf16 (high) + fp8_scaled/mxfp8 (balanced)

## Current State

Follow-up to MPI-197 (closed): the 48s@10s / 116s@20s stage boundary on 32GB is
**structural bf16 eviction** — the 42GB bf16 transformer never fits 32GB, so aimdo
thrashes on every stage-2 swap. A transformer that FITS kills the eviction class.
User decision 2026-07-05: ship a **balanced tier** (smaller transformer) alongside
the current **high tier** (bf16, quality ceiling).

**Design settled this session (no open decisions):**

- **Tier UX = separate model cards, same `modelFamily: 'LTX-2.3'`.** This is the
  paved road (`sizeTier` contract in models.js line 11: "a model has ONE tier;
  siblings ship as separate cards"; L/B/H badge + dropdown letter already built,
  consumed by MpiModelManager.js + MpiPromptBox.js). Existing `ltx-23` card →
  `sizeTier: 'high'`. NEW `ltx-23-balanced` card → `sizeTier: 'balanced'`.
- **Arch auto-select INSIDE the balanced card** (a second axis the sizeTier system
  does not cover): Blackwell (`rtx 50xx`) → `mxfp8_block32` weight + `weight_dtype:
  mxfp8`; Ada/Ampere/Turing (`rtx 20–40xx`) → `fp8_scaled` weight + `weight_dtype:
  default`. Only ONE balanced weight installs/downloads per machine.
- **12 workflow files** = 4 mode/stage (i2v/t2v × stage1/stage2) × 3 variants
  (bf16/fp8/mxfp8). **Only the `UNETLoader` node changes** (`unet_name` +
  `weight_dtype`) — CLIP (shared gemma fp4), VAEs, samplers, gates all identical.
  bf16 files keep current unsuffixed names (`LTX_t2v.json` …) = zero churn on the
  high card. New files get `_fp8` / `_mxfp8` suffix (`LTX_t2v_fp8.json`,
  `LTX_t2v_mxfp8.json`, × i2v × stage2).
- **Weights** = Kijai comfy-format files ONLY (official Lightricks fp8 repo is
  broken — fp8_scaled_mm layout bug, garbled output). Two new deps to R2 via the
  add-model playbook, NOT HF at build time:
  - `ltx-2.3-22b-distilled-1.1_transformer_only_fp8_scaled.safetensors` (25.2GB)
  - `ltx-2.3-22b-distilled-1.1_transformer_only_mxfp8_block32.safetensors` (24.1GB)
- New model entries are **NOT version-bumped** (models are never version-bumped).
- **SKIPPED (agreed):** the free `fp8_e4m3fn_fast` cast probe — the bf16 file stays
  42GB in VRAM regardless of `weight_dtype`, so it never fits 32GB; the cast speeds
  matmul, not the fit. Probe measures the wrong axis. Real smaller weights required.
- Full research (files, sizes, arch gates, loader paths, quality data):
  `.agents/mpi-kanban/tasks/MPI-197/research/quant-tiers.md`.

**Key files:**
- `comfy_workflows/scripts/workflow_generation/generate_ltx.py` — emits the 4→12 files.
- `comfy_workflows/scripts/workflow_generation/LTX_i2v_t2v_template.json` — the source template.
- `js/data/modelConstants/resolveModelDeps.js` — `resolveWorkflowFile` + `resolveDeps` (add tier/arch axis).
- `js/data/modelConstants/models.js` — the two tier cards.
- `js/data/modelConstants/dependencies.js` — the two new weight deps + R2 URLs.
- `routes/platformEngine.js` — `selectNvidiaBuild()` arch parse → extend to emit an arch token.
- `.claude/rules/comfy_engine.md` — engine-split contract (arch axis is orthogonal to engine).
- `docs/add-model-playbook.md` — the R2 + registry procedure.

## Implementation

- [ ] Ship the balanced tier end to end: (1) `generate_ltx.py` loops the 3 variants
  over the one template, stamping only the `UNETLoader` (`unet_name` + `weight_dtype`),
  emitting 12 files (bf16 unsuffixed, `_fp8`/`_mxfp8` new) — sanity-gate the title set
  survives all 12; (2) upload the two Kijai weights to R2 per the add-model playbook,
  add the two deps to `dependencies.js`; (3) add the `ltx-23-balanced` card + flip
  `ltx-23` to `sizeTier: 'high'` in `models.js`, wiring the balanced card's workflows
  + weight dep per detected arch; (4) extend `selectNvidiaBuild()` to emit an arch
  token (`blackwell` | `modern` | `legacy`), cache per session, expose via
  `/system/platform-config` (same for the pod's remote nvidia-smi, engine-tagged);
  (5) add the tier/arch axis to `resolveWorkflowFile` + `resolveDeps` so the balanced
  card resolves the arch-correct workflow file AND the arch-correct single weight;
  (6) sweep every consumer of the resolver + `model.workflows`/`sizeTier` for the new
  axis (engine-split lesson MPI-163/165 — symptom-patch = false done). **Verify:** see below.

## Completed

- [ ] Nothing yet.

## Remaining Work

- Everything above.

## Plan Drift

- **2026-07-06 — arch axis generalized to a universal variant mechanism (user
  decision, scalable-foundation).** Original plan said "add a tier/arch axis to
  resolveWorkflowFile + resolveDeps." User directive: build it universal + card-based
  for hundreds of future models where a card's deps/workflow may vary by GPU arch AND
  by other future runtime axes (arch-dependent nodes, LoRAs, per-model variance). So
  the balanced card's arch selection is NOT a bespoke arch axis — it's the first user
  of a **generic `variants` block**: a card declares named axes, each with a runtime
  selector token + per-token `{ extraDeps, workflowSuffix }`; the resolver composes
  every declared axis. Kept ADDITIVE and surgical: the proven `engines:` axis (MPI-165)
  stays working exactly as-is (its own param, its own `engineDepsOf`) — the resolver
  MERGES engine deps + generic-variant deps + suffixes, so the ~15 existing
  `resolveDeps(..., engine)` / `resolveWorkflowFile(..., engine)` call sites are
  untouched. New arch axis rides the generic block only. Suffix order: base → each
  declared variant suffix → `_stage2` → engine suffix (matches `generate_ltx.py`:
  `LTX_t2v_mxfp8_stage2.json`). Arch token resolved ONCE per gen in
  `commandExecutor.runCommand`, AFTER engine (arch is the target machine's GPU, so
  engine-dependent), and threaded — same discipline as the resolve-engine-once rule.
- **generate_ltx.py DONE + auto-verified** (2026-07-06): 3-variant loop emits 12 files
  (scratch-dir dry-run); asserted 12 correct names + only the UNETLoader differs per
  variant vs its bf16 sibling. Live `comfy_workflows/` NOT yet regenerated (waits for
  the whole tier to land, then `orchestrate.py --all`).
- **Generic variant resolver DONE + auto-verified** (2026-07-06): additive `variants:`
  block + `variantDepsOf`/`variantSuffixOf` in resolveModelDeps.js; threaded through
  resolveDeps/resolveWorkflowFile/resolveFullUniverse/deriveInstalledOps/resolve as a
  trailing `variantTokens` param (default `{}` = zero change for the ~15 existing
  callers; engine axis untouched). Suffix order base→variant→_stage2→engine. New
  `testVariantAxis` — 13/13 resolver contract tests pass.
- **Arch detection DONE + auto-verified** (2026-07-06): `gpuArch(gpuName, cuda)` in
  platformEngine.js → `blackwell`|`modern`|`legacy`|null; folded into the cached `gpu`
  object + exposed on `/system/gpu-info` (`gpu.arch`). 17-case self-check passes
  (5090/B200→blackwell, 4090/3090/A100/H100→modern, 1080/P100→legacy). Remote/pod arch
  derives from `state.runpodConfig.gpuType` via the SAME parser (no pod query needed).
- **CODE COMPLETE + AUTO-VERIFIED 2026-07-06 — awaiting R2 upload + live A/B.**
  Downloads landed (g:/CubricModels/diffusion_models). Done this pass:
  - **Hashes:** fp8 `0a1d7aac…70f0`, mxfp8 `b7a945ff…ffd8` (certutil) → dependencies.js.
  - **Deps:** `ltx23-transformer-fp8` (25.2GB) + `ltx23-transformer-mxfp8` (24.1GB) added.
  - **Cards:** `ltx-23` → `sizeTier:'high'`, name "LTX 2.3 High"; NEW `ltx-23-balanced`
    (`sizeTier:'balanced'`, same `modelFamily`, `variants.arch` block: blackwell→mxfp8,
    modern→fp8). Shared deps = High set minus bf16 transformer.
  - **Shared arch classifier:** `js/data/modelConstants/gpuArch.js` (browser-safe ESM,
    single source) — server (platformEngine via createRequire) + client both import it.
    17-case self-check green.
  - **Client arch resolver:** `remoteEngineClient.arch(engine)` (async: remote=pod
    gpuType sync, local=one gpu-info fetch cached) + `archSync()` for render-path gates
    + `warmLocalArch()` (fired in syncModelInstalled). `/system/gpu-info` now returns
    `gpu.arch`.
  - **Consumers threaded** `variantTokens.arch`: commandExecutor (gen resolve-once
    AFTER engine + hot-store + force-local preflight), modelRegistry (isModelUsable /
    isOperationInstalled + flat-variant gate fix), MpiModelManager (`_arch()` →
    install/uninstall/size/trade-table), MpiPromptBox, footprint (totalWeightsGb/
    tradeTable). Backend union sites left union (permissive filter / shared-dep
    protection — correct; no server-side variant heal, YAGNI — arch has no stale-mirror
    race).
  - **Live workflows regenerated:** `orchestrate.py --all` → 12 LTX files on disk.
  - **Verified:** 13/13 resolver tests (new testVariantAxis), footprint demo, all JS
    `node --check`, end-to-end proof (balanced card × 2 arch × 2 op × 2 stage → real
    on-disk file + exactly the arch-correct transformer). runpod-remote-hardening's 4
    fails are PRE-EXISTING (confirmed on clean tree — network mocks, not this work).
  - **REMAINING (needs user):** (1) R2 upload of the 2 weights (add-model playbook,
    `--s3-no-check-bucket`); (2) live A/B — 5090 mxfp8 loads clean on v0.27+cu130 +
    NO LTX2_NAG artifact (#576), 4090 fp8, eviction-floor collapse vs bf16 48s@10s,
    quality vs bf16 locked seed. Both GPUs available.

## Verification

**Verify mode:** user-ux

This ships a new user-visible model card + a generation-quality change the user
must judge in the running app, and it touches the live RunPod + local engines.

1. **Split correctness (auto):** run `generate_ltx.py`; assert 12 files emitted,
   each valid JSON, title-set sanity gate passes on all 12, and the ONLY diff
   between a variant and its bf16 sibling is the `UNETLoader` `unet_name` +
   `weight_dtype`. Re-read the files back.
2. **Resolver (auto):** unit-exercise `resolveWorkflowFile` + `resolveDeps` for
   `ltx-23-balanced` × {blackwell, modern} × {t2v/i2v} × {stage1/stage2} → assert
   the arch-correct filename AND exactly ONE balanced weight in the dep set (never
   both fp8 and mxfp8).
3. **Arch detection (auto):** feed `selectNvidiaBuild`/the new token function the
   nvidia-smi name strings for a 5090, 4090, 3090, 1080 → assert
   blackwell/modern/modern/legacy; confirm `/system/platform-config` returns the token.
4. **mxfp8 load + artifact check (user, 5090):** install the balanced card on the
   5090 → confirm it pulls mxfp8 (not fp8), the first mxfp8 UNETLoader load succeeds
   on our v0.27+cu130 pod (resolves the "core vs Kitchen-fork" conflict), and the
   KJNodes LTX2_NAG mxfp8 artifact bug (kijai/ComfyUI-KJNodes #576, closed) is NOT
   present on our pin 7f43f2c — inspect a generated clip for the artifact.
5. **Fit / eviction proof (user, both GPUs):** generate 10s + 20s on the balanced
   tier → confirm the stage boundary collapses vs the bf16 48s@10s / 116s@20s floor
   (the whole premise). Measure via pod `/history` timestamps + per-phase log, not
   UI timing (feedback: server-truth-over-ui-timing).
6. **Quality A/B (user, locked seed):** balanced vs bf16 on faces / dense text /
   fast-pan prompts, same seed — confirm the loss is acceptable for a balanced tier.
7. **Both engines:** balanced tier must resolve + run on LOCAL (portable) AND REMOTE
   (pod). Local-engine arch-select is NOT proven by any pod run
   (feedback: runpod-not-local-engine-proof) — a 5090/4090 local generate is required.

## Preservation Notes

- **Models are NOT version-bumped** — new weight deps only; do not touch appVersion.
- Update `.claude/rules/component-comfy.md` / `comfy_engine.md` if the resolver's
  new tier/arch axis changes the documented resolution contract (ask before editing
  rule files — CLAUDE.md cardinal rule).
- After ship, update `docs/builder/` LTX research + the models-path doc with the tier
  variant map; drop the stale "both engines run the same bf16" note in models.js /
  generate_ltx.py once the split lands.
- New R2 objects: follow the add-model-playbook `--s3-no-check-bucket` note to dodge
  the 403; verify uploads before wiring URLs.
- LOW tier stays DEFERRED (would need Q4/GGUF — do NOT re-open GGUF without user).
  NVFP4 stays REJECTED. `fp8_input_scaled_v3` is a TRAP (v1.0 weights, not 1.1).
