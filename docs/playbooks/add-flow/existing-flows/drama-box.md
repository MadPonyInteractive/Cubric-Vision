# DramaBox (MPI-607) — text in, a performed line out

> Part of [add-flow/existing-flows](../README.md). Write a line, optionally hand it a
> voice to match, get a spoken take. **The second audio-only Flow, and the mirror image
> of [Voice Changer](voice-changer.md):** that flow needs a real recording and passes
> your delivery through, this one has no recording at all and generates the delivery
> from the words. Read this before touching the flow, its graph, or the DramaBox deps.

## Shape

| | |
|---|---|
| id / op | `drama-box` / `flowDramaBox` |
| graph | `comfy_workflows/flow_drama_box.json` (18 nodes) |
| `requiredModels` | `[]` — no model picker, no diffusion checkpoint |
| `requiredDeps` | 16 weights + `ComfyUI-MelodramaBox` — **15.23 GB** |
| `mediaType` | `'audio'` |
| inputs | prompt (`positive`), `Input_Duration` slider, **optional** `audio1` → `Input_Audio` |
| output | `SaveAudioAdvanced` titled `Output_Audio`, flac |

## Why it ships, and what the description may claim

**Approved on IDENTITY, not expressiveness.** Fabio's verdict after his own ear tests:
*"it sticks to the reference a lot better than Chatterbox, especially when we add our
performances to Chatterbox. Chatterbox just deviates a lot from the original voice, and
DramaBox doesn't."*

So holding a supplied voice is a real claim, and **being more expressive than Chatterbox is
not** — a single reference plus a prompted emotion delivered "not greatly, but that might be
prompting". Do not promise expressiveness as a comparison.

**But the description must lead with DIRECTION, not identity** (Fabio, 2026-08-28, reading
the slide-over). Both audio flows are text-to-speech, so a description that only says "hear
your line performed" makes the pair read as duplicates. The distinguishing thing is in the
graph, not in the marketing:

| | Text to Speech (Chatterbox) | DramaBox |
|---|---|---|
| voice source | **required** — `MpiLoadAudio#54` carries `block_if_empty` | **optional** — `MpiAnyChecker#14` forks to a sampler with no `voice_ref` |
| with no sample | cannot run | invents a speaker from the words |
| how you ask for a performance | you cannot | **write it into the line** |

That is why the prompt-only arm is not a fallback but the pitch: *"an exhausted old man"*,
*"a British woman"*, *"someone barely holding it together"* are the controls. Emotion goes in
the text, never in a slider — which is also why this flow has no exaggeration knob.

## 🔴 The duration slider is the single biggest quality control

`duration_seconds: 0` means *estimate from the prompt*, and that estimate is what makes
the model **read the prompt aloud** and stretch a line that should be delivered fast.
Fabio found this by ear and it corrected two earlier sessions of this card.

So the slider **never offers 0** — the estimator is not an option the user should be able
to pick back up. The node's own ceiling is 300 s; the slider stops at 30, which is where a
spoken *line* stops being one.

### The floor is 4 s — one above the model author's own — and the window is a HARD CUT

Taking the duration raw skips `sampling.estimate_duration`, and that function is
`max(3.0, round(estimate_speech_duration(text) * multiplier, 1))`. **Upstream never asks
this model to speak in under three seconds, whatever the text.** The slider shipped with
`min: 1`, offering a range below anything the model was ever asked to do, and the window
is a hard cut: a line that runs past it is simply truncated. Fabio hit it at 3 s and read
it as a broken model (MPI-645). `min` is now **4**, and the field carries a `note` saying
the window is hard — the number is a budget the user spends, not a hint.

**Why 4 and not upstream's 3** (Fabio's call, 2026-08-28): 3 s is upstream's floor for its
own *estimate*, and it is not enough once the envelope is measured. A 3 s ask delivers a
2.89 s file, every clip opens with 0.13–1.47 s of lead-in silence, and the worst sample
carried **1.15 s of audible speech**. `_007` vs `_008` below is the pair that settles it:
same prompt, 3 s truncates mid-word, 4 s completes with 0.39 s spare. 4 is the floor at
which the flow stops handing back a clip that is a quarter silence at the front.

