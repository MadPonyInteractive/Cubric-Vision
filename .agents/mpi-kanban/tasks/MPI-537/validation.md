# MPI-537 Validation

## 2026-08-11 — the graph works; dub works; sync-to-a-supplied-track does not

**Phase 1: PASS.** The bench copy of `LTX_lipdub_v2v_template.json` was fetched
twice over the userdata API and was byte-identical both times (sha256
`e64a070bdcfa821bb812a8cff1d01fca88d19284c3be719198de211e68b87a85`, 46,652 B, 36
nodes / 49 links). It is now in the repo at
`comfy_workflows/raw/ltx_v2v_lipdub_template.json`, byte-identical to the bench.
Converted against live 8188 with `scripts/workflow-to-api.mjs`: **31 API nodes, 0
missing required inputs, 0 dangling links, 0 unknown classes, nothing unreachable
from the `SaveVideo` output.** Five LiteGraph nodes drop in conversion and all
five are correct: two `MarkdownNote` (UI-only) and three the template already
ships **bypassed** (`#4979 PrimitiveString` + `#4980`/`#4981 GemmaAPITextEncode`,
mode 4) — the LTX-API text-encode path, which needs an API key.

**Two loader substitutions are mandatory on this bench, and they are not
cosmetic.** The template names weights this machine does not have:

| node | template value | what actually exists here |
|---|---|---|
| `#5028 UNETLoader.unet_name` | `ltx-2.3-22b-distilled-1.1_transformer_only_bf16.safetensors` | `..._int8_convrot.safetensors` |
| `#5029 DualCLIPLoader.clip_name1` | `gemma-3-12b-it-heretic-fp8-comfy.safetensors` | `gemma_3_12B_it_fp4_mixed.safetensors` |

Both replacements are the weights the **app already ships** (they match
`ltx_v2v_foley_template.json` `#1`/`#2`), so this is the right substitution for a
Flow — but it means the graph was authored against a different install and has
never run here as written. Without both, `/api/prompt` returns 400
`prompt_outputs_failed_validation`.

## THE RESULT: face size is the whole ball game

No talking-head clip exists in the library, so one was built: `t2v_ms_003.mp4`
(the woman in red, 73 frames @ 24fps) muxed with a speech track. That is exactly
the lipdub input case and needs no graph edit.

| run | source | mode | prompt_id | time | lips |
|---|---|---|---|---|---|
| 1 | red dress, **full 1920x1088 frame** | template (audio generated) | `59233832-…` | 110s | none |
| 2 | same + Fabio's `flutie8211…mp3` | `frozen_audio` swap | `2f05ba46-…` | 85s | none |
| 3 | same as run 2 | control, IC-LoRA `strength_model 0` | `0adee497-…` | 60s | none |
| 4 | **head-and-shoulders crop, native 960x544** | template (audio generated) | `6792a1de-…` | 100s | **MOVE** |
| 5 | same crop | official **two-stage**, out at 1920x1088 | `bfa2b7ac-…` | 283s | (unjudged) |
| 6 | same crop | `frozen_audio` swap | `5135859e-…` | 90s | none |

All six ran clean: `status success`, 0 `node_errors`, video and audio in every
output (levels between `-24` and `-21 dB` mean, nothing silent, nothing clipping).

**The variable that mattered was the size of the face in the guide.** Runs 1–3
fed a 1920x1088 clip that `#5009 ResizeImageMaskNode` squeezed to 960x544, leaving
the head a small part of the frame; nothing moved. Run 4 fed a head-and-shoulders
crop already at 960x544 — no downscale — and the lips moved. Same graph, same
weights, same seed. **Confirmed by Fabio watching it**, which is this card's
verify mode.

**Correction to an earlier reading of this card.** Runs 1–4 were first written up
here as "no lip motion in any run", including run 4. That was wrong, and it was a
sampling error, not a measurement: only twelve late frames were checked and the
subject is in profile through much of the clip. Fabio watched the file and saw the
mouth move. Judge a video by watching it; a strip of stills is not evidence of
absence.

**Voice cloning works too.** Run 4's generated track carries the voice character of
the supplied reference — Fabio's words: "the voice matches as well on that one".

### Dub works. Sync-to-a-supplied-track does not, and cannot here.

Runs 4 and 6 are the same source, same framing, same prompt, one link apart:

- **Run 4 — `#4528.audio_latent ← #3980 LTXVEmptyLatentAudio`** (as the template
  ships). Audio is *generated* from the prompt text, voice cloned from the
  reference tokens. **Lips move.**
