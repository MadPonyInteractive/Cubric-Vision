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

### JUDGED: a separate reference voice works, and line length is the sync lever

Two more runs, both with `#5005 LTXVAudioVAEEncode.audio` fed by its own `LoadAudio`
instead of the source clip's track — so the reference voice is decoupled from the video
and one voice can be reused across clips, which is the consistency use case. Same source
(`lipdub_face.mp4`, 3.04s / 73 frames), same reference (`flutie8211…mp3`, 7.3s), differing
only in how much dialogue the line asks for:

| output | line | Fabio |
|---|---|---|
| `refvoice_short_00001_` | "I don't know what is going on." | "not great sync" |
| `refvoice_tiny_00001_` | "I should leave now." | **"got a good sync"** |

**Both findings matter.** The standalone reference audio works — the voice still clones
with the reference no longer coming from the clip, which is what makes voice consistency
across separate videos possible. And **the sync lever is how much speech the line asks
for against how long the clip is**: the shorter line on a 3.04s clip syncs well, the
longer one does not. That is Lightricks' own note made concrete — "too long and the model
skips words, too short and it drags" — and it is a UI constraint, not a tuning knob: the
app has to relate line length to clip duration, or the user gets a bad sync with no idea
why.

Earlier evidence for the same lever: run 4 crammed the full 7.3s sentence into 3.04s and
Fabio noticed the timing was fast without being asked.

### THE REFRAME: the capability already ships, the gap is a VIDEO INPUT (Fabio, 2026-08-11)

Closing correction, and it may make this whole card the wrong tool. Fabio has already
tested **both** audio modes — reference audio *and* direct audio — and both work. Not
here, and not through the lipdub IC-LoRA: he ran them on **text-to-video and
image-to-video**, where the app graph takes an audio track and the character's lips
follow it. He has also driven **two voices in one audio file** to voice two characters
that way.

**The only reason it does not do video-to-video is that there is no video input on that
graph.**

That matches the architecture exactly. `ltx_i2v_t2v_template.json` wires
`Input_Audio #477` → `#198 LTXVAudioVAEEncode` → `#200 SetLatentNoiseMask` →
`#204 MpiIfElse` → `#145 LTXVConcatAVLatent.audio_latent`, with **no full-video
IC-LoRA guide pinning the frames** — only a start frame. The model must generate all
motion, so it animates the mouth to the supplied track. That is real audio-driven
lipsync and it is already in the product.

The lipdub IC-LoRA fails at exactly the point where that graph succeeds: its
`LTXAddVideoICLoRAGuide` reproduces every frame of the source, so freezing the audio
leaves the mouth pinned along with everything else (runs 2, 6, and the guide sweep at
0.75 and 0.50). It buys identity preservation and pays for it with the motion the
feature needs.

**So the app-side question is probably not "wire the lipdub graph".** It is: can the
graph that already does both audio modes accept a video instead of a start frame? The
v2v family (`ltx_v2v_template.json`, and the foley file) already takes video; the i2v
graph already takes audio and syncs to it. Nobody has yet tried to put the two halves
together, and that is a cheaper, better-understood path than anything in this card.

**Caveat, so the next session does not over-read this:** MPI-4 records
`Input_Use_Reference_Audio` as untested *on the v2v foley file*, which is a different
graph from the i2v one Fabio tested. Both statements are true. Confirm which graph any
given claim belongs to before relying on it.

## PHASE 4: the `Input_*` / `Output_*` title law (2026-08-11)

The graph now carries six injectable titles, so the app card inherits an injectable
file instead of a rename pass. **35 nodes / 48 links**, converting against **48188**
to **33 API nodes**: 0 unknown class_types, 0 missing required inputs, 0 dangling
links, nothing unreachable, one output node.