🔴 **The ×1.1 pad is deliberately NOT copied over with the floor.** It is headroom over
upstream's own *estimate of the text*; applied to a number the user typed it restores no
protection at all — it makes the readout lie by 10 % and still cuts a line that needed
five seconds. Do not add it as "the other half of the fix".

`min` is enforced at payload time, not only by the widget: `mapDeclaredValue` clamps every
numeric field, so a card Reused from before the floor moved cannot render 4 and send 1.

### The delivered clip is never exactly the number, and that is not a bug

`generate_audio_latent` sizes the latent from the duration and then snaps it to the
patchifier's `8n+1` grid at `AUDIO_LATENT_FPS = 25`:

```python
n_frames = int(round(duration_s * fps)) + 1
n_frames = ((n_frames - 1 + 4) // 8) * 8 + 1      # -> decoder returns n_frames / 25 s
```

So the window quantises in **0.32 s steps and rounds to nearest**, and the decode then
loses a constant **0.03 s** on top (`delivered = n_frames / 25 − 0.03`). Measured with
`ffprobe` over all nine DramaBox clips in Fabio's own `TTS` project, each read against the
`Input_Duration` in its `.meta` sidecar:

| asked | latent frames | delivered | gap |
|---|---|---|---|
| 3 s | 73 | **2.89 s** | −0.11 s |
| 4 s | 105 | **4.17 s** | +0.17 s |
| 4.5 s | 113 | 4.49 s | −0.01 s |
| 5 s | 129 | 5.13 s | +0.13 s |
| 10 s | 249 | 9.93 s | −0.07 s |

The gap runs **−0.11 s to +0.17 s and is never a whole second** — it goes both ways, so it
is not a trim. Do not re-derive this — and note `ebur128` cannot help you here, it reports
the −70 LUFS silence floor on anything under ~10 s (memory `tool_measure_generated_audio`).

### 🔴 The window is NOT all speech — the model spends part of it on silence

**Measure the envelope, not the file length.** The file length above is not what an ear
calls the length: every clip opens with model-generated lead-in silence, and short windows
also come back with gaps in the middle. `silencedetect` at −45 dB over the same nine clips:

| clip | asked | file | lead-in | audible speech |
|---|---|---|---|---|
| `_001` "Hello my name is John" | 3 s | 2.89 s | **0.75 s** | **~1.15 s** (plus a 0.71 s hole at 1.08–1.79) |
| `_005` | 3 s | 2.89 s | 0.19 s | 2.26 s |
| `_006` | 3 s | 2.89 s | 0.24 s | 2.40 s |
| `_007` | 3 s | 2.89 s | 0.35 s | 2.54 s, **and cut mid-sound** |
| `_008` same line as `_007` | 4 s | 4.17 s | 0.17 s | 3.61 s, finishes 0.39 s early |
| `_004` | 10 s | 9.93 s | **1.47 s** | 5.32 s (a monologue with real pauses) |

Lead-in runs **0.13 s to 1.47 s** and does not scale with the window, so it cannot be
predicted from the number. That is why a 3 s request can be heard as "a two-second clip"
and the report is literally accurate rather than a rounding of 2.89.

**`_007` is the truncation, proven on the samples:** it has no trailing silence at all and
its last 100 ms peaks at **−8.0 dB** — the waveform is loud at the final sample, which is a
line cut off, not a line that ended. Every clip that finished ends quiet (−47 dB or below).

**`_007` vs `_008` is the whole product argument in one pair:** identical prompt, 3 s
truncates mid-word, 4 s completes it and still has 0.39 s spare. More window does buy more
line — the lead-in does not simply grow to eat it.

Open, and Fabio's call: whether to trim the lead-in off the output. `audio_prep.py` has a
`_trim_silence` helper but MelodramaBox **exposes no trim node**, and core's
`TrimAudioDuration` cuts at fixed times rather than at silence — so it needs an MpiNodes
node plus a graph re-export, which is a card of its own. Trimming alone adds no speech; it
only stops a 3 s ask returning a file that is a quarter silence at the front.

