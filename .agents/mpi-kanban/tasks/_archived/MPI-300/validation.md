# MPI-300 — Validation

## Remote pass — PASS (RTX PRO 4000 Pod, volume cubric-vision-EU-RO-1, 2026-07-21, MPI-324 sweep)

Transformer + LoRAs + style LoRAs staged on the volume; model read Installed on connect.

- **Tier radio (1/2/3 = Quality/Turbo/Hyper) — PASS.** All three tiers ran on
  remote (via Head Swap, which rides the qwenEdit model) and produced correct
  output; step count varied per tier off one `Input_Tier`. Times muddied by
  cold-vs-warm load but all three routed + generated.
- **2-image combine — PASS.** Head Swap (head from ref → target) is a 2-image
  combine; re-passed remotely (appHeadSwap_001/002/003).
- **3rd-image chip `Input_Image_3` — PASS (injects on BOTH engines).** The
  genuinely-unproven-anywhere path. Graph trace confirmed the wiring is correct
  and not crossed: `image1←34←70` (Input_Image), `image2←169←104`
  (Input_Image_2), `image3←171←72` (Input_Image_3); both
  `TextEncodeQwenImageEditPlus` encoders receive all three. Proven live:
  chip-3-unique content (a blue-haired reference girl) landed in a LOCAL run
  (qwenEdit_003) AND in a REMOTE run (qwenEdit_005) — content that can only come
  from image 3, so slot 3 demonstrably injects on both engines. Engine-split
  upload concern (block_if_empty:false silently passing a blank) is ruled out.
- **Style rack — PASS (remote).** 3 styles run on the Pod (qwenEdit_006/007/008,
  incl. 3D at stylization 0.80); all rendered. Shared MpiStylePicker /
  tier-indexed style-LoRA path, engine-agnostic; Krea2 already proved it remotely.

## Caveat (model behaviour, NOT a code defect)
Combining a scene + **two distinct subjects** in one pass is **model-unstable**:
Qwen keeps one subject and drops/morphs the other, inconsistently which. Same
family as Krea2's 2-subject-per-pass limit. Mitigation = chain subjects one per
pass — already carded as **MPI-313** (Qwen shares it). Injection is correct; the
instability is the transformer, confirmed identical local and remote.

## Result
Remote-verified. Card → done.
