# MPI-242 — Add Krea2 (Flux family)

**Procedure:** `docs/add-model-playbook.md`. Read it before touching code. This brief only
records the Krea2-specific decisions + open questions; the playbook holds every trap.

## Plan Drift

- **2026-07-10** — `docs/krea2/` supersedes this brief on three points below. It is
  authoritative; the stale lines are kept only so the diff is legible.
  1. **VAE is `vae-qwen-image`, NOT `vae-flux-ae`.** Krea2 is Flux-lineage in *architecture
     only*; its conditioning + VAE stack is Qwen. The "Known-good reuse" section below is wrong.
  2. **The workflow is MULTI-STAGE.** The refiner ships ⇒ `capabilities.multiStage: true`,
     a `_stage2` runtime file, a `progressStages.js` entry. The checklist's "single workflow
     file, no `_stage2`" open question is closed the other way.
  3. **`Output_Image` is a valid capture title** (MPI-182 alias, `commandExecutor.js:1253`).
     The checklist line demanding a bare `Output` is stale — it echoes stale playbook §8 text.
- **2026-07-10** — Research thread closed: reference-image conditioning is **native** to
  `Krea2Tokenizer` (core ComfyUI, zero new deps). Depth ControlNet weights downloaded.
  See `research/image-conditioning-and-controlnet.md`.

## Variants

| Variant | sizeTier (proposed) | Phase |
|---|---|---|
| Krea2 **Turbo** | `low` | **1 — this session** |
| Krea2 (full) | `baseline` | 2 — later, same card |

Same `modelFamily` → they cluster as tier-variants in the model list (like the arch/quant
variant pattern, MPI-209). Confirm whether they share deps (VAE, text encoders) — almost
certainly yes; only the transformer differs.

## Known-good reuse (do NOT re-host)

- `vae-flux-ae` — resource-named shared Flux VAE, already in `dependencies.js` + R2.
- Flux text encoders (clip_l / t5) — **CHECK `dependencies.js` first**; likely present.
- `enhanceRecipe: 'flux'` — reuse existing Cubric Prompt recipe (no `krea2` recipe exists).

## Open questions (resolve before wiring)

- [ ] Exact model shape: single workflow file, or op-split? (image t2i → likely one file, no
      `_ms`, no `_stage2`.) → playbook §0
- [ ] New `model.type` (`'krea2'`?) or reuse `'flux'`? A new type = consumer sweep (§6) +
      `ratios` + `qualityTiers` on the ModelDef.
- [ ] Turbo step count / CFG — does the workflow need a runtime selector, or fixed?
- [ ] Any custom node? → `type: 'custom_nodes'` + pin in `dev_configs/node_lock.json` (§4).
- [ ] **Non-turbo transformer ≥ 20 GB per FILE?** If yes → **PING USER** before shipping
      (Pod container-disk budget, `CONTAINER_DISK_GB`). Turbo almost certainly under.

## Ownership

- **User** authors + proves the ComfyUI workflow (local bench `G:\ComfyUi\ComfyUI\user\default\workflows\`).
- **Agent** does research, dep entries, R2 upload, generator handler, `models.js`,
  `progressStages.js`, consumer sweep, verification.

## Checklist (from playbook §Checklist — Turbo phase)

- [ ] Decide shape: combined vs separate; single vs multi-stage
- [ ] Output capture node titled EXACTLY `Output` (bare, not `Output_*`) — set in ComfyUI, re-export
- [ ] Template lands in `comfy_workflows/scripts/workflow_generation/Krea2_template.json`
- [ ] `registry.py` HANDLERS prefix rule (specific before general) + `generate_krea2.py` with `build()`
- [ ] `python orchestrate.py --all` → runtime file(s) in `comfy_workflows/`
- [ ] Loader file field == dep `filename` (minus type prefix) == on-disk path (§3, bit twice)
- [ ] `progressStages.js` entry — COUNT tqdm bar restarts LIVE, do not guess
- [ ] Dep entries in `dependencies.js` (`sha256: null`), reuse `vae-flux-ae` + existing encoders
- [ ] R2 upload: `--s3-no-check-bucket --multi-thread-streams 0 --bwlimit 3M -P`, sequential;
      VERIFY with `rclone lsf -R` + `curl -sIL … | grep -i content-length` (exit 0 lies)
- [ ] `/mpic-compute-dep-hashes` → zero `sha256: null`
- [ ] `ModelDef` in `models.js` — no `video:` field until a real Krea2 preview clip exists
- [ ] New `type`? sweep §6 consumers
- [ ] Verify: parse cross-ref, loader paths, HTTP HEAD, app launch, one gen per op
- [ ] NO app version bump