- **Run 6 — `#4528.audio_latent ← #5006 LTXVSetAudioRefTokens:2` (`frozen_audio`).**
  The supplied track is preserved (`noise_mask=0`). **Lips do not move.**

That is the mechanism stated plainly: **the lips follow the audio the model
generates.** Freeze the audio and the model has nothing to sync against, so it
just reproduces the guide. True audio-preserving lipsync is therefore **not
available from this IC-LoRA**, and `frozen_audio` is not a shortcut to it.

`frozen_audio` is a **stage-2 device**, and the official workflow confirms it:
`LTX-2.3_ICLoRA_Lipdub_Two_Stage_Distilled.json` wires
`#5013 LTXVSetAudioRefTokens.audio_latent ← #4845 LTXVSeparateAVLatent:1` — the
**stage-1 generated** audio — then `#4969.audio_latent ← #5013:2`, so the upscale
pass regenerates video against audio it already made.

### What the feature is, from Lightricks

`ComfyUI-LTXVideo/README.md:99`:

> "Given a source video **and a text prompt containing the desired dialogue**, it
> generates new lip movements **and audio** that match the **target text** while
> preserving the speaker's identity."

So: text in, new voice + new lips out. Supplied audio is a **voice reference**,
never the thing the lips follow. Both this card's brief and MPI-4's brief describe
the audio front end as if a supplied track drives the sync; `plan.md` § Plan Drift
records the correction.

**Consequence for the product:** "drop in an audio file, get lips" needs a
speech-to-text step in front — transcribe the supplied audio, feed the transcript
as the prompt, and the model regenerates lips *and* a voice cloned from that same
audio. The output audio is a regeneration, not the original bytes. Fabio raised
this independently (people use Whisper for exactly this) and judged the cloned
voice a good enough match on run 4. **No Whisper node is installed** — `/object_info`
offers only `ElevenLabsSpeechToText` (external API, needs a key), so the STT step
is an open decision: a new node pack, or app-side transcription before dispatch.

### The two-stage port runs here

The bench template is a cut-down copy of the official two-stage workflow: node ids
line up one for one with
`example_workflows/2.3/LTX-2.3_ICLoRA_Lipdub_Two_Stage_Distilled.json` (50 nodes /
76 links) with the stage-2 half removed. The installed copy is **structurally
identical to GitHub master** (same 50 nodes, 76 links, no type or widget
differences; only cosmetic bytes differ).

The official graph runs on the **dev** checkpoint (`#5017 CheckpointLoaderSimple`
= `ltx-2.3-22b-dev.safetensors`, plus `#5018` adding the distilled LoRA at 0.5 —
"Distilled" in the filename is the distilled *LoRA* pipeline, not a distilled
checkpoint). Dev is not on this machine. It was ported to our weights **in API
format**, which needs no LiteGraph surgery and touches no saved workflow:

- `#5017` → `L_UNET` (UNETLoader, int8_convrot) + `L_VAE` (VAELoader, video)
- `#4982 LTXAVTextEncoderLoader` → `L_CLIP` (DualCLIPLoader, gemma fp4 + text projection, `ltxv`)
- `#4010 LTXVAudioVAELoader` → `L_AVAE` (VAELoaderKJ, audio, `main_device`, `bf16`)
- `#5018` dropped — our transformer is already distilled — so `#5012.model ← L_UNET:0`

11 links rewired, 44 nodes, structural check clean, and it **ran: 283s, success,
1920x1088 output**. `ltx-2.3-spatial-upscaler-x2-1.1.safetensors` is present in
`G:/CubricModels/latent_upscale_models/`. Whether stage 2 is worth 3x the time is
unjudged.

Watchable copies of every run: `C:/Users/Fabio/Downloads/MPI-537-lipdub/`
(`0` input, `1`–`5` the runs, `6` a source-vs-lipdub side-by-side, `7` the frozen-audio
dead end).

### Open, in priority order

1. **Face size is a hard input requirement, not a preference.** The app card needs
   to decide what happens when the user's clip is a wide shot — crop to the face,
   warn, or refuse. Nothing else in this card matters more.
2. **The STT decision** for the "supply audio" flow (node pack vs app-side).
3. **Single stage vs two stage** — Fabio's eye on `4_` vs `5_`.
4. Untested: multiple speakers (the LoRA supports one), non-English dialogue, and
   clips longer than 3s.