| title | node | wired to |
|---|---|---|
| `Input_Video` | `MpiLoadVideo` | `#5009 ResizeImageMaskNode`, `#1241`/`#5000`/`Output_Video` (fps) |
| `Input_Audio` | `MpiLoadAudio` | `#5005 LTXVAudioVAEEncode` — the standalone reference voice |
| `Input_Positive` | `MpiText` | `#2483 CLIPTextEncode.text` |
| `Input_Negative` | `MpiText` | `#2612 CLIPTextEncode.text` |
| `Input_Seed` | `MpiInt` | `#4832 RandomNoise.noise_seed` |
| `Output_Video` | `MpiSaveVideo` | images `#4995`, audio `#4848`, fps `Input_Video` |

**Two of these are node SWAPS, not renames, and that was not obvious from the plan.**
`MpiLoadVideo` has no `VIDEO` output — it emits `images`/`audio`/`fps` directly — so it
replaces **both** `#5002 LoadVideo` **and** `#5010 GetVideoComponents`, and its slots
0/1/2 land on exactly the consumers `GetVideoComponents` fed. `MpiSaveVideo` takes
`images`/`audio`/`fps`, so it replaces **both** `#4849 CreateVideo` **and**
`#4852 SaveVideo`. With the three bypassed Gemma-API nodes dropped (`#4979`
`PrimitiveString`, `#4980`/`#4981 GemmaAPITextEncode` — they need an LTX API key), the
net is -7 / +6 nodes.

**The two loader substitutions are now BAKED IN.** The first Phase 4 queue attempt
returned the same 400 `prompt_outputs_failed_validation` Phase 1 recorded, because the
template still named `ltx-2.3-22b-distilled-1.1_transformer_only_bf16` and
`gemma-3-12b-it-heretic-fp8-comfy` — weights this install does not have. They are now
the values `ltx_v2v_foley_template.json` already ships (`…_int8_convrot`,
`gemma_3_12B_it_fp4_mixed`). A template that cannot queue on our own install is broken,
and the app card would have inherited that too.

### The rewire is EQUIVALENT, not merely runnable

Re-ran the proven `refvoice_tiny` settings through the retitled graph — same clip
(`lipdub_face.mp4`), same reference voice, same line ("I should leave now."), same seed
43 — as `4b40f840-ae76-4317-8bc3-80ed5fb3d978`. **`status success`, 0 node_errors,
107.5s**, output **`lipdub_phase4_00001.mp4`**, `73x960x544`.

| | phase 4 | `refvoice_tiny` |
|---|---|---|
| duration / size / fps | 3.04s, 960x544, 24fps | 3.04s, 960x544, 24fps |
| streams | h264 + aac | h264 + aac |
| mean / max volume | -26.7 dB / -9.5 dB | -26.7 dB / -9.3 dB |
| video bitrate | 1866 kb/s | 1043 kb/s |

**PSNR y 44.31, average 45.34, min 43.49** frame-to-frame. Not infinite because
`MpiSaveVideo` encodes at a higher bitrate than core `SaveVideo` did — that is a
re-encode difference of the same frames, and the flat min-to-max spread (43.5-47.1)
shows no drift or divergence anywhere in the clip.

Confirmed structurally by diffing the two **dispatched** graphs off `/history`:
**24 shared nodes have byte-identical scalar inputs** — the sampler, sigmas, CFG guider,
`LTXAddVideoICLoRAGuide`, `LTXICLoRALoaderModelOnly`, `ResizeImageMaskNode`, and all
four loaders. The only three that differ are `#2483`, `#2612` and `#4832`, and they
differ *because* their literal now arrives over a link from the new `Input_*` node
instead of sitting in a widget. Added: the six new titled nodes. Removed: `#5002`,
`#5010`, `#4849`, `#4852` and the ad-hoc `REF_AUDIO` loader.

That also confirms baking the loaders changed nothing about what ran: `#5028`/`#5029`
were already identical, because the earlier runs applied the same substitution by hand
at dispatch.

**Verify (all three from plan.md Phase 4): PASS.** Re-converts clean; bench copy and
repo copy byte-identical (`6b5a6f790fad4315…`); a run still passes after the rename.

