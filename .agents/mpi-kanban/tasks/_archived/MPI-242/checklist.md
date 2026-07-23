# MPI-242 — checklist

Derived from handoff `554f1336` (`next_action.threads`). Research phase is CLOSED and
live-proven — see `docs/krea2/`. Do not re-litigate it.

## Thread 0 — docs restructure

- [x] Split `docs/krea2.md` → `docs/krea2/` folder (6 files, all ≤200 lines)
- [x] Delete `docs/krea2.md`, no pointer stub
- [x] Retarget `docs/README.md:59` → 6 rows routing into `krea2/`
- [x] Fix cross-boundary links (4 refs in MPI-242 brief + research)
- [x] Resolve the stale 2K "open question" → settled verdict in `krea2/resolution.md`

## Thread 1 — negative-prompt capability gate  ✅ USER-VERIFIED 2026-07-10

Machinery shipped + user-verified against a temporary `chroma-flash` opt-out (since reverted).
Krea2's own ModelDef lands in thread 2.

- [x] `capabilities.negativePrompt?:boolean` added to the ModelDef typedef (`models.js:13`),
      documenting the **inverted default** (absent ⇒ TRUE, unlike multiStage/audio/motion)
- [x] Gate lives INSIDE `MpiPromptBox` (`_refreshNegToggle`), called from setup and from
      `_refreshOpSlot()` — the convergence point of `setModel` (`:488`) and `setModelList` (`:516`)
- [x] **Plan drift:** the 3 call sites are UNCHANGED. `includeNegative` is read once at mount,
      but `model` is reassigned live without a remount, so driving the prop there would go
      stale. It stays the *surface* gate; the capability is the *model* gate.
- [x] Default is `true` (absent ⇒ supported) — no existing model regresses; a **misspelled key
      fails open**, guarded by test
- [x] Stranded `isNegativeMode` snaps back to positive + emits `mode-change` when the toggle vanishes
- [x] `projectModel.negativePrompt` still persisted (UI hidden, data retained)
- [x] Retained-negative behavior **verified inert**: `negative` reaches only `routes/projects.js`
      persistence/meta, never a graph injection (injection is by node title) — so a no-negative
      model cannot silently ship stale negative text
- [x] Guard: `tests/negative-prompt-gate.test.cjs` (13 assertions)
- [ ] Set `capabilities: { negativePrompt: false }` on the real Krea2 ModelDef → **thread 2**

## Thread 2 — Krea2 app wiring (`docs/add-model-playbook.md`, verbatim)

- [ ] Export workflow → API format → `comfy_workflows/scripts/workflow_generation/Krea2_template.json`
- [ ] `registry.py` HANDLERS prefix rule + `generate_krea2.py` `build()`
- [ ] `dependencies.js`: +9 style LoRAs, +depth control LoRA, +`facok` custom_nodes
- [ ] R2 upload (**ASK FIRST**) — `qwen3vl_4b_fp8_scaled` + `krea2_turbo_fp8_scaled` are new;
      `vae-qwen-image` is reused (zero upload)
- [ ] `/mpic-compute-dep-hashes`
- [ ] `models.js` ModelDef: `type:'krea2'`, `multiStage:true`, `ratios` + `qualityTiers:['1k','2k']`,
      `loraStrengths:['model']`, `enhanceRecipe:'flux'`, `capabilities.negativePrompt:false`
- [ ] New `model.type` consumer sweep (playbook §6)
- [ ] `Input_Style` int injection (clamp 0..9) + `Stylization` float + PromptBoxControls entries
- [ ] `progressStages.js` entry — **COUNT tqdm bar restarts LIVE** per run mode
- [ ] `QUALITY_LABELS` needs a `'1k'` key (`MpiOptionSelector.js:141` — `'2k'` exists, `'1k'` does not)
- [ ] Not a version bump

## Thread 3 — later

- [ ] Krea2 detailer op (clone `Chroma_detailer.json`, swap model stack — `detail` is an existing op)
- [ ] Upscaler op (PiD — separate model, own guidance story)
