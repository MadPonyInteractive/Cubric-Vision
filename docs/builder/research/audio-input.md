# LTX-2.3 Audio Input — gate + influence

> Concluded 2026-06-24 (MPI-4). How the input-audio control is wired in the
> LTX-2.3 template, and the gate-vs-slider product decision.

---

## ✅✅ VOICE-ID WORKS ON DISTILLED — `LTXVReferenceAudio`, not `LTXVSetAudioRefTokens` (2026-06-24, LATEST — read FIRST)

> **This corrects the "SOLUTION B ABANDONED / needs 30 steps" block far below.** That conclusion was a WRONG
> ROOT CAUSE — we tested the wrong node. Voice-identity transfer DOES work on our distilled 8-step / cfg-1 base.

### The fix: two different audio-ref nodes — we'd tested the wrong one
- `LTXVSetAudioRefTokens` (what we abandoned): attaches `ref_audio` to BOTH pos+neg conditioning → **cancels**
  in the `(cfg-1)*(pos-neg)` term → zero identity push. THIS is why our Solution-B test failed — not the step count.
- **`LTXVReferenceAudio`** (comfy-core `comfy_extras/nodes_lt.py`, the RIGHT node): also sets ref_audio on
  pos+neg, BUT additionally patches the model via `set_model_sampler_post_cfg_function` — runs an EXTRA forward
  pass per step WITHOUT the ref, then adds `(cond_pred − pred_noref) * identity_guidance_scale` on top of the cfg
  result. That term does NOT cancel → it's the real identity lever. `identity_guidance_scale` default 3,
  `start_percent`/`end_percent` gate the active sigma range. **cfg=1 SAFE** (reads only always-present args; the
  old `MultimodalGuider noise_pred_neg` bug does NOT apply here).

### Source of truth: the OFFICIAL ComfyUI template `video_ltx2_3_id_lora.json` runs at **8 steps / cfg 1**
`CheckpointLoader(ltx-2.3-22b-dev-fp8) → distilled-LoRA@0.5 → ID-LoRA-talkvid-3k@1.0 (LoraLoaderModelOnly,
MODEL-ONLY, no clip) → LTXVReferenceAudio(scale=3) → CFGGuider stage-1`. Reference IMAGE via
`LTXVImgToVideoInplace(0.7)`, NOT `LTXAddVideoICLoRAGuide`. ID guidance STAGE-1 only. (The ID-LoRA repo's own
README defaults to 30 steps / cfg3 / audio-cfg7 — the FULL regime — but the ComfyUI template proves it also
works few-step. Don't jump to 30 unless deliberately testing the full regime.)

### Applied to our template (`LTX_i2v_t2v_template.json`)
`LTXVReferenceAudio` #274 spliced into stage-1 guider #33: model via `talk3_ID_Lora` #277 (MpiLoraModel,
talkvid-3k @1.0) → MpiReroute#196; pos/neg from LTXVConditioning#212; ref_audio from existing LoadAudio#197
(`Input_Audio_File`); audio_vae from VAELoaderKJ#2. Stage-2 guider #32 untouched. The ID-LoRA loader is titled
`talk3_ID_Lora` NOT `Input_*` — `Input_*` is reserved for app INJECTION points; a baked loader (fixed path) is
internal. Backup `...pre-refaudio-20260624-131500.bak.json`.

### MEASURED tuning (user live tests 2026-06-24) — beats the official defaults
| Finding | Detail |
|---|---|
| **scale 3 (official) often TOO MUCH** | overdrives/distorts. **~1.5 better.** Try 1.0–1.2 if still hot. Very sensitive. |
| **Length: 5s = sweet spot, NOT a hard limit** | 3s and 7s work well; 7s good. 38s CAN work but "syncs in harder" → distortion, needs repeated speed adjustment. Short = cleaner. |
| **Seed is a LOTTERY — even single-speaker** | same settings, different seed = pass/fail. NOT reliable one-shot even for ONE voice. Seed-hunt always (38s M+F succeeded on 3rd seed). Single-voice = BETTER ODDS than multi, not "reliable". |
| **scale 1.5 = best middle point** | user's settled value for identity_guidance_scale. 3 too hot, lower loses identity; ~1.5 is the sweet spot. |
| **Multi-speaker UNRELIABLE — worse lottery** | talkvid-3k is single-speaker. Failure modes, all seed-dependent: (a) both MUTE, (b) both get ONE identity (portrait: both female voice+look), (c) dialogue ATTRIBUTION DRIFT — female echoed the male's line ("what trash again"). 38s M+F once carried both (lucky 3rd seed). The WHOLE capability is a lottery; multi-voice is just worse odds than single. → multi-character belongs in `Original` mode, not `Reference`. |
| **Accent transfer = LOTTERY (not "never")** | EARLIER call "accent doesn't transfer" was WRONG/too absolute. Later test: the male character carried the reference's INDIAN ACCENT, from stage-1. So accent CAN carry — like everything here, seed-dependent. If it doesn't land, reinforce in prompt. |
| **STAGE-2 SHIP SIGMAS = `0.65, 0.45, 0.25, 0.0`** | Full sweep on HUMAN faces (704×1280 i2v): 0.5=too soft (leaves detail on table) · **0.65=THE KNEE (ship)** real skin texture, natural, identity+audio hold · 0.7=more detail but audio starts to DRIFT (she "wanted to say something else", like 0.85) · 0.85=over-sharp/plasticky + most drift. 0.65 = "photographic not filter-sharpened", the point before stage-2 re-decides content. AUDIO-DRIFT (dialogue changes from stage-1) is the hard ceiling signal. On ANIMATED animals the sigma differences were near-invisible (no fine texture); humans show it clearly — always tune sigmas on human skin. Stage-1 keeps its LTXVScheduler (8 steps, max_shift 2.05) — only stage-2 manual sigmas were tuned. |
| **t2v white-screens; i2v (portrait) works** | needs an image anchor. Portrait i2v: lip-sync GOOD, sound GOOD. Pure t2v → white screen (likely needs first-frame image). |
| **"weird music" sometimes at 1.5** | identity term amplifies ALL audio-ref features incl. musicality. Lever to try: `end_percent` < 1 (gate guidance to early steps). UNTESTED. |
| **Prompt format helps** | structured `[VISUAL]/[SPEECH]/[SOUNDS]` got the male's mouth moving where a flat prompt didn't. |