Two related widgets are dead in this graph and must not be resurrected as controls:

- **`duration_multiplier` does nothing.** `generate.py:179` uses an explicit duration RAW,
  so the flat `+2.0s` then `×1.10` — the source of the trailing silence earlier sessions
  chased — is bypassed entirely.
- **`quality_preset: default` ignores the steps/cfg/stg widgets.** `default` IS 30/2.5/1.5
  today so there is no behaviour difference, but a future cfg control would silently do
  nothing until the preset returns to `custom`.

## The audio slot is optional, and that is WIRING, not politeness

`MpiAnyChecker#14` reads `Input_Audio` and `MpiIfElse#15` picks between **two samplers** —
`#9` takes `voice_ref`, `#10` does not. An empty slot is a supported prompt-only route
where the voice is whatever the prompt describes, not a blocked run.

`tests/inject-params-titles.test.cjs` pins both arms. If both samplers ever take a
`voice_ref`, the op's `required: false` becomes a lie and the test fails first.

## 🔴 The negative prompt is BAKED and must stay that way

`_buildParams` emits `Input_Negative: negative || ''` on **every** run whatever the flow
declares. A node titled `Input_Negative` would therefore have its baked list replaced with
an empty string on every single generation, with nothing failing and nothing logged —
the bug Draw It In actually shipped (MPI-620).

The negative lives on `DramaBoxTextEncode.negative_prompt` instead. An earlier draft of
this graph *did* have the separate node; it was removed on the way in.

`Input_Positive`, by contrast, **must** be present here — this flow does collect a prompt,
which is exactly why Voice Changer's test asserts that title's *absence* and this one
asserts its presence. Same mechanism, opposite assertion, decided by whether the flow
reads a prompt.

## 🟢 These weights are ORDINARY deps — do NOT copy Chatterbox's `targetPath`

The neighbouring flow's weights are pinned into the engine tree with `targetPath` because
`ComfyUI_Fill-ChatterBox` computes its model directory from its own `__file__` and never
reads `extra_model_paths.yaml`. **MelodramaBox is the opposite case.**
`dramabox_nodes/config.py` resolves everything through
`folder_paths.get_folder_paths("diffusion_models" | "vae" | "text_encoders")`, which does
read the yaml — so these are plain `mpi_models/` deps with an ordinary `filename`, and a
`targetPath` here would be wrong.

## The text encoder is FOURTEEN dep entries

A dep is one file; there is no snapshot or folder dep type. `from_pretrained` on the
directory needs the config, the index, both shards and the whole tokenizer/processor set,
so the HF snapshot is enumerated file by file. Only `.gitattributes` and `.cache/` are
left out — nothing loads them.

**The ids keep each file's extension** (`…-tokenizer-json` vs `…-tokenizer-model`).
Stripping it collides two pairs: `chat_template.jinja`/`.json` and
`tokenizer.json`/`.model`.

The 4-bit unsloth snapshot is deliberate and not a size compromise — it is what upstream's
own inference path loads. `google/gemma-3-12b-it` is bf16 (~24 GB) **and** gated behind
Google's licence, so it needs HF auth the download manager does not have.

## HF-primary, no R2 copy

Every entry carries `noMirror: true`, the same call the Chatterbox block makes: without it
`check-dep-urls.mjs` reports 16 "no second origin" deps that read as forgotten. Mirroring
15.23 GB to R2 is a separate VPN-off job (the VPN throttles R2 ~15×, MPI-354).

Note the two ways of writing the size, because both appear in this card's history:
**15.23 GB binary** (what `assetDeps.js` prints, matching its neighbours) is the same
16,356,517,370 bytes as the **16.36 GB decimal** the earlier handoffs quote.

## English only, and the accent is the user's problem

The HF card carries a single language tag and makes no multilingual claim. Accent rides on
the **prompt** ("a British woman says…") and only accents the model was trained on land —
British and Australian confirmed, `deep_male_5` failed. That is a prompting concern and
deliberately **not** a control. Do not re-test this.

