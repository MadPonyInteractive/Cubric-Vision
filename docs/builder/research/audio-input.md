# LTX-2.3 Audio Input — gate + influence

> Concluded 2026-06-24 (MPI-4). How the input-audio control is wired in the
> LTX-2.3 template, and the gate-vs-slider product decision.

## Two control nodes (saved template)

| Node | Type | Role |
|---|---|---|
| `Input_Use_Input_Audio` | `MpiSimpleBoolean` (id 203) | **GATE.** Feeds `Audio In Select` (`MpiIfElse` 204). TRUE = use the user's dropped-audio latent; FALSE = empty audio. The master switch. |
| `Input_Audio_Influence` | `MpiFloat` 0–1 (id 201) | **STRENGTH.** → `Invert Influence` (202) → `Audio Mask` (`SolidMask` 199) → `Audio Noise Mask` (`SetLatentNoiseMask` 200) → the gate's TRUE input. |

**Chain:** `Influence → Invert → SolidMask.value → SetLatentNoiseMask.mask → IfElse.true → LTXVConcatAVLatent.audio_latent`.

## How influence actually behaves

It is a **denoise-PRESERVE dial on the input-audio latent**, NOT a mix/volume weight.
`Invert Influence` flips it:

- influence **1.0** → mask **0** → audio latent **fully preserved** (max influence — output audio = input).
- influence **0** → mask **1** → audio latent **fully renoised** (input ignored, model regenerates).

Gotcha (hit live): **gate OFF + influence at max = no audio effect.** The gate is the
master; influence does nothing while the gate is FALSE.

## What the mask actually IS — latent inpainting on the audio track (2026-06-24)

The "audio mask" is **ComfyUI latent inpainting applied to the audio latent**, not a
volume/mix. `SetLatentNoiseMask` sets a `noise_mask` for the sampler (core
`nodes.py:1529`); standard inpaint semantics:

- **mask 0** = region PRESERVED (input-audio latent kept verbatim, not renoised).
- **mask 1** = region REGENERATED (model free to synthesize there).

Because `Invert Influence` flips it (`mask = 1 - influence`):

| Influence | Mask | Result |
|---|---|---|
| 1.0 | 0.0 | 100% input audio preserved; model adds NOTHING |
| 0.7 | 0.3 | 70% input kept, 30% regenerable |
| 0.5 | 0.5 | half/half |
| 0.3 | 0.7 | 30% input kept, 70% regenerable |
| 0.0 | 1.0 | input ignored, fully generated |

**Why prompt-requested background sounds don't appear at influence 1.0:** the mask is
0 everywhere → every audio region is locked to the input → there is no unmasked latent
for the model to paint ambient/foley into. To get model-generated background (rain,
footsteps, music — the model CAN do this; the LTX-2 transformer has `v2a_cross_attn`,
video/prompt→audio cross-attention, see `audio_only.py`), the influence MUST drop so
the mask opens regenerable latent. ~0.3 opens 70%.

**The catch — `SolidMask` is UNIFORM.** It's a flat mask, the same value across the
WHOLE audio latent. So influence is one global "preserve vs regenerate" blend, NOT
"keep the voice, add ambient around it." Dropping influence to add background also
renoises the voice → voice fidelity degrades as you chase ambient. Input-voice +
generated-ambient is a TRADE-OFF on one knob, not independent layers.

**To get voice-preserved + background-added would need:** (a) a non-uniform mask
(time/freq-targeted), or (b) skip input-audio masking and let the model build the whole
soundscape from prompt via `v2a_cross_attn`, or (c) mix the input voice in post.
Open product question — not solved by the current solid-mask wiring.

## ❌❌ SOLUTION B — TESTED & ABANDONED on distilled (2026-06-24) — read this FIRST
> Supersedes the "MIX IS ACHIEVABLE via Solution B" optimism below. We BUILT and TESTED the audio-ref-token
> path end-to-end (t2v + i2v, a full session). **On our distilled few-step base, input-voice identity transfer
> does NOT work.** Ambient-from-prompt DOES work. Reverted the template to pre-Solution-B. Pivoted to a future
> lipdub video-to-video op instead.

