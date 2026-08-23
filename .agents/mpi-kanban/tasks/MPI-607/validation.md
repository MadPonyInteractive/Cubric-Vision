# MPI-607 Validation

## 2026-08-23 — TTS-Audio-Suite evaluation (replaces the Qwen-silence measurement)

Three checks run against `diodiogod/TTS-Audio-Suite` (shallow clone in the session
scratchpad, not installed on the bench). Vision repo unchanged.

### 1. Licence — PASS

MIT (`LICENSE`, "Copyright (c) 2025 Shmuel Ronen"). Compatible with vendoring into
`ComfyUi-MpiNodes`. This is the point of difference from `1038lab/ComfyUI-QwenTTS`,
which is GPL-3.0 and was already ruled out.

### 2. Dependency closure vs the curated lock — FAIL for full adoption

Command (uv 0.6.0, Vision's `python_deps.in` merged with the suite's
`requirements.txt`, comments stripped, torch trio excluded as the compile does):

```
uv pip compile merged.in --no-emit-package torch --no-emit-package torchvision \
    --no-emit-package torchaudio -o merged.txt
```

Result:

```
  x No solution found when resolving dependencies:
  `-> Because you require numpy==2.5.1 and numpy>=1.26.4,<2.3.0, we can
      conclude that your requirements are unsatisfiable.