## Measured, do not re-derive

- Zero-shot clone at **−0.53 semitones** median-f0 vs its reference in ONE stage, against
  the Chatterbox chain's 1.20 st that needed TTS → VC.
- `extra_ref` **concatenates waveforms and discards the inner node's `strength`**, and only
  the first 10 s is encoded (`VOICE_REF_ENCODE_SECONDS = 10.0`). Chained references
  therefore BLEND voices rather than layering them.
- `max_duration_sec: 30` on the voice-reference loader is **inert** for the same reason —
  the encoder truncates at 10 s and tiles anything shorter.
- Fabio's own VRAM fix is the one in the graph: a single `Mpi Clear Vram` at the end,
  our own node. Two unload nodes were tried and are not needed.

## 🟢 The wall of "Uninitialized parameters" on every run is EXPECTED

Every DramaBox generation logs a `WARNING Uninitialized parameters or buffers:`
followed by a few hundred keys — `feature_extractor.video_aggregate_embed.*` and
`video_connector.transformer_1d_blocks.*`. It looks exactly like a broken install.
It is not, and it needs no action.

**Every one of those keys is VIDEO, in an audio-only model.** The model class
declares a video tower; the released audio checkpoint does not contain it, so the
loader initialises those parameters and says so. They are never executed on the
audio path.

Checked on 2026-08-28, so it does not need checking again:

- The safetensors headers of BOTH shipped weights carry **zero** video-named
  tensors. `feature_extractor.video_aggregate_embed.weight` and
  `video_connector.learnable_registers` are absent from each.
- `ResembleAI/Dramabox` ships **exactly two** weight files, and both are declared
  deps: `dramabox-dit` (6.12 GB) and `dramabox-audio-components` (1.81 GB). There
  is no third file we failed to fetch — those weights do not exist in the release.

🔴 **Why this is worth a section rather than a shrug.** It has the same SHAPE as
the Chatterbox silence bug (`chatter-box.md`): a swallowed initialisation failure
that still returns a plausible-looking result. What tells them apart is the OUTPUT,
never the log — Chatterbox's tell was a real `.flac` of zero duration at −91 dB,
while DramaBox produces real measured speech. So if this flow ever does go wrong,
**measure the audio**; do not start from this warning, which will be there either
way.

## FLAC, because `.opus` is a trap

`.opus` is missing from **four of the five** extension lists that classify a file as audio
(`js/utils/file.js` `AUDIO_EXTS` plus three in `routes/projects.js`; only line 90 has it) —
the same trap that forced `toWavFile` on the voice library. Core ComfyUI has no wav saver
at all: `SaveAudioAdvanced` offers flac/mp3/opus and that is the whole choice. FLAC is
lossless, so it costs nothing until something actually demands `.wav`.

## Not done yet

- **No `preview` / `video`.** The tile still and the wide hero are `/mpi-flow-graphics`
  work and the FlowDef deliberately omits both keys — naming art that does not exist 404s
  the Library tile and reddens the desktop suite. `object-stamp` currently ships the same
  way.
- **No live in-app run.** The graph converted and validated against the live engine
  (0 unknown class_types, 0 missing required inputs, 0 dangling links, 0 widget shifts),
  and the app engine already resolves both `.safetensors` from the dev model root — but a
  real generation through the Flow overlay has not been made.
- **Apple Silicon is unverified** and is a 2.0 gate. The 4-bit Gemma needs bitsandbytes,
  which ships exactly one Mac wheel (`macosx_14_0_arm64`), and a wheel is not a working
  backend. Checks are written out in `tasks/MPI-249/validation.md`; the gate line is on
  MPI-595's checklist. If it fails, the flow needs a platform gate and **none exists**
  anywhere in the registries — the agreed shape is a WARNING toast at install that still
  lets the user through, then an error toast on run, never a hard block. It earns a real
  guard rather than a description line (cf. MPI-584) because the failure arrives after a
  15.23 GB download and reads as a broken app.
