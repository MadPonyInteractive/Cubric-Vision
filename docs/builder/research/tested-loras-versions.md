# Tested LoRA Versions — LTX-2.3 (re-test baseline)

> **Why this file:** a dropped LoRA is dropped *for the version we tested*. New versions
> (or a different base/precision) can change the verdict. Record the EXACT version + base
> tested so a future re-test starts from the right baseline and we don't re-litigate from zero.
> Update the row (don't delete) when a new version is tested.

## Test environment (2026-06-23 session)
- **Base:** `ltx-2.3-22b-distilled-1.1_transformer_only` **bf16** (full), CFG 1.
- **Encoder:** gemma-3-12b-it-heretic-fp8 (anongecko).
- **Steps:** stage-1 ~8 (7 denoise), stage-2 ~4 (3 denoise). Sampler per template.
- **Pod:** RunPod RTX PRO 4500 Blackwell (32GB), bf16 distilled, ~544×960 stage-1 (portrait) /
  640×352 (landscape 1280×704). Timings are this GPU's (VRAM-staging tax inflates them).

## Verdicts by version

| LoRA | Version tested | File | Base it was MADE for | Strengths tested | Verdict | Re-test trigger |
|---|---|---|---|---|---|---|
| VBVR i2v | **V4 "Sulphur-2 I2V"** (rank 128) | `LTX2.3_reasoning_Sulphur-2_I2V_V4` | **Sulphur-2 uncensored base** (mismatch — we run distilled bf16) | 0.5, 0.7, 1.0+; 8 & 12 steps | **DROP** — base already follows ordered prompts; marginal win, worse morph, step tax | a v5+; OR test **v3** (untested, "better motion, attention-only") |
| VBVR t2v | **V1** (rank 32, ai-toolkit meta `LTX2.3_reasoning_big`) | standard | 0.7 | **DROP** — inconsistent across scenes | new t2v version |
| Singularity | **OmniCine V1** | `Singularity-LTX-2.3_OmniCine_V1` | recommends **fp8** transformer (we run bf16) | 0.8, 0.5, 0.3 | **DROP** — degrades audio (no documented fix), ethnicity bias, +2.5GB, +time | a V2+; OR if a documented audio/sigma fix appears; OR test on fp8 base |
| Soft Enhance | **V1** (Soft only, not Crisp) | `LTX2.3_Soft_Enhance` | standard | 0/0.5/0.7, i2v + t2v, stage-1 + both | **✅ KEEP** — softer/more realistic face+skin+lighting; merge-able (344MB, always-on, no prompt change). Ship 0.5-0.7; visible only on CLOSE shots | new version (try Crisp variant?) |
| Transition | **valiantcat v1.0** | `ltx2.3-transition` | standard | stage-1 ONLY @ on/off switch; FL start+end (2026-06-24) | **WORKS on FL — DEFER on delivery.** With two DIFFERENT-content FL frames, BASE snaps start→end in the first ms; Transition morphs SMOOTHLY across the clip (clothes + mask). It ALWAYS spans the whole clip = a short A→B morph primitive, not a scene generator (transform-then-act = short transition + separate extension). **Place STAGE-1 ONLY** — stage-2 copy = zero difference (latent carries it). No audio conflict (perfect @ influence 1.0). ~+17% time (FL 36s → 42s, 2s clip). Stays a TOGGLE, FL-only, never merged; delivery needs an effect-system decision. | effect-system brainstorm |

## Untested variants worth a future look
- **VBVR v3 (i2v)** — "Attention-only layers, feedforward stripped. Better motion, smaller file."
  Different axis (MOTION) from v4 (prompt-following). Made for a more standard base than v4's Sulphur-2.
  The one cheap i2v re-test still worth doing: judge MOTION (floaty→purposeful), not prompt-following.
- **OmniNFT-RL LoRA** (Kijai mirror, `huggingface.co/Kijai/LTX2.3_comfy`) — claims audio/video desync
  + lip-sync fix. Relevant to the input-audio + music-dub work, not yet tested.

## How to re-test a new version
1. Note the new version + its declared base/precision in the table (mismatch with our bf16 distilled
   base = expect flat; that alone can explain a poor showing).
2. Lock a GOOD base seed on a CLEAN image first (strength 0), then A/B via strength 0↔0.5 — never
   bypass-toggle (model reload → RAM-leak OOM).
3. Test in the LoRA's NATIVE prompt format (Singularity = timeline syntax; VBVR/base = prose contract).
4. Judge against the LoRA's actual CLAIM, not generic "is it better" (Soft=detail/DoF, VBVR=sequencing,
   Singularity=anatomy/timeline-pacing, transition=scene-transition).