```

The suite ceilings numpy at `<2.3.0`; Vision pins `numpy==2.5.1`. Hard conflict, fails
loudly — exactly the failure mode the curated single-lock exists to surface.

Re-run forcing Vision's numpy pin (suite numpy line dropped) **does** resolve, so numpy
is the only hard blocker. But the cost of the rest is the real verdict:

| Measure | Value |
|---|---|
| Current curated lock | 125 packages |
| Merged lock | 238 packages |
| **Added** | **113** |
| **Version moves forced** | **21** |

`transformers` does NOT move (stays 5.13.0). Moves include `huggingface-hub 1.26.0 ->
1.28.0`, `onnxruntime-gpu 1.28.0 -> 1.29.0`, `diffusers 0.39.0 -> 0.40.0`,
`protobuf 7.35.1 -> 7.36.0`, `setuptools 83.0.0 -> 84.0.0`, `mediapipe 1.0.0 -> 1.0.1`.

Three disqualifiers inside the 113:

- **Three rival opencv distributions** — `opencv-python`, `opencv-python-headless` and
  `opencv-contrib-python` all arrive alongside Vision's pinned
  `opencv-contrib-python-headless`. A resolver cannot dedupe same-namespace
  distributions; all four provide `cv2` and the last installed wins.
- **Telemetry** — `sentry-sdk` and `wandb` enter the closure of a desktop app that
  ships no telemetry.
- **Dead weight** — `keras`, `pandas`, `datasets`, `faiss-cpu`, `modelscope`,
  `aliyun-python-sdk-core`, `aliyun-python-sdk-kms`, `oss2`, `funasr` — engines and
  training paths Vision would never dispatch.

The suite also expects its own `install.py` to run (ComfyUI-Manager triggers it), which
does selective `--no-deps` pip installs and deliberate numpy downgrades at runtime. That
is precisely the per-node resolve behaviour MPI-413 removed.

### 3. Isolated runtime — REAL, and cheaper than estimated

`utils/runtimes/` is a full subsystem: `bootstrap.py`, `launcher.py`, `session.py`,
`protocol.py`, `profiles.py`, plus per-engine proxy/worker pairs including
`qwen3_tts_proxy.py` and `workers/qwen3_tts_worker.py`. Text in, audio out, over a
subprocess — the ComfyUI process never imports transformers 4.

`profiles.py` defines `qwen3_tts_transformers4_dedicated`:

```python
_QWEN3_T4_PACKAGES = [
    "numpy>=1.26.4,<2.3.0", "soundfile>=0.12.0", "librosa",
    "transformers>=4.51.3,<=4.57.3", "kernels>=0.6.1,<=0.9",
    "accelerate", "huggingface-hub<1.0", "safetensors>=0.6.2",
]
```

with `inherit_base_site_packages=True`.

Two consequences, both correcting the earlier estimate in this session:

- **torch is inherited, not duplicated.** The earlier ~3 GB figure assumed a standalone
  env. Resolved closure of the profile above is **44 packages** with the torch trio
  excluded — hundreds of MB, not 3 GB.
- **The Windows-embeddable venv problem is already handled.** Vision's engine python is
  the embeddable distribution and has no `venv` module (verified on the bench:
  `ModuleNotFoundError: No module named 'venv'`, Python 3.13.12, `python313._pth`).
  `bootstrap.py` falls back to pip-installing `virtualenv` and building the runtime with
  that. Plausible, **not yet verified** against the embeddable interpreter — the `._pth`
  that disables `site` is the remaining risk.

Unchanged concerns: the runtime installs itself at first use into the node pack folder,
so it is invisible to Vision's download manager, progress UI and dep lock, and it does
not exist on the Pod.

### Verdict

- Adopt the suite wholesale: **NO** (dep closure).
- Its isolated-runtime pattern: **validated prior art**, MIT, and much cheaper than the
  session's earlier estimate.
- The Qwen-silence measurement on `1038lab/ComfyUI-QwenTTS` is **withdrawn, not
  deferred** — wrong pack (GPL-3.0), and the transformers-5 API-patching route it tested
  is abandoned.

Not yet evidence for closing the card. Fabio has not heard any audio, and no engine has
generated anything this session.

## 2026-08-23 — Step 2b: does a Qwen-designed voice clone through Chatterbox?

Automated half PASSED. The verdict itself is Fabio's ears (`**Verify mode:** user-ux`).

### Route change — the planned HF Space is dead

`Qwen/Qwen3-TTS-Voice-Design` is **not a model demo**. Its `app.py` is a thin proxy to
Alibaba DashScope (`POST /api/v1/services/audio/tts/customization`,
`model: qwen-voice-design`, `target_model: qwen3-tts-vd-realtime-2025-12-16`) using the
Space owner's `API_KEY`. It runs on `cpu-basic` and holds no weights.

It currently fails for **everyone** — the gradio API returns `event: error / data: null`
immediately, and clicking **Generate Voice** in the browser UI renders `Error` with no
audio (checked at 6/12/18/24/30/36s). Not an API-path problem; the Space's DashScope key
is dead or out of quota.

**Used instead: `Qwen/Qwen3-TTS` — the official Space, `zero-a10g`, running the real open
weights.** Its `requirements.txt` is `torch==2.8.0`, `transformers==4.57.3`,
`accelerate==1.12.0`, `kernels`, `sox`, `onnxruntime`. Endpoint
`/generate_voice_design(text, language, voice_description)`.

Two things fall out of this, both relevant beyond Step 2b:

- **VoiceDesign open weights exist and are the thing we would host.**
  `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign`, Apache-2.0, with
  `Qwen/Qwen3-TTS-Tokenizer-12Hz` (from the bench pack's `MODEL_ID_MAP`; the pack calls
  `snapshot_download` + `from_pretrained` and never touches DashScope). Step 2b' is not
  moot.
- **The official Space is a working recipe for the Pod bake** — transformers 4.57.3 on
  torch 2.8.0, confirmed serving this model on an A10G.

### 1. Voice design — PASS

Three designs, one shared ~10s reference script, `language="English"`:

| slug | sr | sec | peak dB | rms dB | silent% |
|---|---|---|---|---|---|
| `young_male_us_warm` | 24000 | 15.66 | -0.0 | -19.5 | 7.0 |
| `midage_female_uk_narration` | 24000 | 16.94 | -0.0 | -18.1 | 1.7 |
| `senior_male_gravel_character` | 24000 | 19.58 | -0.0 | -18.8 | 6.2 |

(silent% = share of 20ms frames peaking under -50 dBFS.)

**PR #201's 67-99% silence does not appear** — as expected, since this Space runs the
supported `transformers==4.57.3` pin. It says nothing about transformers 5, which stays
abandoned.

### 2. Clone through Chatterbox — ran clean

Bench (`G:/ComfyUi`, port 8188), API-format graph
`LoadAudio -> FL_ChatterboxTTS(audio_prompt) -> SaveAudio`, seed 42, defaults
(exaggeration 0.5 / cfg_weight 0.5 / temperature 0.8). Chatterbox speaks **different
text** from the reference clips, so this tests transfer and not echo.

Two controls, because "sounds a bit off" is unreadable without them:

- **D** — Chatterbox with **no** reference (its own default voice).
- **C** — Chatterbox cloning a **real human** clip (`eslyes_dailylife002_honda.mp3`,
  33.6s, 0.1% silence). Separates "synthetic reference clones badly" from "this is just
  Chatterbox's ceiling".

| file | sec | rms dB | silent% |
|---|---|---|---|
| `B1_CLONE_young_male_us_warm.flac` | 7.12 | -17.8 | 7.3 |
| `B2_CLONE_midage_female_uk_narration.flac` | 7.12 | -15.6 | 9.6 |
| `B3_CLONE_senior_male_gravel_character.flac` | 7.52 | -17.1 | 10.6 |
| `C2_CLONE_real_human_control.flac` | 9.04 | -14.7 | 7.7 |
| `D_BASELINE_chatterbox_default_voice.flac` | 5.32 | -16.9 | 6.8 |

All five produced real audio at sane levels. First run took 96.5s (Chatterbox weight
download + load); every later run 15-18s warm.

Listening set, `A`=Qwen reference / `B`=its Chatterbox clone / `C`=real-human control /
`D`=no-reference baseline: **`D:\WORK\Images\Outputs\mpi607\`** (bench output root is
`D:\WORK\Images\Outputs`, not `<ComfyUI>/output`).

### Verdict

Pipeline PROVEN end to end; **timbre-transfer quality is NOT yet judged** — that is
Fabio's listen, and it is what decides the design-then-speak chain.

Probes preserved in `research/`: `qwen_voicedesign_fetch.py`,
`chatterbox_clone_test.py`, `measure_wavs.py`.

### Step 2b VERDICT — PASS (Fabio, 2026-08-23, by ear)

> "The A to B clones are all really good, spot-on."

**A Qwen-designed synthetic voice clones through Chatterbox as well as we need.** All
three designs — young US male, middle-aged British female, elderly gravelly male —
transferred timbre onto text the reference never spoke. The design-then-speak chain
holds, and the synthetic-library route is not blocked on audio quality. The VCTK + GLOBE
fallback in `research/voice-library-02` is not needed for this reason and can stay parked.

**The C control was invalid — my error, not Chatterbox's.**
`eslyes_dailylife002_honda.mp3` is a **two-speaker conversation**, not the clean
single-speaker clip the control needed. Chatterbox got a mixed reference and `C2` came
out as a male voice unlike either speaker in `C1`. The control was only there to
distinguish "synthetic references clone badly" from "this is Chatterbox's ceiling";
A→B landing spot-on answers that without it, so it was not re-run.

**But its failure is itself a finding worth keeping** — a multi-speaker reference
appears to degrade cloning badly rather than picking one speaker. This is the "clip
suitability" concern already flagged in `plan.md` § Preservation Notes, now with an
observation behind it. **Not isolated** — the clip was also 33.6s and 44.1kHz, so
speaker count is the likely cause but is not proven against those. It matters at Flow
level: if a user can supply their own reference, the Flow probably needs to reject or
warn on multi-speaker audio instead of silently producing a voice that is nobody. Worth
one deliberate experiment before Step 3's UI is designed.

## 2026-08-23 — CORRECTION: the `._pth`-disables-`site` risk is FALSE for our engine

Recorded earlier in this file as "the `._pth` that disables `site` is the remaining
risk" for any isolated-runtime design. Measured, and it does not apply:

| | bench (`G:\ComfyUi\python_embeded`) | app engine (`engine\ComfyUI_windows_portable\python_embeded`) |
|---|---|---|
| Python | 3.13.12 embeddable | 3.13.14 embeddable |
| `venv` module | absent | absent (as recorded) |
| `python313._pth` `import site` | **uncommented — site ENABLED** | **uncommented — site ENABLED** |
| `virtualenv` | **installed, 21.7.4** | not installed |

Both `python313._pth` files carry the same three path lines (`../ComfyUI`,
`python313.zip`, `.`), the commented hint, and then a live `import site`. So `site` runs
on both interpreters. The concern came from the *stock* embeddable layout, where that
line is commented out; ComfyUI's portable build uncomments it.

`virtualenv 21.7.4` importing on the bench's embeddable interpreter also proves
pip-install-virtualenv works on this class of Python — the bootstrap TTS-Audio-Suite
relies on. Still unproven: that `virtualenv` can **create** a working env from an
embeddable interpreter and that torch + transformers 4.57.3 run inside it. That is what
the bench designer test measures.

Net: option B's risk is materially lower than this file previously recorded, and the
bench is a faithful proxy for the app engine (same embeddable build, same `._pth` shape,
patch-level Python difference only).

## 2026-08-23 — Qwen3-TTS VoiceDesign RUNS LOCALLY on the bench. Option B's core gate PASSED.

Built at `G:\ComfyUi\_qwen_tts_rt\`. Bench ComfyUI untouched — still transformers 5.13.0,
nothing uninstalled, no node added to `custom_nodes/`.

### The pack

`flybirdxx/ComfyUI-Qwen-TTS` v1.0.7 — registry id `qwen3-tts-comfyui`, **Apache-2.0**,
50,416 downloads, node class `FB_Qwen3TTSVoiceDesign`. This is the pack from the tutorial
Fabio was watching, and the licence makes it vendorable — unlike `1038lab/ComfyUI-QwenTTS`
(GPL-3.0) sitting on the bench.

**Its `requirements.txt` pins `transformers>=4.57.0,<5.0.0`.** A hard ceiling, so it can
never load in-process in the bench ComfyUI (5.13.0) or the app engine (5.13.0). Only its
bundled `qwen_tts` package is used here, imported directly, outside ComfyUI.

Deliberately NOT done: downgrading the bench to transformers 4.57.x. ComfyUI core would
allow it (`transformers>=4.50.3`, no ceiling) and seven bench packs import transformers,
but it would leave the authoring bench a MAJOR version behind the app engine — a workflow
that runs on the bench and dies in the app, silently.

### What was proven (this is option B's gate, not a proxy for it)

| Step | Result |
|---|---|
| `virtualenv` creates a venv FROM the embeddable interpreter | **WORKS** — `CPython3.13.12.final.0-64` in 6.8s |
| torch inherited, not duplicated | **WORKS** — `torch 2.12.0+cu130`, `cuda_avail True` |
| transformers 4.57.3 in the venv while base stays 5.13.0 | **WORKS** — both verified in the same session |
| pip cannot damage the base env | **CONFIRMED** — "Not uninstalling transformers at `g:\comfyui\python_embeded\lib\site-packages`, outside environment" |
| model loads and generates on GPU | **WORKS** — load 3.1s, generation 6-33s per clip |

**Install cost: 4 packages, ~13 MB** (`transformers` 4.57.3, `accelerate` 1.12.0,
`huggingface-hub` 0.36.2, `kernels` 0.12.3). The base env supplied everything else. Far
below the 44-package estimate in the TTS-Audio-Suite section above, because that figure
assumed nothing was inherited.

Note `huggingface-hub` had to drop to <1.0: transformers 4.x requires it, the bench base
is on 1.26.0. It lands in the venv only. This is exactly why the runtime must be isolated
rather than merged.

### THE EMBEDDABLE GOTCHA — `--system-site-packages` alone does NOT inherit

`virtualenv --system-site-packages` off the embeddable interpreter produced a venv whose
`pyvenv.cfg` says `include-system-site-packages = true`, and `torch` was still
`ModuleNotFoundError`. `sys.path` contained `G:\ComfyUi\python_embeded` — the **prefix** —
but never `G:\ComfyUi\python_embeded\Lib\site-packages`, where the packages actually live.
The config flag is set and inheritance silently does not happen.

Fix, one line, written into the venv:

```
# G:\ComfyUi\_qwen_tts_rt\venv\Lib\site-packages\_base_site.pth
G:\ComfyUi\python_embeded\Lib\site-packages
```

Order is right by construction: the venv's own `site-packages` precedes a `.pth` addition,
so venv transformers 4.57.3 shadows base 5.13.0 rather than the reverse.

**This bites TTS-Audio-Suite's `inherit_base_site_packages=True` on this interpreter too.**
Any isolated-runtime design for Vision must add the base `site-packages` explicitly instead
of trusting the flag — otherwise it silently reinstalls a multi-GB torch, or fails.

### Second gotcha — the language argument

`generate_voice_design(language=...)` wants the spelled-out name. `"en"` raises
`ValueError: Unsupported languages: ['en']`. Legal values: `auto`, `chinese`, `english`,
`french`, `german`, `italian`, `japanese`, `korean`, `portuguese`, `russian`, `spanish`.

Benign at startup, both harmless: `sox` binary missing (pysox; only the 25Hz tokenizer
path needs it, we run 12Hz) and `flash-attn` not installed.

### Weights

`Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign` (4.3 GB) + `Qwen/Qwen3-TTS-Tokenizer-12Hz`
(651 MB), both Apache-2.0, in `G:\ComfyUi\ComfyUI\models\qwen-tts\` — the folder the pack
itself would look in, so wiring the nodes later needs no re-download.

### Output — 11 clips, awaiting Fabio's listen

Settings taken verbatim from the tutorial screenshots: 1.7B, bf16, `english`,
`max_new_tokens` 2048, `top_p` 0.80, `top_k` 20, `temperature` 1.0,
`repetition_penalty` 1.05. Seeds fixed at 1000+i for reproducibility.

`t1`-`t5` are Fabio's five tutorial prompts verbatim, so they compare directly against the
video. `lib_*` are six library seeds written in the same prompt grammar over one shared
~10s reference script, sized to be cloned by Chatterbox.

| file | sec | rms dB | silent% |
|---|---|---|---|
| `t1_playful_chuckle` | 3.82 | -19.9 | 11.1 |
| `t2_soft_crying` | 7.18 | -22.2 | 37.2 |
| `t3_cold_anger` | 4.22 | -20.1 | 32.4 |
| `t4_tense_whisper` | 2.62 | -22.3 | 34.6 |
| `t5_trailer_voice` | 6.70 | -21.9 | 12.9 |
| `lib_m_young_warm` | 10.70 | -21.5 | 9.4 |
| `lib_m_midage_authoritative` | 12.06 | -23.4 | 4.8 |
| `lib_m_senior_gravel` | 13.90 | -21.9 | 13.1 |
| `lib_f_young_bright` | 11.18 | -22.8 | 5.7 |
| `lib_f_midage_narration` | 12.86 | -21.9 | 15.7 |
| `lib_f_senior_gentle` | 12.94 | -19.8 | 14.1 |

The 32-37% silence on `t2`/`t3`/`t4` is the direction being followed, not a fault — "shaky
breath", "clipped delivery" and "minimal volume" all produce sparse speech, and RMS stays
healthy around -20 dB. Nothing resembling PR #201's 67-99% dead output.

Listening folder: `D:\WORK\Images\Outputs\mpi607_design\`, each `.wav` beside a `.txt`
holding its text, direction and seed.

Runner preserved as `research/design_voices.py`.

### VERDICT on the local designer — PASS (Fabio, 2026-08-23, by ear)

> "I've heard the samples, and they more or less match the tutorial. Of course, different
> seeds produce different results. So they don't 100% match, but they match it enough."

**Direction-following on the local runtime matches the tutorial.** The open worry that
prompted this whole leg -- that our results might not follow voice direction as well as
the video's -- is answered. Qwen3-TTS VoiceDesign is NOT deterministic, so seed variation
is expected and is why the authoring plan takes 3 samples per prompt and keeps the most
consistent.

### Library shape — Fabio's constraints (2026-08-23), not yet designed

- **Size: 50-100 distinct voices.** "Probably more than enough if we go down that route."
- **Grouping like ElevenLabs**: voice TYPE alongside demographics -- narrator,
  documentary, plus gender / age band / cartoony.
- **Organisation: folders or filters**, on sex and type. Undecided.
- **The ceiling is acknowledged and accepted**: "if a user decides to do a realistic film
  with 50 characters, he has a little bit of a problem." A fixed library cannot cover an
  unbounded cast -- which is the same objection that killed the picker as the ONLY answer
  earlier today.
- **Bring-your-own stays open**: "User also always has the option of going online and
  picking voices. [The user] sees responsibility for what it uses anyway." Chatterbox
  already accepts any reference clip, so the library is a starting point, never the only
  path -- and a user-supplied clip keeps the user as controller, per
  `research/voice-library-03`.

## 2026-08-23 — DECISION: ship Chatterbox + a self-authored voice library. Qwen is NOT shipped.

Fabio, 2026-08-23: *"the decision is done here. We're going to quit shipping Qwen, and
we'll ship Chatterbox with a library."*

**His reason is an architectural one and it is the load-bearing part of this decision:**

> "I'm starting to be a bit concerned about these environments, a very new environment
> causing issues when we do have an app that changes from model to model constantly for
> the user to achieve whatever the user is trying to do. I'm concerned that, being a
> fragile ecosystem here, it might introduce a lot more complexity and issues that are
> unwanted."

This is NOT the cost objection that the bench test retired. The bench proved the isolated
runtime is cheap (4 packages, ~13 MB) and cannot damage the base env (pip refuses:
"outside environment"). What survives is coupling: **the 13 MB figure exists only because
torch is INHERITED from the engine.** That share is the fragility. Bump the engine's torch
or ComfyUI version and a transformers-4.57.3 venv is suddenly running against a torch it
never saw, silently, until someone generates a voice. Full isolation (its own torch,
~3 GB) is robust and expensive; inheriting is cheap and coupled. There is no third option.
Plus: installs at first use so it is invisible to the download manager / progress UI / dep
lock, +4.9 GB of weights, does not exist on the Pod, and every `/mpi-bump-engine` gains a
second environment to smoke-test forever.

**Qwen3-TTS VoiceDesign becomes a BENCH AUTHORING TOOL, not a shipped feature.** It stays
at `G:\ComfyUi\_qwen_tts_rt\`, we author the library with it, no user ever touches it,
and none of the fragility above reaches the app. Whether it later becomes a user-facing
feature is a separate decision that does not have to be made now.

### Chatterbox IS multilingual — 23 languages, and it takes a reference clip

`FL_ChatterboxMultilingualTTS` (already on the bench) exposes `language` plus the same
`audio_prompt` input. So **one supplied voice can speak many languages**, answering
Fabio's question directly. Full list: Arabic, Danish, German, Greek, English, Spanish,
Finnish, French, Hebrew, Hindi, Italian, Japanese, Korean, Malay, Dutch, Norwegian,
Polish, Portuguese, Russian, Swedish, Swahili, Turkish, Chinese.

It also carries params plain `FL_ChatterboxTTS` does not: `repetition_penalty` (default
2.0), `min_p`, `top_p`.

### ACCENT must be baked in at DESIGN time — Chatterbox cannot be asked for one

> **SUPERSEDED 2026-08-23 (session 13) — this section's CONCLUSION is wrong. Fabio drove
> `FL_ChatterboxMultilingualTTS` and its `language` selector imposes an ACCENT on the cloned
> voice at RUNTIME.** See "Accent IS a runtime parameter" below. The reasoning here is still
> correct for plain `FL_ChatterboxTTS`, which genuinely has no voice prompt — the error was
> generalising from it to the whole model family when the multilingual sibling has a control
> surface plain TTS does not. Read this section as "accent cannot be requested from PLAIN
> TTS", nothing wider.

Chatterbox has **no text prompt describing the voice**; the reference clip is the only
control surface. So an accent can only reach the output by already being in the reference.
That makes the accent list a **library authoring requirement**, not a runtime feature.

Confirmed sideways by the language test: `lang3_es_auto` produced, in Fabio's words, "an
English woman trying to speak Spanish because of her accent". The direction prompt said
"adult female, forties, calm" with nothing about being Spanish, so VoiceDesign kept the
English persona and read Spanish phonetically. **Accent lives in the direction prompt** —
which is exactly the handle the library needs.

Language itself is settled as a CLONING concern, not a design one: English is enough for
the library.

### Accent set generated (needs Fabio's ear)

English text throughout — the target is the movie-character case (an Italian accent
speaking English), not the Italian language.

| file | sec | rms dB | silent% |
|---|---|---|---|
| `REF_acc_it_m` Italian | 13.42 | -23.1 | 3.1 |
| `REF_acc_ru_m` Russian | 16.94 | -25.3 | 17.3 |
| `REF_acc_de_f` German | 11.18 | -21.1 | 9.0 |
| `REF_acc_nl_m` Dutch | 15.82 | -25.2 | 15.2 |
| `REF_acc_es_f` Spanish | 13.74 | -22.0 | 15.2 |
| `REF_acc_fr_f` French | 13.34 | -21.8 | 14.4 |

**The load-bearing test — does the accent SURVIVE cloning?** If Chatterbox flattens it the
whole accent library is pointless. Three cloned through `FL_ChatterboxTTS` on different
text: `CLONE_acc_it_m` (8.92s), `CLONE_acc_ru_m` (8.64s), `CLONE_acc_fr_f` (6.52s). Levels
and durations are normal. **Verdict is Fabio's ear — not yet given.**

### Multilingual clones — SUSPECT, do not treat as a pass

`MULTI_it_acc_it_m` 22.07s, `MULTI_es_acc_es_f` 25.62s,
`MULTI_fr_lib_f_midage_narration` 30.13s — for a ~12-word sentence that should be ~5s.
The Italian one is 24.2% silence. Something is looping or padding; `repetition_penalty`
defaulting to 2.0 is the first suspect, `min_p`/`top_p` the second. Needs a listen and
then a parameter sweep before any multilingual claim is made.

### Multi-speaker — build it, don't look for it

Chatterbox has no native multi-speaker. Fabio: *"if you can do one voice, you can do how
many voices you like ... separate generations for each and then glueing everything
together using our own tools."* Correct, and already the plan's Step 3 —
`FL_ChatterboxDialogTTS` is a 196-line loop over `SPEAKER A:` lines calling `generate()`
per line, whose per-speaker time-aligned stems are the right shape for a video timeline.
Build our own MpiNode: speaker count as a parameter not 4 branches, warn instead of
silently dropping an unmatched line, inter-turn pause, per-speaker and per-line emotion.

## 2026-08-23 — ACCENT IS NOT CONTROLLABLE IN Qwen3-TTS VoiceDesign. Do not retry this.

**22 generations across three rounds. Exactly one convincing non-American accent, and it
did not reproduce.** All judged by Fabio's ear.

### Round 1 — freeform prose, 6 accents (`mpi607_accents/REF_acc_*`)

"Adult male, forties, speaking English with a strong Italian accent, ..." and five
siblings (Russian, German, Dutch, Spanish, French).

**Result: all six AMERICAN.** The accent clause was ignored entirely.

### Round 2 — the pack's structured grammar, 7 probes (`mpi607_accent_probe/`)

`voice_instruct.json` turned out to hold a STRUCTURED prompt vocabulary --
`gender: … / age: … / accent: … / pitch: … / speed: … / volume: … / clarity: … /
fluency: … / tone: …`, one `key: value.` per line. There is a real `accent:` field, and
**every one of the 47 canned styles pins it to `accent: Neutral.`** with no non-neutral
example anywhere in the pack. Round 1 had never set the field at all.

| probe | `accent:` value | result |
|---|---|---|
| `p0_ctl_neutral` | `Neutral.` | American (baseline) |
| `p1_british_bare` | `British.` | American |
| `p2_british_rp` | `British English, Received Pronunciation.` | American |
| `p3_british_strong` | `Strong British accent, London, non-rhotic.` | **BRITISH** |
| `p4_british_prose` | (prose, as round 1) | American |
| `p5_italian` | `Italian. Non-native English speaker, …` | American |
| `p6_russian` | `Russian. Non-native English speaker, …` | American |

One hit out of seven, and it was the only prompt carrying all three of: the literal phrase
"Strong <X> accent", a city, and a phonetic trait.

### Round 3 — ablate the winner, 9 probes (`mpi607_accent_ablate/`)

| probe | value | result |
|---|---|---|
| `r1_winner_seedA` | `Strong British accent, London, non-rhotic.` seed 3001 | American |
| `r2_winner_seedB` | same prompt, seed 3002 | American |
| `r3_winner_seedC` | same prompt, seed 3003 | American |
| `a1_no_city_no_trait` | `Strong British accent.` | **mildly British** |
| `a2_no_strong` | `British accent, London, non-rhotic.` | **even milder** |
| `g1_italian` | `Strong Italian accent, Rome, rolled r sounds.` | American |
| `g2_russian` | `Strong Russian accent, Moscow, hard consonants.` | American |
| `g3_french` | `Strong French accent, Paris, nasal vowels.` | American |
| `g4_german` | `Strong German accent, Berlin, clipped precise consonants.` | American |

**`p3` was seed luck.** Its exact prompt failed at three fresh seeds. And the winning
formula transferred to zero of four other accents.

### Conclusion

Qwen3-TTS VoiceDesign has a **strong American English prior**. The `accent:` field is
read -- `a1`/`a2` show a mild, unreliable nudge -- but it will not produce a dependable
accent, and it will not leave English-family accents at all. Prompt engineering has been
given 22 shots across prose, the model's own structured grammar, intensity wording,
geographic anchors and phonetic traits. **The return is too poor to keep spending on it.**

**Therefore: the library's accent axis cannot be authored with VoiceDesign.** Gender, age
and delivery-type all work well and are unaffected -- those were confirmed matching the
tutorial. Accent is the one axis that fails.

### What this does NOT prove

That Chatterbox cannot CARRY an accent. Every accent-survival test so far fed it
accent-free references, so it had nothing to preserve -- and in one case
(`CLONE_acc_it_m`) it invented a British accent from an American reference, which is drift,
not loss. **Whether a genuinely accented reference survives Chatterbox is still open**, and
it is the question that decides whether accents can come from user-supplied clips or a
licensed accented corpus (VCTK: CC BY 4.0, 109 speakers, 11 accents, anonymised, built for
cloning -- see `research/voice-library-02`).

Probes preserved: `research/accent_probe.py`, `research/accent_ablate.py`.

## 2026-08-23 — EMOTION: `cfg_weight` is the unlock, and the default suppresses it

**`cfg_weight` 0.5 (the node default) barely transfers emotion. 0.3 transfers it well.**
Same references, same model, same seed -- one number. Judged by Fabio's ear.

The pack's own table (`ComfyUI_Fill-ChatterBox/README.md`) calls it
"Pace/classifier-free guidance", and `exaggeration` "Emotion intensity". They are NOT
independent: raising exaggeration speeds delivery up, and cfg_weight is what compensates.
Round 1 raised exaggeration to 1.3 with cfg_weight pinned at 0.5 and got "super fast and
a bit mechanical" -- the textbook symptom of moving one without the other. **That round
was mis-parameterised, not a real negative.**

### Round 1 — cfg_weight 0.5 (`mpi607_emotion/`)

Emotional reference, emotionally blank target text:

| clip | Fabio |
|---|---|
| `A_from_e3_cheerful` | "sarcastic, like she's mad and pretending to be happy" -- drifted |
| `A_from_e1_angry` | "almost there" |
| `A_from_e2_sad` | "more or less neutral" -- failed |
| `B_dial_1p3` (exag 1.3, cfg 0.5) | "super fast and a bit mechanical" |
| `C_text_angry` (neutral ref, angry words) | "more disappointed and slightly annoyed" |
| `C_text_sad` | "a bit robotic, with a hint of disappointment" |

### Round 2 — cfg_weight 0.3 (`mpi607_emotion2/`)

Same references. **"Cheerful is good now. The other ones are good as well. Sad and angry
are coming through."**

Intensity is per-emotion, and it is NOT monotonic:

| emotion | exaggeration | Fabio |
|---|---|---|
| sad | 0.5 | **most natural** |
| sad | 0.8 | "a bit unnatural" |
| sad | 1.2 | "extra sad" |
| angry | 0.8 | angry |
| angry | 1.2 | **more angry than 0.8** |
| cheerful | 0.8 | good |

So `exaggeration` is not a single "more emotion" slider -- sad peaks for naturalness at
0.5 and degrades at 0.8 before intensifying again at 1.2, while angry rises cleanly.

### Product consequences

- **The Flow must default to `cfg_weight` 0.3, not the node's 0.5.** Shipping the default
  would ship the flat, emotionless version of this feature.
- **Do not expose `exaggeration` and `cfg_weight` as two independent sliders.** They are
  coupled, and a user raising exaggeration alone reproduces the "fast and mechanical"
  failure exactly. One "intensity" control that moves exaggeration up as cfg_weight comes
  down is the right shape.
- Per-emotion intensity defaults are worth baking into the library metadata, since the
  sweet spot moves per emotion rather than being a global constant.

### Still open at the time of writing

Round 1's text-driven test (C) also ran at cfg_weight 0.5, so it was never fair either.
`mpi607_emotion3/` re-runs it at 0.3 -- a NEUTRAL reference speaking angry and sad words,
with a neutral-words control to rule out "everything sounds angry at cfg 0.3", plus an
exaggeration 1.0 pair. **That result decides the library's size**: if emotional text works
on a neutral voice, 60 voices suffice and emotion is free at runtime; if not, emotion must
be baked per voice and the library is 60 x N.

Also unconfirmed: the `E_*` production-case pair from round 2 (emotional reference AND
emotional words together) -- Fabio's notes covered the D group but did not name E.

Probes: `research/emotion_transfer.py`, `research/emotion_clone_stage2.py`,
`research/emotion_sweep.py`, `research/emotion_text_c03.py`.

## 2026-08-23 — Identity, and the VC pipeline. Emotion is measurable now, not just heard.

### A measurement tool exists: `research/speaker_similarity.py`

"Is this the same voice?" stopped being an opinion. Chatterbox clones from a CAMPPlus
x-vector, so cosine similarity in THAT space is literally "would Chatterbox treat these as
the same speaker". The encoder is loaded straight out of the s3gen checkpoint the node
already downloaded (`models/chatterbox/chatterbox/s3gen.safetensors`, keys prefixed
`speaker_encoder.`); nothing is generated.

Scale used throughout below: `>0.80` same speaker, `0.65-0.80` same-ish, `0.50-0.65`
ambiguous, `<0.50` different.

**This is the library's QA gate.** Author a voice's emotion set, score each against its
neutral base, auto-reject below ~0.70 and regenerate. It converts an unbounded listening
job into a measured one -- Fabio only auditions clips that already passed.

### Identity across emotions — works, but ONLY if the acoustic lines are frozen

Round 1 (`mpi607_identity/`) varied `speed:` and `volume:` inside the emotion blocks
("Fast and clipped", "Loud and forceful", "Soft and receding"). Those are acoustic
identity properties, so the speaker moved: same seed, different emotion scored 0.41-0.55.
**That test was confounded, not a real negative.** It also showed the seed barely matters
-- a DIFFERENT seed with the same prompt scored 0.68-0.69, higher than the same seed with
a different emotion. The prompt determines identity.

Round 2 (`mpi607_identity2/`) froze `pitch`/`speed`/`volume`/`clarity`/`texture` and varied
only `emotion` / `tone` / `personality` / `style note`, over two distinctive identities:

| identity | pairwise across 4 emotions | verdict |
|---|---|---|
| **vB** young female, high/bright/thin | 0.68 - **0.88** | holds |
| **vA** senior male, very low bass, heavy vocal fry | 0.45 - 0.61 | does NOT hold |

Cross-identity vA vs vB: 0.25-0.53, so the encoder does separate them.

**Conclusions.** Identity survives an emotion change when the acoustic lines are held
constant -- but it is voice-dependent: extreme timbres drift, ordinary ones hold. `sad` is
the hardest emotion to hold identity through in both voices. Any authored emotion set must
be gate-scored, never assumed.

### Chatterbox VC — identity YES, naturalness YES, emotion PARTIAL

Pipeline tested (`mpi607_vc/`): `FL_ChatterboxTTS(user text, audio_prompt=<emotional
performer>)` -> `FL_ChatterboxVC(input_audio=that, target_voice=<character clip>)`. If it
worked outright the library would collapse to ~60 neutral clips plus ~5 shared performance
clips, with emotion becoming a property of the PIPELINE rather than the library.

| clip | vs character |
|---|---|
| `PERF_vc_angry` before VC | 0.54 |
| `vc_angry` after VC | **0.83** |
| `PERF_vc_sad` -> `vc_sad` | 0.55 -> **0.81** |
| `PERF_vc_cheerful` -> `vc_cheerful` | 0.64 -> **0.78** |
| `ctl_direct_angry` (no VC) | 0.85 |
| `ctl_direct_neutral` (no VC) | 0.75 |

**VC costs nothing in identity** -- 0.78-0.83 is level with plain TTS from the character's
own clip.

Fabio's ear, and this is the catch:

1. *"Did not translate very well. `vc_angry` sounds more disappointed than angry."*
   **VC attenuates emotion.**
2. *"Direct is very neutral."* -- confirms the no-VC route is worse; the dial and the words
   alone do not produce anger.
3. *"VC sounds more natural. Direct sounds weird and robotic."* -- **VC has no quality tax;
   it is an improvement.**

### Pre-compensating the attenuation has a hard ceiling (`mpi607_vc2/`)

Round 1 fed VC an exaggeration-0.8 performance. Driving it harder trades emotion against
identity, and the trade is measurable:

| performance exaggeration | VC output vs character |
|---|---|
| sad 1.2 | **0.87** -- best score of the session |
| angry 1.2 | **0.79** |
| angry 1.5 | 0.70 -- borderline |
| angry 2.0 | 0.61 -- identity breaking down |

The performances themselves drift badly as they are pushed (`PERF_push_angry_e20` is 0.33
from the character) and VC can only pull so much back. **exaggeration ~1.2 is the usable
ceiling for a VC source; 2.0 is disqualified on identity regardless of how it sounds.**

Whether 1.2 finally reads as ANGRY rather than disappointed is the open question.

### Where this leaves the library

- **Not resolved yet**: if VC at 1.2 carries real emotion, the library is ~60 neutral clips
  + ~5 shared performance clips, and a user's own uploaded voice inherits the full
  emotional range for free, because it only ever needs to be a VC target.
- **If it does not**, emotion must be baked per character after all -- but scoped, not
  exponential: ~20 character/dramatic voices get a full emotion set, ~40 utility voices
  (narration, documentary, commercial) get one or two. ~160 clips, ~40 MB as opus. The
  similarity gate keeps the auditioning bounded either way.

Probes: `research/identity_stability.py`, `research/identity_stability2.py`,
`research/speaker_similarity.py`, `research/vc_pipeline.py`.

### VC VERDICT — PASS at exaggeration 1.2 (Fabio, 2026-08-23)

> "push does carry emotion. There are the correct emotions. For SAD, in this example, the
> performance itself is not SAD, but the emotion that it had was carried through the push."

**VC is faithful to whatever emotion the performance contains.** Where sadness was missing
it was missing from the PERFORMANCE, not lost in conversion. That is the good failure
mode: the performance clips are a handful of shared files that can be iterated on for
free, rather than a per-character cost.

Combined with the identity numbers (`push_sad_e12` 0.87, `push_angry_e12` 0.79) and
Fabio's "VC sounds more natural, direct sounds weird and robotic", the pipeline is
settled.

## THE SETTLED ARCHITECTURE (2026-08-23)

```
stage 1   FL_ChatterboxTTS(user text, audio_prompt=<performance clip>,
                           cfg_weight=0.3, exaggeration=1.2)