**What we tried, in order:**
1. **lipdub IC-LoRA** (`Lightricks/LTX-2.3-22b-IC-LoRA-LipDub`, `LTXVSetAudioRefTokens` + IC-LoRA loader on
   stage-1, empty audio latent so the model generates the soundscape). Result: correct WORDS (from text prompt),
   **fresh generated voice (zero input-identity), no ambient.** Cause: lipdub is `Control Type: Video & Audio`,
   trained on lip-dub pairs — it's a **video-to-video re-dub** that needs an INPUT-VIDEO guide
   (`LTXAddVideoICLoRAGuide`). With no video to anchor to, it ignored the audio ref. **Wrong tool for t2v/i2v.**
2. **ID-LoRA** (`AviadDahan/LTX-2.3-ID-LoRA-TalkVid-3K`, ~1.1GB, strategy `audio_ref_only_ic` = exactly what
   `LTXVSetAudioRefTokens` does — audio ref tokens, negative temporal positions, NO video guide; the right
   family). Swapped node 277 to plain `LoraLoaderModelOnly` (ID-LoRA has no `reference_downscale_factor`).
   Result: **AMBIENT now appears (✅), but voice identity still does NOT carry — tone completely different.**
3. **MultimodalGuider + GuiderParameters** (modality_scale, the supposed "identity guidance"). Found a node bug:
   at cfg=1 `MultimodalGuider` never assigns `noise_pred_neg` (only under `do_uncond()` = cfg≠1), but the
   `LTXVNormalizingSampler` post-cfg hook always reads it → `UnboundLocalError`. Fix = cfg ≥ 1.1 (widget step is
   0.1, so 1.05 snaps to 1.1). Then tested modality_scale 3 → 5 → (i2v) 1 & 4: **modality 3 = no change; 5 =
   voice DEVIATED MORE + audio distorted (speed up/down, unusable).**

**Why it can't work on distilled (the real reason):**
- `modality_scale` is NOT an identity lever. Its term is `(modality_scale-1)*(pos − modality_pass)` where
  `modality_pass` drops BOTH cross-attns → it amplifies audio↔video **COUPLING**, not ref-identity-matching.
  Cranking it = coupling artifacts (the distortion observed), not identity convergence.
- `cfg` can't pull identity either: `SetAudioRefTokens` attaches `ref_audio` to **BOTH** positive AND negative
  conditioning (iclora.py), so it **cancels** in the `(cfg-1)*(pos − neg)` CFG term.
