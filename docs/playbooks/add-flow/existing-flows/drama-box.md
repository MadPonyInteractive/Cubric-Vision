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

So the slider **starts at 1 and never offers 0** — the estimator is not an option the user
should be able to pick back up. The node's own ceiling is 300 s; the slider stops at 30,
which is where a spoken *line* stops being one.

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
