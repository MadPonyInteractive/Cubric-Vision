# LTX-2.3 Distilled — Motion + Prompt Adherence Tuning (research 2026-06-21)

> **Problem:** distilled LTX-2.3 (CFG locked at 1) follows prompts poorly, esp. at
> higher res. Repro: "she removes her shades" only works at LOW res tier; medium+
> she won't do the action. Motion weak at higher res.
> **CFG=1 is LOCKED** (distilled). Any "raise CFG/guidance" advice is invalid here.

## ROOT CAUSE — it's NOT the sampler
Our samplers (`euler_ancestral_cfg_pp` stage1, `euler_cfg_pp` stage2) are EXACTLY
what Lightricks ships in their official 2-stage distilled workflow. Sampler not the issue.
Two real causes:
1. **Higher res → less motion (CONFIRMED, architectural).** More latent tokens →
   LTXVScheduler auto-raises sigma_shift (formula: 1024 tok→base_shift 0.95,
   4096 tok→max_shift 2.05). Higher shift front-loads trajectory to structure,
   starves fine motion. Community consensus: generating directly at high res
   ruins motion. Fix = generate LOW, upscale (multi-stage, which we have).
2. **STG is off.** STG = the only guidance lever available at CFG=1; we don't use it.

## LEVER 1 — STG (Spatio-Temporal Guidance) — works at CFG=1
- STG perturbs attention in selected blocks, adds `stg_scale*(pos - perturbed)`.
  INDEPENDENT of CFG (source: stg.py — code zeroes neg pass at cfg=1 but STG fires
  when stg_scale!=0). The ONE guidance knob on a locked-CFG distilled model.
- Lightricks defaults distilled to stg_scale=0 — SAFE default, NOT a hard lock.
  Preset "13b Distilled" exists to override (block=[25]).
- ⚠️ Experimental on distilled — NOT a confirmed community win. Test.
- Nodes (verified, repo Lightricks/ComfyUI-LTXVideo stg.py):
  - `LTXVApplySTG` — patches model, input `block_indices` (string, default "14, 19")
  - `STGGuider` — replaces CFGGuider; inputs model/positive/negative/cfg/stg_scale/rescale_scale
  - `STGGuiderAdvanced` — per-sigma STG schedule (complex)
- Wire: MODEL → LTXVApplySTG("14,19") → STGGuider (cfg=1.0, stg_scale=1.0, rescale=0.7)

## LEVER 2 — max_shift for higher-res tiers
- Lower max_shift (2.05 → ~1.8) at medium+ tiers de-compresses sigma schedule,
  gives back motion budget. Keep 2.05 at LOW tier. (inference from shift mechanics)

## LEVER 3 — step count
- We run 8 steps stage-1. Official single-stage distilled "Full" workflow uses 15.
  Distilled models plateau past trained steps, don't break. Try 12.

## LoRA findings — NO magic motion/adherence LoRA exists
- No Lightricks "motion boost" or "adherence" standalone LoRA. Their motion LoRA =
  Motion-Track-Control (trajectory control via reference video, NOT amplitude).
- **BIG CATCH (Kijai discussions #20, #36):** official rank-384 distilled LoRA
  ACTIVELY DAMPENS conditioning on I2V → kills adherence + motion. Kijai's
  **`_condsafe` rank-72 variant** zeroes cross-attn conditioning layers → much
  better I2V. **POSSIBLY our exact bug** if we load rank-384.
  → https://huggingface.co/Kijai/LTX2.3_comfy (loras folder, _condsafe variants)
  → strength 1.0 first-pass I2V, 0.4-0.5 upscale pass.
- Character LoRAs at strength 1.0 also suppress motion → keep >=0.55.
- All Lightricks LoRAs are DIFFUSION-MODEL-ONLY (no text encoder) → stack cleanly
  with our gemma text-encoder LoRA + transition LoRA. But official guidance:
  do NOT stack multiple IC-LoRAs (VRAM); keep total LoRA strength < ~1.5.

### Community LoRAs worth a look (UNVERIFIED quality)
- **LTX 2.3 Video Reasoning LoRA (VBVR)** — claims prompt-following + temporal
  consistency + motion precision. Experimental.
  https://civitai.com/models/2497207/ltx-23-video-reasoning-lora-vbvr
- **Singularity OmniCine V1** — cinematic dynamic motion i2v, targets anatomy
  degradation in fast motion. https://huggingface.co/WarmBloodAban/Singularity-LTX-2.3_OmniCine_V1
- awesome-ltx2 index: https://github.com/wildminder/awesome-ltx2

### Distilled LoRA clarification (important)
The "distilled LoRA" the workflow note mentions = a "dev→distilled behavior"
adapter: load the dev/full transformer + this LoRA = behaves distilled (8-step,
CFG1). DO NOT apply it on top of an already-distilled checkpoint (grey/ruined
result, Kijai #20). We use the distilled transformer directly, so confirm whether
we're also loading a distilled LoRA on top (we shouldn't be, or use _condsafe).

## ORDERED EXPERIMENT LIST (cheapest → most invasive)
1. CHECK which distilled LoRA we load. If rank-384 → swap to Kijai `_condsafe`
   rank-72 @ 1.0 stage-1. Likely biggest adherence win. Free, no graph change.
2. Steps 8→12 stage-1. One widget.
3. Add STG: LTXVApplySTG("14,19") → STGGuider (cfg=1, stg_scale=1.0, rescale=0.7).
   Sweep stg_scale 0.5→2.0.
4. Lower max_shift 2.05→1.8 at medium+ tier only.
5. Generate stage-1 SMALLER, let stage-2 upscale handle res.

## Official sampler reference (verified, do NOT change without testing)
- Two-stage distilled: stage1 `euler_ancestral_cfg_pp` + manual sigmas
  `1.0,...,0.0`; stage2 `euler_cfg_pp` + sigmas `0.909375,0.725,0.421875,0.0`.
- Single-stage distilled Full: stage1 `euler_ancestral_cfg_pp`, LTXVScheduler
  steps=15, max_shift=2.05, base_shift=0.95, stretch=true, terminal=0.1.
- Non-distilled (for ref only, NOT us): stg_scale=[0,0,4,4,4,2,1], guidance=[1,1,6,8,6,1,1].

## Sources
- repo Lightricks/ComfyUI-LTXVideo: stg.py, easy_samplers.py, example_workflows/2.3/*, presets/stg_advanced_presets.json
- repo Lightricks/LTX-Video: configs/ltxv-13b-0.9.8-distilled.yaml + dev.yaml, schedulers/rf.py
- ComfyUI comfy_extras/nodes_lt.py (LTXVScheduler shift formula)
- Kijai/LTX2.3_comfy discussions #6 #9 #20 #36 #49 + loras folder (_condsafe)
- Lightricks/LTX-2.3 discussion #36, Comfy-Org/ComfyUI discussion #13213 (char LoRA motion)
- aistudynow.com 3-stage workflow; ltx.io adherence + IC-LoRA blogs
- civitai 2497207 (VBVR); WarmBloodAban Singularity OmniCine