## JUDGED by Fabio, 2026-08-11: Phase 4 good, TWO-STAGE IS OUT

**Phase 4 passes his eye.** `lipdub_phase4_00001.mp4` is the retitled graph reproducing
`refvoice_tiny`. The title law costs nothing.

### Two-stage: "there is no movement in the mouth. face is good." - OUT for v1

`lipdub_2stage_00001_` (prompt `bfa2b7ac-36a8-4853-8069-e3896231b6bb`) upscales cleanly and
holds identity, and **the lips do not move**. It is the frozen-audio dead end again, and
the dispatched graph names the exact link:

```
#4845 LTXVSeparateAVLatent .1  (stage-1 audio latent)
  -> #5013 LTXVSetAudioRefTokens .audio_latent
  -> #5013 slot 2  == frozen_audio
  -> #4969 LTXVConcatAVLatent .audio_latent   (stage 2's sampler input)
```

So **stage 2 runs on `frozen_audio` by design**, while `#5014 LTXAddVideoICLoRAGuide` at
`strength 1.0` re-synthesises the video from the stage-1 frames. That is precisely the
configuration proven dead at guide 1.00 / 0.75 / 0.50: the track is preserved perfectly
and the mouth never moves, because the lips follow the audio the model *generates* and a
frozen track leaves nothing to generate. Stage 2 keeps the face and throws away the one
thing the feature exists for.

**Consequence: the official two-stage cannot be v1's resolution answer.** It is not a
tuning problem - the wiring makes lip motion impossible. If 1920x1088 is wanted, upscale
the *decoded* stage-1 video with the app's existing video-upscale path instead of
re-denoising it through the IC-LoRA. Do not spend more runs on the ported two-stage graph.

### `appi2v_lipsync_00001`: she does not move her mouth at all

The shipped app graph with the supplied track (`76de8155-f528-4926-8bda-c3b60a826a9b`,
`Input_Use_Input_Audio: true`, `Input_Use_Reference_Audio: false`) produced no mouth
movement either. **Fabio's read: the prompt has to state that she says something.** The
dispatched `Input_Positive` was:

> "A close-up of a woman ... looking straight at the camera and talking to the camera."

It says she is talking; it never gives her a line. Every lipdub run that *worked* carried
the dialogue explicitly - `talking to the camera, saying: "I should leave now."` - which
makes this the obvious next variable and it costs one run.

### The test of Fabio's read: put the line IN the prompt (`appi2v_speak_00001.mp4`)

Re-dispatched `76de8155` verbatim off `/history` - same start frame, same
`face_audio.wav`, same seed `984885689`, same toggles - changing **only**
`Input_Positive`, which gained the dialogue:

> ... looking straight at the camera and talking to the camera, **saying: "I don't know
> what is going on."**

`961e6779-270d-48ff-a056-abc2c4b73225`, `status success`, 126.3s, output
**`appi2v_speak_00001.mp4`** (960x512, 3.00s, video + audio).

**The prompt moved the generation a long way: PSNR y 20.41 against the no-dialogue run**
(average 21.95, max 34.72 on frame 1 where the start frame pins it, falling to min 21.31
as it diverges). For reference, the Phase 4 re-encode of an identical generation scored
44.31 on the same metric. So the dialogue is not a no-op - it changed what the model
generated.

**Whether it changed it into lip motion is Fabio's call, not a metric's** - a strip of
stills cannot prove or disprove motion in a clip (memory
`feedback_stills_cannot_prove_a_video_negative`, learned on this card).

## THE SHIPPED APP GRAPH ALREADY DOES AUDIO-DRIVEN LIPSYNC (2026-08-11, judged)

**`appi2v_512_00001.mp4` - "good lip sync", Fabio's words.** Supplied audio track, mouth
follows it. No lipdub IC-LoRA, no talking-head LoRA, no new node: this is
`ltx_i2v_t2v_template.json` exactly as it ships, on `Input_Use_Input_Audio: true`. **That
closes the singing case** - the one thing reference mode could never serve - and it
confirms the reframe: the capability ships, the gap is a video input.