- So identity strength = **the ID-LoRA itself × DENOISE STEPS**. ID-LoRA's reference inference =
  **30 steps, audio-cfg 7, identity-guidance 3** (the full-model regime). We run **7 steps, cfg≈1** (distilled
  lock). Few steps → the model commits to prompt-driven generation before the ref tokens can steer the voice.
  15–30 steps = non-distilled (defeats the point); 12 is the realistic ceiling and won't close a 30-step gap.
  i2v (which matches ID-LoRA's image+audio training modality) ALSO failed (modality 1 & 4).

**Decision:** distilled cannot do ID-LoRA voice transfer; **dropped for v1.** Ship the working audio gate
(generate-from-prompt OR pass-through input audio). **Voice-specific output → future LIPDUB v2v op** (a v2v
workflow gives lipdub the input-video guide it needs; chain generate→lipdub for "good video + specific voice").
modality_scale/MultimodalGuider may still be worth testing for audio↔video SYNC (its actual job) — separate
future question, not v1. Reverted to `LTX_i2v_t2v_template.20260624-102335.bak.json`; the Solution-B attempt
is snapshotted at `...solb-attempt-20260624-121639.bak.json`.

---

## ⭐⭐ MIX IS ACHIEVABLE — via OTHER nodes, not the SolidMask (2026-06-24, UPDATES the "impossible" call below)
> ⚠️ SUPERSEDED by the TESTED & ABANDONED block above — Solution B did not pan out on distilled. Kept for the
> node analysis (it's still accurate about what the nodes DO; just not viable at our step count).

The "architecturally unsupported" conclusion below was only true for the **plain A2V
pipeline + the uniform SolidMask** we currently use. LTXVideo/KJNodes ship TWO nodes that
DO enable a mix — found by inspecting the node descriptions in ComfyUI:

### Solution A — TEMPORAL mix: `LTXVAudioVideoMask` (KJNodes/ltxv)
Builds a noise mask on the audio latent **by TIME RANGE** (not a flat SolidMask): mask=1
(regenerate) inside `[audio_start_time, audio_end_time]`, mask=0 (preserve input) outside.
Audio = **25 latent-frames/sec** (`sampling_rate/mel_hop/downsample = 16000/160/4`).
`existing_mask_mode: add|subtract|overwrite` composes multiple windows. `max_length:
truncate|pad|partial`. Outputs masked video_latent + audio_latent.
→ Use for **"input voice 0-3s (preserved), generated ambient 3-6s (model fills)"** — a
SEQUENTIAL mix. Drop-in replacement for the SolidMask path. NOT same-instant.

### Solution B — SIMULTANEOUS mix: `LTXVSetAudioRefTokens` + IC-LoRA (Lightricks/IC-LoRA) ← the real answer
Patchifies the input audio latent and attaches it as **reference tokens with NEGATIVE
temporal positions** on both positive+negative conditioning → "the model treats them as
identity CONTEXT, NOT a generation target." So the model GENERATES the whole soundscape
(voice in that identity + ambient + foley jointly) instead of locking/preserving the input.
Also outputs `frozen_audio` (noise_mask=0) for stage-2 reuse without re-encode.
→ This is TRUE "voice + ambient at the same time" — and it EXACTLY matches the live 0.1
finding (identity kept, delivery regenerated), done properly via conditioning instead of a
leaky noise-mask. **Needs the audio IC-LoRA (a new model dep)** + different conditioning
wiring. Reference workflows: `ComfyUI-LTXVideo/example_workflows/2.3/LTX-2.3_ICLoRA_*` and
`..._V2V_ICLoRA_*` (Lipdub/Inpaint/Outpaint/V2V). UNTESTED on our distilled base.

Other audio nodes seen (for later): `LTXV Set Audio Video Mask By Time` (utility),
`LTX2 Audio Latent Normalizing Sampling` (KJNodes — improves generated-audio quality at
specified sampling steps; relates to the `audio_normalization_factors` already in our sampler),
`LTXV Reference Audio (ID-LoRA)` (the loader side of Solution B).

**Net:** the SolidMask path is the wrong tool for mixing (correctly abandoned). For
voice+ambient simultaneously → Solution B (IC-LoRA ref tokens). For voice-here/sounds-there →
Solution A (temporal mask). Both are real workflow additions (B also a new dep) — scope in a
dedicated session.

## ⭐ ONLINE RESEARCH — voice+ambient mix unsupported on the PLAIN pipeline (2026-06-24)

Confirmed against the official LTX-2.3 audio guide (ltx.io) + community guides, after
3 sessions of empirical observation (the slider only ever flips between "all input audio"
and "all generated," never a mix). **This is a model-architecture limit, not a tuning gap.**

Official LTX guide, verbatim:
- "The A2Vid pipeline accepts an audio file as conditioning input and generates matching
  video, **returning your original audio waveform UNMODIFIED** alongside the generated
  visuals." → input audio is NOT a base layer the model adds onto; it's pure conditioning
  that drives video motion/lip-sync, returned untouched.
- "The architecture does **not support** [voice + ambient hybrid]. Two distinct workflows:
  **Text-to-audio-video** (generate both from prompt) OR **Audio-to-video** (condition on
  input audio, unmodified). There is **no documented pipeline** for preserving input voice
  while adding model-generated ambient layers simultaneously."

So the two modes are mutually exclusive:
1. **Input audio present** → audio returned as-is, only drives video. Model adds NO ambient.
2. **No input audio** → model generates the FULL soundscape (voice+ambient+foley) from prompt
   via `v2a_cross_attn`. (This is the t2v path — ambient works HERE, where nothing is masked.)

The workflow's solid-mask slider just blends between these two end-states; the uniform mask
is why there's no clean "voice + ambient," only a muddy middle. **"Voice + generated
background" in one pass = NOT achievable. Do it as: generate ambient separately + mix in
post, or accept the trade-off.** Product-scope fact, not a bug.

### `modality_scale` — the REAL audio↔video coupling knob (FOUND, not wired in our template)
Lives on the **`GuiderParameters`** node (category `lightricks/LTXV`, source
`guiders/parameters.py`) — set per-modality (one node for VIDEO, one for AUDIO, chained via
the `parameters` input), consumed by the **`MultimodalGuider`** node (replaces `CFGGuider`).

Formula (`parameters.py:48`): `noise_pred += (modality_scale - 1) * (pos - modality_pass)`,
where `modality_pass` = prediction with the OTHER modality's cross-attn dropped. So it's a
**CFG-style guidance scale on the audio↔video cross-attention**: `>1` amplifies coupling
(tighter sync, prompt-driven audio lands harder), `=1` natural (term zeroes → no extra pass),
`<1` weakens it. `do_modality()` only fires when scale ≠ 1.0 → an EXTRA guidance pass = slower.
Node default is 0.0, but the meaningful values are the official ones below.

**⚠️ OUR TEMPLATE USES `CFGGuider` (cfg=1), NOT `MultimodalGuider` → modality_scale is NOT
exposed at all.** We've been generating with the audio↔video coupling guidance at its no-op
(scale=1 equivalent) — the `v2a_cross_attn` exists in the model but is unguided. Likely why
prompt-driven ambient is weak AND sync is loose. Also explains "lower input-audio influence
→ more movement" (renoising the audio latent loosens its lock on video).

**Official LTX-2.3 reference values** (from `ComfyUI-LTXVideo/example_workflows/2.3/
LTX-2.3_T2V_I2V_Single_Stage_Distilled_Full.json`):
- `GuiderParameters` **AUDIO**: cfg 7, stg 1, perturb True, rescale 0.7, **modality_scale 3**, skip 0, cross_attn True
- `GuiderParameters` **VIDEO**: cfg 3, stg 1, perturb True, rescale 0.9, **modality_scale 3**, skip 0, cross_attn True
- `MultimodalGuider` skip_blocks = "28"

⚠️ That example is the `_Full` (non-distilled) path → cfg 7/3. OUR model is DISTILLED, CFG
locked at 1 (see `lora-strength-law.md` / precision memory). modality_scale is INDEPENDENT of
cfg — so the test is: keep cfg=1 (distilled) but set modality_scale=3 via MultimodalGuider.
NOT YET TESTED. Swapping CFGGuider → MultimodalGuider is a real template change.

### Partial-renoise identity finding (2026-06-24, live)
Influence 0.1 (mask ~0.9, ~90% renoise): the voice was ALTERED in delivery but **kept its
speaker IDENTITY/timbre.** Diffusion preserves the coarse/low-freq structure (identity) under
heavy partial renoise while regenerating fine detail (words/prosody) — same reason image
inpaint at high denoise keeps rough composition. Influence 0.0 = full renoise = model's own
voice entirely. So the influence axis = identity-preserving-but-altered → fully-replaced, NOT
voice→voice+ambient.

### Why post-mix (generate ambient separately + mix) is weak: SYNC
The model's generated ambient/foley is timed to the GENERATED motion (door slam hits when the
door closes — joint denoising). A separately-generated ambient track has no shared timing →
events won't line up. Post-mix loses the one thing the joint model gives. So "voice + ambient"
isn't cleanly solvable either in-pass (architecture) OR post (sync). Real constraint.

### Input prep (from guides, affects quality)
Clean mono speech, 44.1/48kHz WAV, peaks ≤ ~-3 dBFS, light 2:1 compression. Noisy/reverb/
sub-128kbps MP3 degrades lip-sync (distortion propagates through the mel-spectrogram encode).
Input audio MUST be ≥ the generated video length (shorter audio → audio condition fails;
pad with silence if needed).

## Verdict — RESOLVED by the architecture research above

The user's goal (input voice + model-generated background in ONE pass) is **architecturally
impossible** on LTX-2.3 — not a slider-tuning problem. So:

- **`Input_Use_Input_Audio` gate** = the real product control: audio present → "use my
  audio" mode (drives video, returned clean); absent → "generate audio from prompt" mode.
- **`Input_Audio_Influence` (the inpaint mask) is NOT a useful user knob.** It only blends
  between the two mutually-exclusive end-states via a uniform mask → no clean mix exists at
  any value. Keep it at **1.0 (full preserve)** for the input-audio mode and **don't expose
  it to users.** It stays an authoring-only lever.
- The knob actually worth exposing for "how hard audio drives motion" is **`modality_scale`**
  (default 1.0, try 3.0), not the inpaint mask — see the research block above.
- For generated ambient/foley: that's the **no-input-audio** path (t2v / gate OFF), where the
  prompt builds the whole soundscape. "Voice + ambient" = generate separately + mix in post.

This supersedes the earlier "fixed 1.0, drop the slider" lean — the conclusion is the same
(don't expose the influence slider) but for a stronger reason: the mix it was meant to enable
doesn't exist.