stage 2   FL_ChatterboxVC(input_audio=stage 1, target_voice=<character clip>)
```

**Library = ~60 neutral character clips + ~5-8 shared emotional performance clips.**

Not 60 x N. Emotion is a property of the PIPELINE, not of the library. Three consequences
worth keeping:

- A new emotion later costs ~1 performance clip, not 60 character variants.
- **A user's own uploaded voice inherits the full emotional range for free**, because it is
  only ever a VC `target_voice`. That closes the unbounded-cast gap Fabio raised ("a
  realistic film with 50 characters") without a bigger library.
- The performance clips are the quality lever and the thing worth perfecting. Selection
  criterion: a candidate is good if `FL_ChatterboxTTS` driven from it produces strong
  emotion, judged by ear -- not merely if the clip itself sounds emotional.

### Locked parameter findings

| parameter | value | why |
|---|---|---|
| `cfg_weight` | **0.3** | node default 0.5 suppresses emotion entirely |
| `exaggeration` (VC source) | **1.2** | 1.5 -> identity 0.70, 2.0 -> 0.61; 1.2 keeps 0.79-0.87 |
| identity gate | **cosine >= 0.70** | via `research/speaker_similarity.py` |

`exaggeration` and `cfg_weight` are COUPLED -- the Flow must expose one intensity control,
never two sliders, or users reproduce the "fast and mechanical" artefact.

### What the library still has to decide

Taxonomy and count: gender x age x delivery-type, ~60 voices, tags-not-folders (a voice is
legitimately female + forties + narration, and folders force one ordering). **No accent
axis** -- closed negative above. That design conversation is `mpi-brainstorm` shaped and
has not happened yet.


## 2026-08-23 -- Step 3 Gate 1: Chatterbox engine onboarding (FIRST Vision repo code)

Everything before this entry was bench + card workspace. This is the first commit-shaped
work in the app itself. **Gate 1 is the engine side only** -- the pack, its python deps and
its weights. The Flow is Gate 2 and is not built yet.

### Step 3 is NOT a pure `/mpi-add-flow`, and the handoff's next_action understated it

Nothing was wired: `chatter` matched nothing in `node_lock.json`, `dependencies.js` or
`python_deps.in`. The add-flow playbook assumes the model a Flow runs on is ALREADY
installed (`ltx-foley` / `ltx-extend` declare `requiredModels: ['ltx-23-balanced']` and own
no weight). Chatterbox owns everything it needs, so a node pack, 8 python leaves and 4.25GB
of weights had to land before a FlowDef could reference them.

### Chatterbox is a FLOW WITH `requiredDeps`, not a ModelDef and not a Plugin

Checked all three entities before writing anything:

- **Not a ModelDef.** A ModelDef forces `supportedOps` / `workflows` / `capabilities` /
  `gen_speed` / ratio tables and puts the entry in the model picker. A TTS engine is none
  of that.
- **Not a Plugin.** `pluginsRegistry.js` defines a plugin as "a capability other surfaces
  call, NOT a thing the user generates with and NOT a tile in the Flow Library". The TTS
  Flow is exactly a Flow Library tile the user generates with.
- **A FlowDef with `requiredDeps`.** `head-swap` is the precedent (`requiredDeps:
  ['qwen-lora-headswap', 'comfyui-inpaint-cropandstitch']`) -- a flow declaring the weights
  and node pack that are ITS OWN rather than a model's. Chatterbox goes further: it
  declares `requiredModels: []` and owns all nine dep ids.

**Consequence for Gate 2, and it is a GC hazard, not a nicety.** `flowRequiredDepIds()`
(flowsRegistry.js) is what protects a flow's deps from the uninstall guards. Until the
FlowDef lands, the seven `chatterbox-*` deps are owned by nobody. That is safe only
because nothing installs them yet -- the moment anything does, an unowned dep is what
MPI-310 destroyed 5.24GB over. Land the FlowDef in the same breath as the first install.

### THE TRAP: the pack ignores `extra_model_paths.yaml` and self-downloads 4.25GB

`get_chatterbox_models_dir()` computes `<ComfyUI>/models/chatterbox/` from `__file__` and
never touches `folder_paths`. Every loader then ends in `download_chatterbox_models(...)`,
which `hf_hub_download`s any file it does not find at that exact path.

So a weight placed in `mpi_models/` (where every normal dep goes) is INVISIBLE to the pack,
and the failure is not an error -- it is a silent 4.25GB HuggingFace pull outside the
download manager, with no progress UI, no sha check, no GC, repeated on every engine
reinstall.

**Same class as RIFE/VFI (MPI-222), so the same cure: `targetPath`.** It pins a dep under
the ComfyUI repo root regardless of the user's custom models root, with `filename` as a
bare basename. Verified by resolution, not by reading:

```
chatterbox-t3        -> engine\ComfyUI_windows_portable\ComfyUI\models\chatterbox\chatterbox\t3_cfg.safetensors
chatterbox-vc-s3gen  -> engine\ComfyUI_windows_portable\ComfyUI\models\chatterbox\chatterbox_vc\s3gen.pt
```

(passed a custom root of `D:/SomeCustomRoot`, correctly ignored). At those paths the pack's
own `if not local_path.exists()` prints "Using cached" and downloads nothing.

`targetPath` is handled identically by install, status-check and uninstall
(`downloadManager.js` lines ~1592 / ~3199 / ~3008), so these are NOT `engineAsset: true`
like RIFE -- they are a flow's weights, they install with it and GC with it.

### THE SECOND TRAP: Perth watermarking is opt-in and fails SILENTLY

`resemble-perth` is **commented out** of the pack's `requirements.txt`, and `tts.py`,
`vc.py` and `mtl_tts.py` each do `try: import perth / except: PERTH_AVAILABLE = False`,
print one warning line, and generate unmarked audio for ever after. EU AI Act Art. 50 has
been in force since 2026-08-02 and Vision is the provider of the synthetic audio.

So `resemble-perth` is a REQUIRED line in `dev_configs/python_deps.in`, carrying its own
comment block explaining that deleting it breaks no build -- it just ships unmarked audio.
`compile-node-deps.mjs --check` reports it as "curated but not declared by any node", which
is the correct and intended state.

**Still to prove at Gate 2:** that the marking is actually PRESENT on a generated file.
Installed != applied, and the failure mode is one line on stdout.

### Dependency coverage -- proven by import graph, not by hope

`compile-node-deps.mjs --check` found 6 declared requirements missing: `resampy`,
`librosa`, `s3tokenizer`, `conformer`, `safetensors`, `soundfile`. Added, plus
`resemble-perth`. Re-check clean.

Then the real question: the app installs ONE curated lock in a single `--no-deps` pass, so
a transitive the resolver never saw would fail at import time, not install time. Parsed
every `.py` in the pack with `ast` and diffed the top-level imports against the curated
set. **Five are uncovered, and all five are lazy and unreachable on the shipped path:**

| module | where | reachable? |
|---|---|---|
| `pykakasi` | `tokenizer.py:78` (indented) | Japanese branch, multilingual only |
| `dicta_onnx` | `tokenizer.py:113` (indented) | Hebrew branch, multilingual only |
| `russian_text_stresser` | `tokenizer.py:146` (indented) | Russian branch, multilingual only |
| `spacy_pkuseg` | `tokenizer.py:189` (indented) | Chinese branch, multilingual only |
| `pyloudnorm` | `tts_turbo.py:28` | inside a `try/except ImportError`, Turbo only |

`tts_turbo.py` IS eagerly imported by `chatterbox_node.py:43`, so the `pyloudnorm` guard is
load-bearing -- an unguarded import there would take the whole pack down at registration.
It is guarded. Nothing else on the English TTS + VC path is missing.

This closed a real ambiguity: the plan's leaf list
(`librosa soundfile soxr sox s3tokenizer conformer pyloudnorm resemble-perth`) came from
the `chatterbox-tts` PyPI package, but this pack VENDORS its own `local_chatterbox`, so
that list was neither necessary nor sufficient. `sox`/`pysox` is NOT needed; `resampy`,
`diffusers` and `omegaconf` are (the last two already pinned).

### Lock diff worth knowing about

The regenerated `python_deps.txt` gained 23 packages. Two are worth naming:

- **`pre-commit` (+ `virtualenv`, `nodeenv`, `identify`, `cfgv`, `distlib`,
  `python-discovery`) comes from `s3tokenizer`**, which declares dev tooling as a runtime
  dependency. ~7 pure-python packages shipped to every user. Sloppy upstream, harmless,
  and cheaper to accept than to fight the resolver.
- **`protobuf` lost its `; sys_platform != 'darwin'` marker**, because the new `onnx` (also
  from `s3tokenizer`) needs it unconditionally. Checked against PyPI before accepting,
  because this is the exact shape of MPI-370: `onnx` publishes 4 macOS wheels and `soxr`
  10; `s3tokenizer`, `resemble-perth`, `conformer` and `resampy` are pure-python. **No
  platform is broken.**

### A pre-existing bug found and fixed on the way

`_buildBlock()` in `routes/yamlHelper.js` derived extra_model_paths folder keys from
`dep.filename.split('/')[0]` for every non-custom-node dep. A `targetPath` dep's filename
is a bare BASENAME, so RIFE has been emitting a junk `rife47.pth: rife47.pth/` key into
every user's yaml, and the seven Chatterbox weights would have added seven more.

Fixed at the root (skip `targetPath` in the derivation). Note the test in
`tests/extra-model-folders.test.cjs` ALREADY modelled it correctly -- it filters
`!d.targetPath` -- so the implementation was simply the half that lagged. Verified: junk
keys now `NONE`, and no `chatterbox` key appears in the yaml (correct -- the pack cannot
read it anyway).

### What Gate 1 is and is NOT verified by

**Verified:** `npm test` 726/726 pass; `compile-node-deps.mjs --check` clean; `release:deps`
reports the seven as deliberate `noMirror` rather than "no second origin"; all 7 HF URLs
return 200 with byte counts matching the bench files exactly; all 7 sha256 computed from
the bench copies; `targetPath` resolution asserted against a custom root; eslint clean on
the three changed JS files; import coverage as above.

**NOT verified:** nothing has been installed or run on a real engine. Deliberate --
port 3000, 8188 and 48188 were all live (the user's app, the bench, the app engine), and a
scratch-engine install (`CUBRIC_ENGINE_ROOT`, ~7 min + 4.25GB) proves half a feature now or
the whole feature at Gate 2 for the same cost. It belongs at Gate 2.

### Deliberate deferrals

- **No R2 mirror.** HF-primary, `noMirror: true` with a reason on each entry. Precedent is
  MiniMax H3 and the FLUX ControlNet, both HF-primary today. Mirroring 4.25GB is its own
  VPN-off job (the VPN throttles R2 ~15x, MPI-354).
- **English TTS + VC only.** `chatterbox_multilingual` (another ~3GB) and
  `chatterbox_turbo` are not wired. The settled architecture needs neither.
- **`conds.pt` is duplicated** across the two folders (byte-identical, sha `6552d705...`,
  107KB). Two loaders read two paths; not worth deduping.

### Doc drift found

`docs/playbooks/add-flow/README.md` section 0.3 says `mediaType` is `'image'|'video'`,
while `flowsRegistry.js`'s own JSDoc already documents `'image'|'video'|'audio'` with the
`Output_Audio` naming law. The registry is right. One-line fix, Gate 2.


## 2026-08-23 (session 13) -- Fabio drove the all-nodes bench workflow. Four findings.

All four came from HIM running the graph, not from me reading code. Two of them change the
plan; one closes a model; one reopens an axis that was written off.

### 1. TURBO IS A NO-GO -- closed, do not re-evaluate without new information

`FL_ChatterboxTurboTTS` is a THIRD model (`ResembleAI/chatterbox-turbo`, 2.8GB, GPT2-based,
English only) with its own weights in `models/chatterbox/chatterbox_turbo/`. It downloads on
first run through `hf_hub_download` and relays NO progress, so the node parks at whatever
percentage it last reported -- Fabio saw 8% and reasonably read it as a hang. It was not:
all 9 files landed, 15:43-15:44.

Its one distinctive capability is **paralinguistic tags** -- `[laugh]`, `[sigh]`, `[gasp]`,
`[chuckle]`, `[cough]`, `[sniff]`, `[groan]`, `[shush]`, `[clear throat]` -- inline in the
text. Plain `FL_ChatterboxTTS` ignores them. The README is explicit that they are Turbo-only
and English-only.

**Fabio's measurements killed it:**

| test | result |
|---|---|
| 4s AI-voice reference | FAILED outright |
| 13s reference (his own voice) | worked |
| accent | gives nearly every voice a BRITISH accent |
| accent stability | sometimes starts British and **changes to American mid-clip** |
| emotion | none -- tags are discrete events, not a mood |

**The accent drift is the disqualifier, not the reference-length floor.** The entire shipped
architecture exists to hold speaker identity (gate: CAMPPlus cosine >= 0.70). A model that
changes accent halfway through one utterance is not stable enough to gate, and no parameter
sweep fixes a mid-sequence identity shift. Fabio: *"turbo key is a no-go."*

Keep only this: paralinguistic tags EXIST in the Chatterbox family. If a future release
brings them to the standard model, that is the moment to look again.

### 2. ACCENT IS A RUNTIME PARAMETER -- the accent axis is reopened, from a new direction

`FL_ChatterboxMultilingualTTS` exposes a `language` selector (23 entries: Arabic, Danish,
German, Greek, English, Spanish, Finnish, French, Hebrew, Hindi, Italian, Japanese, Korean,
Malay, Dutch, Norwegian, Polish, Portuguese, Russian, Swedish, Swahili, Turkish, Chinese),
and **choosing a language imposes that accent on the cloned voice**. Fabio confirmed it on
two references -- a synthetic voice and his own. `exaggeration` 0.8 gives a more pronounced
accent than 0.5; both work.

**This does not reopen the VoiceDesign accent finding, and must not be confused with it.**
Authoring an accented voice through Qwen VoiceDesign is still a closed negative after 22
generations -- do not retry it. What has changed is that accent no longer has to come from
the reference at all. It is a knob at generation time.

**Three consequences, and they all simplify the plan:**

- **The library needs NO accent axis** -- which was already the plan, but for the opposite
  reason. It was "we cannot author accents"; it is now "we do not have to".
- **A user's own uploaded voice inherits every accent for free**, exactly as it already
  inherits the full emotional range through VC. Same shape, same reason: the property lives
  in the PIPELINE, not in the library entry.
- **The old loose end is answered sideways.** "Does a genuinely accented reference survive
  Chatterbox?" stops being the deciding question -- we can request the accent instead of
  sourcing it.

**Open, and it is the next test:** does the accent SURVIVE the VC stage, or does repainting
onto the character clip strip it? The whole shipped pipeline ends in VC, so an accent that
does not survive stage 2 is not shippable.

### 3. Multilingual generates TRAILING NOISE -- one suspect, and it is a default

Fabio: it *"most times comes out with a few extra seconds with some noise"*, and it is slow.
This is the SAME defect already on the card as "multilingual clone durations are anomalous
(22-30s for ~12 words)" -- the duration was the symptom, the trailing noise is its shape.

**The asymmetry that names the suspect:** `repetition_penalty` exists ONLY on the
multilingual model. `mtl_tts.py:293` defaults it to **2.0** (node default matches). Plain
`tts.py` has no such parameter at all -- and plain TTS does not do this. Multilingual also
carries `min_p` (0.05) and `top_p` (1.0), which plain TTS also lacks.

2.0 is an aggressive penalty. The plausible mechanism is that it distorts the distribution
enough near the end of the utterance that the model never lands a confident stop and keeps
generating into noise until the token cap -- which is exactly "a few extra seconds of noise"
AND "it takes quite a while", one cause for both.

**The test, not yet run:** sweep `repetition_penalty` 1.2 / 1.5 / 2.0 with the seed,
reference and sentence held fixed. If 1.2 stops cleanly, that is the whole fix and accents
become shippable. If the noise survives all three it is a decode/trim problem and the Flow
trims the tail instead.

### 4. VC identity bleed -- the SAME tradeoff already measured, seen from the other end

Fabio drove voice conversion properly and reported the limit honestly: *"if the voices are
similar, sometimes it seems hard to distinguish if it's even picking up the target voice --
it starts sounding a bit like the input voice."* And, testing his deep voice against a
female target: it does produce the female voice, but he suspects he needs to raise his
pitch. Critically: **with LESS performance in the input, the target voice comes through
better** -- *"but that kind of kills performance, obviously."*

**That is the exaggeration curve again, entered from the source side.** Already measured on
the TTS side: VC-source `exaggeration` 1.2 holds identity at 0.79-0.87, 1.5 drops it to
0.70, 2.0 to 0.61. Now confirmed by ear from the input side -- the harder the source
performs, the less of the target survives. One curve, two ways in, and it is the central
tension of the whole feature:

> **Performance and identity trade against each other. There is no setting that maximises
> both.** Every UI decision here is choosing a point on that curve for the user.

Two further facts from his test worth keeping:

- **Similar source and target = the conversion is hard to hear at all.** The bigger the
  distance between the two voices, the more obviously it worked. So "it didn't do anything"
  is a likely and misleading user report when they pick a target close to their own voice.
- **A large PITCH gap is where it strains** (his deep voice -> female target). His instinct
  to raise his pitch when performing for a distant target is worth testing as guidance.

**Fabio's verdict: it works -- the gap is instruction, not capability.** *"It's just a
matter of giving some instruction to the user on how to record his voice, and depending on
the voice that he selects as a target."*

**Product consequence, and we already own the tool for it.** `research/speaker_similarity.py`
loads Chatterbox's own CAMPPlus encoder, so the app can score the VC OUTPUT against the
chosen target and know objectively whether the conversion landed -- the same >= 0.70 gate
built for library QA, pointed at a user's take. That turns "it didn't work" into "this came
out at 0.61 -- try a flatter delivery, or a target further from your own voice." Not v1
scope, but it is the reason the gate is worth keeping around.

### PRODUCT DECISION: Voice Changer is its OWN Flow, and it ships FIRST

Fabio's call, and it reorders Step 3: *"VC is a flow by itself. If you think about it, we
already have a record button. All the user has to do is record the performance, choose a
voice, and that voice comes out with his performance."*

The recorder exists (MPI-573). So the Flow is: record -> pick a target voice -> VC -> audio
card. **No text, no TTS model, no performance clips.**

**It is the cheaper half in every dimension:**

| | Voice Changer | Text to Speech |
|---|---|---|
| weights | `chatterbox_vc` only, **1.0GB** | + `chatterbox` TTS, **4.25GB total** |
| needs the ~5-8 performance clips | **no** | yes -- they are the quality lever |
| needs the ~60-voice library | no (v1: user supplies the target clip) | no, same |
| user provides the performance | **yes, that is the point** | no, the clips do |

The library upgrades Voice Changer (more characters to become) but does not gate it. That is
what makes it shippable now: **the user's own recording IS the performance clip**, which is
the exact asset TTS is still waiting on.

So Gate 2 splits: **Flow A = Voice Changer** (VC only), **Flow B = Text to Speech**
(TTS -> VC). Flow A first.

### ROUTING DECISION: base model by DEFAULT, multilingual only when an accent is picked

Fabio, same session: *"for accents we can use the multilingual one. But I don't think it
should replace the base one because it takes a lot longer to generate, so unless the user
selects an accent, we should choose the base one."*

So the accent selector is not a parameter on one node -- **it selects which MODEL runs**:

```
accent == none   ->  FL_ChatterboxTTS              (base, fast)
accent == <lang> ->  FL_ChatterboxMultilingualTTS  (slower, imposes the accent)
```

Both then feed the same `FL_ChatterboxVC` stage 2. The precedent for a graph that branches
on a declared value is Qwen's `Input_wf_type` (`models.js` `opInject`) -- one workflow file,
one switch, the value chosen by the descriptor rather than baked.

**This has a real weight cost and it lands on Flow B, not Flow A.** Shipping accents means
shipping `chatterbox_multilingual` as well:

| set | size | needed for |
|---|---|---|
| `chatterbox_vc` | 1.0GB | Flow A (Voice Changer) -- and stage 2 of Flow B |
| `chatterbox` | 3.2GB | Flow B, the fast default path |
| `chatterbox_multilingual` | 3.0GB | Flow B, ONLY if the user wants an accent |
| | **7.2GB** | all three |

7.2GB for one feature is a lot, and the third set is dead weight for every user who never
picks an accent. **Unresolved:** whether `requiredDeps` can express an OPTIONAL set, or
whether accents want to be their own thing (a second Flow, or a separate install prompt).
Decide it when Flow B is designed -- Flow A is unaffected either way, which is another
reason it goes first.

Note the trailing-noise defect (finding 3) is on the multilingual model specifically, so it
gates the ACCENT path only. The fast default path is unaffected by it.


## 2026-08-23 (session 13, later) -- VC guidance settled, and a Flow-A-exclusive capability

Fabio's last round on the bench. Two findings change what Flow A IS, and two settle its
user guidance.

### NON-VERBAL SOUND PASSES THROUGH VC -- and it is exclusive to Flow A

*"I shushed and I coughed, and it came through in VC."*

Obvious in hindsight and easy to miss: **VC converts real audio, so whatever the user
actually does with their mouth survives into the target voice.** A laugh, a sigh, a breath,
a cough, a shush -- all of it arrives, in the character's voice, with no tag vocabulary, no
enumeration and no model support required.

**This retires the last reason to care about Turbo.** Turbo's one distinctive feature was
its nine paralinguistic tags (`[laugh]`, `[sigh]`, `[gasp]`, ...). Flow A gets the same
thing unbounded and for free, because the user simply performs it. A fixed tag list cannot
compete with a microphone.

**It does NOT transfer to Flow B, and the asymmetry is structural.** Flow B's stage 1 is
`FL_ChatterboxTTS(text, audio_prompt=<performance clip>)` -- the clip transfers STYLE, it is
not itself converted, and the spoken content comes from text. Only stage 2 (VC) converts
real audio, and in Flow B stage 2's input is already-synthesised speech. So:

| | Flow A (Voice Changer) | Flow B (Text to Speech) |
|---|---|---|
| source of the audio | the user's microphone | generated from text |
| non-verbal sounds | **pass through natively** | only if TTS invents them (it will not) |

That makes "your laugh, your breath, your timing -- in someone else's voice" a Flow A
selling point that Flow B structurally cannot match. Worth saying in the Flow's own copy.

### PITCH: match the target, and hold it steady. Both confirmed.

**Matching helped -- Fabio's instinct was right.** *"Pitching my voice higher to match the
girl did help."* His deep voice against a female target improved measurably by ear once he
raised his delivery. The earlier note that this was untested is now closed positive.

**And a second, independent rule: do not let pitch DRIFT across the take.** *"If you change
your pitch throughout the performance, it can drift the output."* He has seen the same in
other voice changers, so this is a property of the technique rather than of Chatterbox.

**These two resolve an apparent contradiction in the guidance, and the resolution is the
instruction.** Earlier we had "pick a target far from your own voice" (because similar
voices make the conversion inaudible) alongside "match the target's pitch". Those only look
opposed:

- **Distance in TIMBRE/character is what you want** -- it is what makes the conversion
  audible at all.
- **Distance in PITCH is what you COMPENSATE for** -- by performing nearer the target's
  register.

So: pick a target that sounds nothing like you, then meet it at its pitch and stay there.

### Flow A user guidance -- the four rules, all evidence-backed

1. **Perform, but do not push.** A flat take converts more cleanly; a projected one bleeds
   the source voice through. (Same curve as the measured exaggeration cap: 1.2 holds
   identity 0.79-0.87, 1.5 -> 0.70, 2.0 -> 0.61.)
2. **Pick a target that sounds nothing like you.** Similar voices make the conversion nearly
   inaudible -- the likely shape of a "it didn't do anything" support report.
3. **Meet the target's pitch.** Confirmed this round.
4. **Hold that pitch steady.** Pitch drift within a take drifts the output.

Rules 3 and 4 together are the closest thing this feature has to a skill, and they are
cheap to teach -- which is exactly Fabio's read: *"it works, it's just a matter of giving
some instruction to the user."*

### Turbo -- the no-go STANDS, but the mechanism is now understood

Fabio ran one more test, feeding Turbo a cheerful performance reference: **no British
accent, no American accent, and the voice came out well.** So Turbo's accent invention is
**reference-dependent, not unconditional**.

His hypothesis for why his own voice triggered it: *"my voice is neutral -- it has a
Portuguese kind of accent, but it's very neutral. Maybe that's why it started inventing
accents."* Plausible: a reference the model cannot place is a reference it fills in from its
prior, and a British prior is what it reaches for.

**The verdict does not change.** Fabio: *"Either way, it's better not to use it. It's very
unstable."* A model whose identity behaviour depends on whether it can place the user's
accent is not shippable -- users with atypical or lightly-accented voices are not an edge
case we get to exclude, and mid-clip drift was never explained away by this.

**But keep the mechanism, because it may not be Turbo-specific.** Fabio's voice is a
genuinely useful adversarial reference: neutral, lightly Portuguese-inflected, hard to
place. If the BASE model or the VC stage ever misbehaves in a way we cannot reproduce, test
with his voice before concluding it does not happen -- an atypical reference is exactly the
input that surfaces this class of bug, and we now have a documented case of one model
failing on it while succeeding on others.


### TURBO CAVEAT -- the no-go was measured with both identity knobs pinned at ZERO

Fabio flagged that Turbo carries parameters he did not touch. Checked the source, and it is
worse than "untuned": **the node does not expose the two that matter, and never passes
them.**

`FL_ChatterboxTurboTTSNode.INPUT_TYPES` offers exactly `text`, `temperature` (0.8),
`top_k` (1000), `top_p` (0.95), `repetition_penalty` (1.2), `seed`, and optionally
`audio_prompt` / `use_cpu` / `keep_model_loaded`. It passes no `exaggeration` and no
`cfg_weight`, so `tts_turbo.generate()` runs at its own signature defaults
(`tts_turbo.py:264-265`):

```
exaggeration = 0.0
cfg_weight   = 0.0
```

**`cfg_weight` is the central finding of this entire card**, and Turbo ran at 0. On the base
model, 0.5 suppressed emotional transfer outright and 0.3 let it through. `cfg_weight` is
classifier-free guidance toward the REFERENCE CLIP -- at 0 there is nothing pulling
generation toward the user's voice at all, and the model free-runs on its training prior.

**That is a single mechanism explaining both symptoms Fabio reported:**

| symptom | explanation at exaggeration=0, cfg_weight=0 |
|---|---|
| no emotion | both intensity controls are at zero |
| invents a British accent | no guidance toward the reference -> falls back to the prior |
| mid-clip British -> American drift | nothing anchoring identity across the sequence |
| a distinctive reference worked, a neutral one did not | a strong reference survives weak guidance; a neutral one does not |

It also subsumes the reference-dependence hypothesis above rather than contradicting it.

**THIS IS THE CARD'S OWN DOCUMENTED TRAP, for the fourth time.** The standing constraint
from session 12: *"Three of four 'the model cannot do this' conclusions this session turned
out to be MY PARAMETERS, not the model -- cfg_weight suppressing emotion, emotion prompt
blocks rewriting acoustic identity lines, and VC fed an under-driven performance. Only the
accent finding survived scrutiny. Measure against a tuned baseline before concluding a model
is weak."* Turbo was judged on defaults. It has not been measured against a tuned baseline
and no one should say it has.

### The Turbo verdict STANDS -- on the correct reason

The no-go survives, but the reasoning has to change, because "Turbo is unstable" is now
unproven:

1. **Turbo has no unique value left.** Its one differentiator was the nine paralinguistic
   tags. Flow A gets laughs, sighs, coughs and shushes natively through VC, unbounded and
   with no tag vocabulary -- see the passthrough finding above. There is nothing left for
   Turbo to be the answer to.
2. **Reaching a tuned baseline needs a NODE PATCH.** The knobs are unreachable from the
   graph; exposing them means patching a pinned third-party pack or forking it into
   `ComfyUi-MpiNodes`. That is real cost, for a model that -- per (1) -- would win nothing
   even if the tuning worked.
3. **It costs another 2.8GB** on top of a stack already at 4.25GB (7.2GB with accents).

So: **not shipped, and not because it is bad -- because it is redundant, and proving it good
would cost a fork.** If a future release exposes these parameters, or brings paralinguistic
tags to the standard model, the question reopens with the evidence above as its starting
point. Do not re-run the old test; run it at a tuned baseline or not at all.