Two conditions had to be met, and both were missing from the earlier `appi2v_lipsync`
attempt, which is why that one read as "no lipsync" and was wrong:

### 1. The prompt must carry the spoken line

`appi2v_lipsync_00001` prompted "...looking straight at the camera and talking to the
camera." - it says she is talking and never gives her a line. Fabio called this before any
test. Adding `saying: "I don't know what is going on."` moved the generation hard: **PSNR
y 20.41** against the no-dialogue run, on a fixed seed, where two encodes of an identical
generation score 44.31.

Independently confirmed by the elix3r model card (below), whose prompt recipe ends every
clip with `The person is talking, and he says: "[transcript]"`.

### 2. `Input_Height` MUST be divisible by 64, or the conditioning image desyncs

`Input_Height: 544` produced a **512**-tall video. The chain:

```
Input_Height 544 -> #156 MpiMath floor(a/2) -> 272 -> EmptyLTXVLatentVideo
272 is not a multiple of 32 -> latent floors to 256 -> x2 upscale -> 512 final
```

while `#516/#517 ImageResizeKJv2` size the conditioning image to the **injected** height,
544. So the image was 32 px taller than the latent it conditioned. The graph halves the
requested height before building the latent, so **only heights divisible by 64 survive
intact**; anything else is silently downgraded and desyncs image from latent. Re-running
at 960x512 fixed it. Worth carrying into the app card as an input constraint.

### The "different woman" was a bad start frame, NOT an app bug

Fabio: "this is a Caucasian woman... it's always the same woman", against an Indian woman
in the source. Diagnosed by looking at the frame instead of trusting the label: **frame 0
of `lipdub_face.mp4` is the BACK OF HER HEAD.** She starts turned away, moves through
profile around frames 8-16, and is only front-on from about frame 40. The earlier session
extracted frame 0 as `face_frame0.png`, so the graph was handed a head of hair and a prompt
that describes a scene but never says who she is - and the model invented a face. It also
explains the other half of the complaint, "all she does is turn to the camera": it
faithfully continued the turn it was given.

Frame 0 measured PSNR y 23.52 against its own conditioning image, and the corrected 512 run
still only 24.45 - both consistent with "no face was supplied", not with conditioning being
ignored. **The start frame must show the face**, which extends this card's face-size finding:
the face must be present and framed, not merely large.

## The elix3r talking-head LoRA (Fabio asked: have we tried this?)

**No - and it is not what this feature needs.** `elix3r/LTX-2.3-22b-AV-LoRA-talking-head`,
428,150,680 bytes, is **a different file** from the `ltx-2.3-id-lora-talkvid-3k.safetensors`
(1,157,884,304 bytes) sitting in `G:/CubricModels/loras/ltx-2.3/id-lora-talkvid/`. Neither
has ever been run here.

Three things rule it out as a shipped dependency:

- **It is a subject LoRA for one identity.** Trigger word `OHWXPERSON`, trained on 26 clips
  of a single person. It generates *that* person.
- **It does not serve the singing case.** The card is explicit that it "internalizes voice
  characteristics **without requiring external audio input at inference time**" - lips follow
  audio the model generates, exactly the limitation the lipdub IC-LoRA has.
- **Licence blocks it.** "The LoRA weights are released for research and personal use.
  Commercial use requires separate permission."

**What IS valuable is its README, and it corroborates our own graph.** Step 3 of their
training recipe generates the dataset with **base LTX-2.3 and no LoRA at all**, through
`Workflows/LTX-2-3-I2V-Custom-Audio.json`. Read that workflow's audio path:

```
LoadAudio[372] -> TrimAudioDuration[373] -> LTXVAudioVAEEncode[364]
  -> SetLatentNoiseMask[363]   (SolidMask[362] value 0 = fully frozen)
  -> LTXVConcatAVLatent[109].audio_latent
```