### Prompt format (official ID-LoRA)
`[VISUAL]: scene + appearance + style` · `[SPEECH]: the literal words to be spoken (speaker-tagged)` ·
`[SOUNDS]: voice tone + ambience`. All optional, all recommended. Words from [SPEECH]; voice from the ref clip.

### ⚠️ STAGE-2 DROPS IDENTITY — must reuse the ref-audio + LoRA on stage-2 (2026-06-24)
Splicing `LTXVReferenceAudio` into stage-1 ONLY (matching the official template's layout) is NOT enough for OUR
template. Running stage-2 changed voices completely + character FEATURES drifted — stage-2 ignored the identity.
Cause (verified in JSON):
- Our **stage-2 guider #32 model ← raw UNETLoader #4** (via reroute #258) — NO LoRA chain, NO ID-LoRA, NO
  ref-audio patch. (The LoRA chain ends at #277→#196 = stage-1 only; #191→#259 is a dead-end stage-2 line.)
- Our stage-2 sigmas start at **0.909** (higher denoise than official's 0.85) → regenerates more → identity loss worse.
- The official template survives stage-1-only because its stage-2 is a LIGHT low-denoise refine on the
  distilled-LoRA model; ours refines harder on a raw model.
FIX (applied): stage-2 guider #32 model repointed to the `LTXVReferenceAudio #274` MODEL output (carries LoRA
chain + identity post-cfg patch), same source as stage-1.

✅ **RESOLVED (2026-06-24): stage-2 `LTXVReferenceAudio` REMOVED — not needed.** A/B'd 0.65 sigmas WITH vs
WITHOUT the stage-2 ref-audio node → EXACT same result. The real cure for stage-2 drift was the SIGMAS
(start 0.909 → 0.65), NOT re-patching identity on stage-2. The node only cost an extra forward pass per stage-2
step for zero gain → deleted from stage-2. Identity holds via low-start-sigma refine alone. Lesson REFINED: only
re-patch identity on a stage that denoises HARD; a LIGHT refine (low start sigma) inherits stage-1's identity
without re-patching.

### FINAL shipped wiring (user, saved 2026-06-24) — TWO gates + a radio
- **`Input_Use_Reference_Audio`** (MpiIfElse): TRUE = goal-1 path (`LTXVReferenceAudio` voice-ID) → CFGGuider;
  FALSE = `Original Cond` (plain text conditioning). Gates the voice-ID branch.
- **`Input_Use_Input_Audio`** (MpiIfElse): the existing goal-2 gate (frozen-audio / Audio Mask path).
- Both audio inputs kept (`Input_Audio_File` feeds both). The app chooses which at dispatch.
- `talk3_ID_Lora` @ 1.0, `identity_guidance_scale` = 1.50 baked in. Stage-2 ref-audio node gone.
- **Cubric Vision UI plan:** a RADIO `Reference` | `Original`, ENABLED ONLY when audio is present. Drives the two
  gates (one mode live at a time). Implementation next → version bump → release.

NO SEED UI — see [[feedback-no-seed-ui]]: random seed every gen, never expose seed; the lottery is handled by
the model being seed-tolerant + workflow quality, not by user seed control.

### SHIP decision: one "Audio" RADIO — `Reference` | `Original`
- **`Reference`** = this path (`LTXVReferenceAudio` voice-ID). Reliable for ONE voice identity. i2v.
- **`Original`** = the SolidMask / frozen-audio path below (goal 2; claims multi-character).
- The radio IS the gate that resolves the goal1↔goal2 conflict (both tap `Input_Audio_File`, both feed the
  sampler — only one mechanism live at a time). User does the IfElse/gating wiring.
- Open: t2v image-anchor requirement; `end_percent` for weird-music; length auto-normalize window
  (cap+toast vs silently trim — TBD from length tests).

### Dep (re-host before public ship — third-party)
`ltx-2.3-id-lora-talkvid-3k.safetensors` (AviadDahan/TalkVid-3K, local at `C:/AI/loras/LTX2.3/id-lora-talkvid/`).

---

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

## ❌❌ SOLUTION B — "TESTED & ABANDONED" (2026-06-24) — ⚠️ SUPERSEDED, WRONG ROOT CAUSE
> ⚠️ **SUPERSEDED by the ✅✅ block at the TOP of this file.** The conclusion here ("voice-ID can't work on
> distilled, needs 30 steps") was WRONG — we tested the wrong NODE (`LTXVSetAudioRefTokens`, which cancels in
> cfg). The right node is `LTXVReferenceAudio` and voice-ID DOES work at 8 steps / cfg 1. Kept below as history
> (the node mechanics described are accurate; only the "distilled can't" verdict is refuted).
>
> _(historical)_ We built+tested the `LTXVSetAudioRefTokens` audio-ref-token path end-to-end (t2v + i2v).
> On distilled, input-voice identity did NOT carry via THAT node. Ambient-from-prompt DID work. We wrongly
> blamed the step count and reverted; later found the real cause was the wrong node.

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