That is **the identical mechanism `ltx_i2v_t2v_template.json` already ships**
(`Input_Audio -> #198 LTXVAudioVAEEncode -> #200 SetLatentNoiseMask -> #145
LTXVConcatAVLatent`). Our wiring was never the problem.

Three tunables from the card worth trying before the app card settles:

- **1280x704 @ 25fps** for image+audio inference, "to match the training distribution"
  (704 is divisible by 64, so it survives the halving above). Our runs were 960x512 @ 24.
- The mouth-behaviour prompt block: *"Mouth partially open during speech with only the
  front teeth partially visible, lips moving naturally without fully exposing all teeth."*
- **"Background complexity directly impacts lip sync quality. Simple and dark backgrounds
  produce the best results."**

### Confirmed: a face-forward start frame preserves identity (`appi2v_face64_00001.mp4`)

Same run again, changing only the start frame - **frame 64** of `lipdub_face.mp4`, cropped
to 960x512, where she is front-on and the face is at its largest. `7fe7d452-714c-4562-a05b-1b938927ffc3`,
`status success`, 71.0s.

**It is the same woman.** Frame 0 of the output is the source character - face, skin tone,
features, earrings, red dress, dark sky. Identity was never the graph's failing; it was the
missing face in the conditioning image.

**PSNR cannot judge identity, and it said the opposite.** This run scored **y 20.26**
against its conditioning image - *lower* than the wrong-woman run's 23.52 - because the
camera has pushed in slightly and the hair has moved. Both numbers are measuring framing,
not identity. The question was settled by opening the frame and looking at it, and the
metric would have sent the next session chasing a bug that does not exist. Same family of
error as `feedback_stills_cannot_prove_a_video_negative`, from the opposite direction: there
a still could not disprove motion; here a pixel metric cannot decide sameness of a person.

## FABIO'S CLOSING VERDICT (2026-08-11) - the card is done, and the i2v thread is NOT the gap

**`appi2v_face64_00001.mp4`: identity held, the mouth did not move.** His read: **seed**.
He has seen exactly this on earlier image-to-video tests - some seeds simply do not move the
mouth. The elix3r model card lists the same thing independently under known limitations:
*"seed-dependent output quality"*.

**This retires the i2v thread for this card, on his direct statement:** image-to-video with
an audio track already works in the shipped app, across multiple characters, and he has
already driven two voices in one file. It was never the missing piece.

> "We just needed this video workflow, where the user inputs a video, gives it an audio file,
> and can give audio to the characters and make the characters move their mouth. We already
> proved that. The phase4 generation works well."

**So the deliverable of this card IS the lipdub graph** - the video-in front end the LTX
family did not have - and Phase 4 is the shipped shape of it. `Input_Video` takes the user's
clip, `Input_Audio` gives the character a voice, `Input_Positive` carries the line.

### Correction to the two-stage verdict recorded earlier

That verdict was **n=1**, and seeds are now known to kill mouth motion on their own. The
wiring argument still stands on its own evidence - stage 2 samples on `frozen_audio`, which
was proven dead across three guide strengths - but "the two-stage run had no lip motion" is
one observation and cannot by itself carry the conclusion. **If two-stage is ever revisited,
re-run it across several seeds before trusting the OUT call.** It stays out for v1 either
way: it costs 3x the time and the resolution can be had by upscaling the decoded stage-1
video through the app's existing path.

### Card status

All five phases complete. The graph is authored, proven, retitled to the injection contract,
and judged working by the user - which is this card's `user-ux` verify mode satisfied.

### Open, in priority order

1. **Face size is a hard input requirement, not a preference.** The app card needs
   to decide what happens when the user's clip is a wide shot — crop to the face,
   warn, or refuse. Nothing else in this card matters more.
2. **The STT decision** for the "supply audio" flow (node pack vs app-side).
3. **Single stage vs two stage** — Fabio's eye on `4_` vs `5_`.
4. Untested: multiple speakers (the LoRA supports one), non-English dialogue, and
   clips longer than 3s.
