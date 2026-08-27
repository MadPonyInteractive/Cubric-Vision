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

## 2026-08-23 (session 14) -- GATE 2 FLOW A BUILT. Graph proven live; app path still unrun.

The Voice Changer Flow exists in the repo. `npm test` 728/728.

### What shipped

| piece | where |
|---|---|
| graph, 5 nodes | `comfy_workflows/raw/flow_voice_changer.json` + `comfy_workflows/flow_voice_changer.json` |
| op, 4 files | `flowVoiceChanger` in commandRegistry / universal_workflows / operationRegistry / operation_registry.json (`appVersionIntroduced` 1.5.0) |
| descriptor | `voice-changer` FlowDef, `requiredModels: []`, 3 `requiredDeps`, `mediaType: 'audio'` |
| test | `tests/inject-params-titles.test.cjs` -- pins both audio inputs, the audio capture, AND the absence of `input_positive` |
| doc | `docs/playbooks/add-flow/existing-flows/voice-changer.md` |

The graph was built IN the ComfyUI editor (playwright-cli driving `LiteGraph.createNode`),
never hand-written -- so widget ordering is the editor's. The repo converter's output and
the editor's own `graphToPrompt()` were diffed input-by-input: **0 diffs**.

`sync-raw-workflows.mjs` REFUSED to run (MPI-567 has an uncommitted generated workflow and
the script rebuilds all templates). The bare-name file routes straight to a runtime file
with no orchestrate step, so the runtime copy was written from the same converter stdout
the sync writes verbatim, then passed `validate-injection-rules.mjs`. MPI-567's file was
not touched.

### LIVE RUN -- the graph works (bench, 8188, under a GPU lease)

The SHIPPED runtime file, real clips, real paths:

- source `high_pitch_exp_fabio.wav` -> target `A3_REF_senior_male_gravel_character.wav`
- `status: success`, **12.1s**, `execution_cached: []` (a real run, not a cache replay)
- node 5 `Output_Audio` emitted `MPI607_VC_flowtest_00001.flac`, `subfolder: 'audio'`,
  `type: 'output'` -- exactly the shape `_collectComfyAudioUrl` reads (`nodeOutput.audio[0]`)
- output landed at `D:\WORK\Images\Outputs\audio\` (the bench's redirected output dir, NOT
  `<ComfyUI>\output` -- the known trap)

**Fabio has not listened to it yet.** That is the outstanding user-ux gate.

### PERTH MARKING IS APPLIED -- checklist item CLOSED

"Installed" is not "applied", so it was measured on this flow's own output:

| file | `PerthImplicitWatermarker.get_watermark` |
|---|---|
| the VC output | **1.0** |
| its source clip (control) | 0.0 |

The control is load-bearing: a detector stuck at 1.0 would read as a pass without it.
Bench log also shows `loaded PerthNet (Implicit) at step 250,000` on every VC call.

### targetPath + byte counts CONFIRMED against a real install

The bench's `models/chatterbox/chatterbox_vc/` holds `s3gen.pt` at **1,057,165,844** bytes
and `conds.pt` at **107,374** -- byte-identical to the Gate 1 `assetDeps.js` entries, in the
exact `targetPath` directory those entries name. Gate 1's weight wiring is verified by a
real on-disk install, not just by reading HF.

### A REAL BUG WAS FOUND AND FIXED: do NOT declare `ComfyUI-MpiNodes`

The handoff's stated dep list included `ComfyUI-MpiNodes`. Declaring it turned
`tests/shared-dep-uninstall-direction.test.cjs` RED -- MPI-258 B1, the invariant that a
tier family with neither transformer installed stays deletable (it once stranded ~19GB).

Root cause, not a test tweak:

1. `requiredDeps` is documented as "flow-only weights/nodes that NO MODEL requires". EVERY
   model declares `ComfyUI-MpiNodes`, so the declaration never described this flow.
2. A flow's deps are protected **unconditionally** in `_localSharedDepsMap` -- a model must
   have a disk footprint to defend its deps, but a flow is always "present". So naming a
   registry-wide shared dep pinned it for every uninstall.
3. It installs anyway: `getUniversalWorkflowDepIds()` returns EVERY `type: 'custom_nodes'`
   dep, and the engine boot gate installs and drift-repairs that whole set independently of
   any model or flow.

Point 3 is confirmed empirically -- **`ComfyUI_Fill-ChatterBox` is already present in the
app engine's `custom_nodes/`** (`engine/ComfyUI_windows_portable/ComfyUI/custom_nodes/`)
with nothing declaring it and no flow installed, purely because Gate 1 added it as a
`custom_nodes` dep. The chatterbox weights dir there is absent, which is correct: the
weights are what the flow's Install button fetches.

`ComfyUI_Fill-ChatterBox` IS declared -- no model requires it, the same reason head-swap
declares `comfyui-inpaint-cropandstitch`.

**Consequence for Flow B: do not put `ComfyUI-MpiNodes` in its `requiredDeps` either.**

### Doc drift fixed (4 stale facts, all verified against the engine)

- `MpiLoadAudioFromPath` **does not exist** -- `/object_info` has no such class; the real
  one is `MpiLoadAudio` (what `flow_ltx_foley` uses). Fixed in `02-media-io.md` (x2) and
  `add-flow/README.md` (x2).
- `add-flow/README.md` section 0.3 said mediaType is `'image'|'video'` -- now documents `'audio'`.
- Two places said "`MEDIA_TYPE` only enumerates image + video / the enum has no AUDIO".
  `MEDIA_TYPE.AUDIO` has existed since MPI-573; both corrected in place.

### What is NOT verified

- **The APP path.** Install button -> download the 1.057GB -> gallery card -> save path ->
  group type. All MPI-573 machinery, none of it exercised by an audio-producing GENERATION
  (MPI-573 proved the RECORDER's upload path). This is the remaining risk and the reason
  the flow is not called done.
- Nothing was installed into any engine. `:3000`, `:8188` and `:48188` were all live and
  the app engine was left alone -- 1.057GB onto the user's disk is his call.
- **No preview art.** `preview`/`video` are deliberately absent from the FlowDef; the tile
  guards on `flow.preview`, so it renders no thumb rather than a broken image.
  `/mpi-flow-graphics` is the next pass.

### 2026-08-23 (session 14, cont.) -- FIRST REAL INSTALL. Found and fixed a REAL BUG: `/comfy/models/check` ignored `targetPath`.

Fabio installed the flow from his own app. The download worked, the toast fired, **and the
progress bar stuck at 100% with Cancel still showing.** Root-caused and fixed.

#### The symptom, and what it was NOT

Not staleness, and **a restart would not have helped** -- the check is deterministic and
would have answered the same way forever.

Ground truth gathered before touching anything:

- app.log ends at `node commit marker stamped for ComfyUI_Fill-ChatterBox`; the backend
  reached `_setModelStatus(job,'complete')` + `_broadcast('download:complete')`
  (downloadManager.js ~2752) -- those are simply not logged, which is why the log looked
  truncated. The toast proves they fired.
- The weights ARE on disk in the app engine, byte-exact:
  `engine/ComfyUI_windows_portable/ComfyUI/models/chatterbox/chatterbox_vc/`
  `s3gen.pt` 1,057,165,844 and `conds.pt` 107,374.
- **The LIVE app's own `/comfy/models/check` reported both weights `installed: false`.**
  That is the negative control for the fix below, taken from the real running system.

#### Root cause

`_localModelsCheck` (`routes/comfy.js`) DUPLICATES path resolution and omitted the
`dep.targetPath` branch that `resolveComfyPath` (`routes/shared.js`) has. Two resolvers,
one honouring `targetPath` and one not. For a `targetPath` weight the check looked under
the MODELS root -- the one place such a weight is guaranteed never to be, since the entire
purpose of `targetPath` is to pin it under the ENGINE where the node's hard-coded scan
path looks (MPI-222).

Chain to the stuck bar: dep reads missing -> `flowAvailability().missingDeps` non-empty ->
`depsDone` false in `MpiFlowLibrary._installProgress` -> `installing` stays true while the
finished job sits at `progress: 1` -> bar pinned at 100%, Cancel still rendered, badge
never flips to READY.

#### Why it never surfaced before

**RIFE was the only `targetPath` dep in the registry, and it carries `engineAsset: true`.**
`getUniversalWorkflowDepIds()` includes every `engineAsset`, so RIFE's install state comes
from the engine BOOT GATE (`checkUniversalWorkflowDepsStatus`, which uses
`resolveComfyPath` and therefore resolves it correctly) and never reaches
`_localModelsCheck` at all. Confirmed live: RIFE returned `installed: true` from the same
pre-fix endpoint that returned false for the chatterbox pair.

**The chatterbox weights are the first `targetPath` deps owned by a FLOW**, and flow deps
resolve through `_localModelsCheck`. Gate 1's targetPath decision was correct; it simply
walked into an untested corner.

#### The fix

`routes/comfy.js` -- a `dep.targetPath` branch FIRST in `_localModelsCheck`'s dep loop,
mirroring `resolveComfyPath` exactly. Nothing else changed.

Verified in-process (no app restart, user's session untouched), with two controls:

| case | result |
|---|---|
| the two chatterbox VC weights (on disk) | `installed: true` |
| CONTROL rife47 (already worked) | `installed: true` -- no regression |
| CONTROL chatterbox-t3 (genuinely absent) | `installed: false` -- the fix is not "say yes to everything" |

Pinned by `tests/targetpath-dep-install-state.test.cjs`, which builds a throwaway engine
root via `CUBRIC_ENGINE_ROOT` and asserts present-reads-installed AND absent-reads-missing.
**`npm test` 729/729.**

`routes/` is server-side, so **the running app must be restarted to pick this up.**

#### 🔴 THE REMOTE TWIN HAS THE SAME FAMILY OF BUG -- NOT FIXED, NEEDS A DECISION

`_isImageResident` (`routes/remoteModels.js:225`) returns `true` for **every** `targetPath`
dep, unconditionally, so on a remote session every chatterbox weight is reported present
without checking anything. That rule was written for RIFE, whose weight the Pod Dockerfile
genuinely bakes into `comfyui-frame-interpolation/ckpts/rife/`. **The Pod image bakes no
chatterbox weights**, so a remote-connected user would see the flow as installed and then
fail inside ComfyUI.

Not fixed here because it is not a one-line correction -- it needs a policy call: bake the
chatterbox weights into the Pod image, or make them volume-installed and drop the blanket
`targetPath -> image-resident` assumption in favour of the explicit `bakedOnPod` flag that
already exists for exactly this distinction. **Flow A cannot ship remote until this is
answered.** Local is unaffected.

#### The fix above was only HALF of it -- the payload stripped the field

After the restart the button was STILL there, and the reason is the other half of the same
root cause. `syncModelInstalled` (`js/data/modelRegistry.js`) projects every dep down to a
few fields before POSTing the check:

```js
.map(dep => ({ id: dep.id, type: dep.type, filename: dep.filename }))   // targetPath DROPPED
```

So the server-side branch fired for nobody -- the field never arrived. **My first
verification missed this because I sent FULL dep objects; the app does not.** Measured
against the live server, same endpoint, same weights on disk:

| payload | result |
|---|---|
| OLD (id/type/filename) | `installed: false` -- both weights false |
| NEW (+ targetPath) | `installed: true` |

Fixed in all THREE projections (models, flows, plugins) -- a `targetPath` dep can be owned
by any of the three entities. `tests/targetpath-dep-install-state.test.cjs` now guards BOTH
halves: the server resolves targetPath against the engine root, AND the projections still
carry the field (with a count assertion so a drifted regex cannot silently stop checking).
**`npm test` 729/729.**

**Lesson worth keeping: verifying a route with a hand-built payload proves nothing about
the caller.** Reproduce the projection the app actually sends.

### 🔴 THE REMOTE TWIN -- analysed, recommendation below, NOT implemented

`_isImageResident` (`routes/remoteModels.js:225`) returns `true` for **every** `targetPath`
dep, unconditionally. Verified facts:

- RIFE genuinely IS baked: `cubric-vision-pod/Dockerfile:376`
  `dl "$RIFE_DIR" rife47.pth ...` into `comfyui-frame-interpolation/ckpts/rife/`. The
  blanket rule was written for it and is true FOR IT.
- **Chatterbox appears NOWHERE in `c:\AI\Mpi\mpi-ci`** -- grep across both
  `cubric-vision-pod/` and `cubric-vision-builder/` returns nothing. No node pack, no
  weights, in neither image.
- `bakedOnPod` already exists and is carried by 7 engineAsset weights; **rife47 does NOT
  carry it** and relies purely on the blanket targetPath rule.

So on a remote session the flow reports itself installed and then dies inside ComfyUI --
and it would die even with the weights resolved, because `FL_ChatterboxVC` is not in the
image at all.

**Recommendation: do NOT bake chatterbox into the Pod image yet. Stop the lie instead.**

1. Narrow the rule to `if (dep.targetPath && dep.bakedOnPod) return true;` and add
   `bakedOnPod: true` to `rife47` (which is TRUE, per the Dockerfile line above).
   `targetPath` describes WHERE ON DISK a weight goes; `bakedOnPod` describes WHETHER THE
   POD HAS IT. Conflating two unrelated properties is the actual defect -- the same shape
   as the `_localModelsCheck` bug this session already fixed.
2. The chatterbox weights then fall through and report NOT installed on remote, which is
   correct and **fails closed** -- a badge saying "get it" is recoverable, a Run that dies
   inside ComfyUI is not (the principle already stated in `flowsRegistry.js`'s dep-cache
   comment).
3. Only when Flow A is proven and worth remote support: either bake the pack + the 1.0GB
   into the image, or teach the wrapper a `targetPath` destination (today a bare filename
   yields an empty type and the wrapper rejects it -- which is the real reason the blanket
   rule existed).

Cost of the recommended change is small, but it touches the remote engine path, so it wants
either a `__cpu__` Pod check or an explicit logic-only sign-off. **Local is unaffected
either way.**

### 2026-08-24 -- REMOTE TWIN FIXED (Fabio approved the recommendation)

`_isImageResident` (`routes/remoteModels.js`) narrowed from `dep.targetPath` to
`dep.targetPath && dep.bakedOnPod`, and `rife47` (`assetDeps.js`) now carries
`bakedOnPod: true`.

The point, stated once so it is not re-derived: **`targetPath` says WHERE ON DISK a weight
goes; `bakedOnPod` says WHETHER THE POD HAS IT.** They coincided while RIFE was the only
targetPath dep in the registry, and reading the first as if it meant the second was luck,
not logic -- the same shape as the `_localModelsCheck` bug fixed earlier this session, where
two resolvers disagreed about the same field.

Classification swept over EVERY dep in the registry, both directions:

| dep | bakedOnPod | imageResident |
|---|---|---|
| rife47 | true | **true** (unchanged -- Dockerfile really bakes it) |
| chatterbox-ve / -t3 / -s3gen / -tokenizer / -conds | false | **false** |
| chatterbox-vc-s3gen / -vc-conds | false | **false** |
| the 7 `bakedOnPod` weights with no targetPath (MPI-380, ~950MB) | true | **true** (undisturbed) |

So a remote session now reports the chatterbox weights MISSING instead of claiming 1.0GB
the image does not contain. That **fails closed**: a badge saying "get it" is recoverable, a
Run that dies inside ComfyUI on a missing class is not.

**What this does NOT do:** it does not make Flow A work on remote. The volume path still
cannot install a `targetPath` weight (bare filename -> empty type -> wrapper reject) -- that
limitation is precisely what the blanket rule was hiding -- and `FL_ChatterboxVC` is not in
the Pod image either. Remote support needs a decision later: bake the pack + weights into
the image, or teach the wrapper a targetPath destination. Honest-missing is the correct
answer until one of those lands.

Pinned in `tests/targetpath-dep-install-state.test.cjs`, which now covers all three faces of
the same field (server resolution, the payload projection, and remote residency) and
ASSERTS the export exists rather than skipping when it does not -- a `typeof fn ===
'function'` guard would turn a rename into a silently-passing test. **`npm test` 729/729.**

**Verified by logic + a full-registry sweep, NOT on a live Pod.** No Pod was rented. The
change only ever moves a dep from "claimed present" to "reported missing", so the failure
mode it can introduce is a redundant install prompt, never a destructive one.

### 2026-08-25 -- "It sounds like my original voice." It does not, and the measurement says why.

Fabio listened to `MPI607_VC_flowtest_00001.flac` and reported it sounded like himself.
Measured with the card's own CAMPPlus gate (`research/speaker_similarity.py`) rather than
argued:

| pair | cosine |
|---|---|
| output vs TARGET (gravel senior male) | **0.79** -- above the 0.70 gate |
| output vs SOURCE (Fabio) | **0.19** -- different speaker |

So the conversion worked. **The demo clip was badly chosen -- by me -- and it violated the
card's own guidance rules 3 and 4.** Source `high_pitch_exp_fabio.wav` is a pushed
high-pitch take at 200Hz median f0; the target sits at 125Hz. Output landed at 162Hz with
the duration preserved to the centisecond (10.62s -> 10.64s). What Fabio heard was HIS
delivery, HIS rhythm and a pitch still far above the character's -- wearing a different
timbre. That reads as "my voice" instantly.

**This is the "it did nothing" failure mode the guidance predicted, reproduced accidentally
in our own first demo.** Worth keeping: the very thing that makes Flow A special (the
performance passes through untouched) is also what makes a user think it failed.

#### A second finding: a PUSHED take shifts the speaker's own identity

`high_pitch_exp_fabio.wav` scores only **0.38-0.42** against Fabio's natural-pitch
recordings (`recording_003/004/005`), which score 0.72 against each other. The encoder calls
his own performed take a different speaker. That is rule 1 ("perform but do not push")
appearing in the numbers, and it also means a pushed source gives VC a distorted x-vector to
work against.

#### The rule-obeying re-run

Source `recording_003.wav` (Fabio, natural 106Hz), target the same gravel character (125Hz)
-- timbre distance 0.23, pitch gap 19Hz. `MPI607_VC_GOOD_PAIR_00001.flac`, 16.7s,
`execution_cached: []`:

| pair | cosine |
|---|---|
| output vs TARGET | **0.84 -- SAME speaker** |
| output vs SOURCE | 0.31 |

#### 🔴 SHARPEN GUIDANCE RULE 3: VC TRANSPLANTS TIMBRE, NOT PITCH

Measured across both runs: duration is preserved exactly, and the output largely follows the
SOURCE's pitch contour -- 106Hz -> 106Hz unchanged in the good pair, and 200Hz -> 162Hz in
the pushed pair, never reaching the target's 125Hz in either.

So "meet the target's pitch" is not "match it and VC will meet you halfway". It is: **VC
will NOT move your pitch to the target, so a large gap yields the target's timbre at a pitch
that voice never uses** -- which is the unnatural result, and at the extreme is why a
high-pitched take still sounds like the speaker. Rule 3 in
`docs/playbooks/add-flow/existing-flows/voice-changer.md` states the WHAT but not this WHY;
update it at close-out.

#### Product consequence for the UI (feeds the /mpi-brainstorm)

A user CANNOT be expected to discover this. The pairing decision -- timbre far, pitch near --
is the whole difference between "spot on" and "it did nothing", and today nothing in the
product says so. Whatever the voice selector becomes, it should surface the target's pitch
range (and ideally flag a large gap against the recording just made), because that is the one
number that predicts the outcome.

### 2026-08-25 -- 🔴 GATE FAILED. VC lands HALFWAY, the cosine is not a perceptual gate, and iteration cannot push it.

Fabio had said "it sounds like me" twice. The handoff's proposed test -- a blind A/B of the
output against the target clip -- **could not have settled it**: VC preserves the source's
words, rhythm and duration exactly, so he identifies the output by CONTENT in one second
and never makes a timbre judgement at all. Replaced with a test that removes his bias
instead of arguing with his verdict.

#### The decisive clip: a STRANGER's voice, converted, described cold

`vd_young_male_us_warm.wav` -> `A3_REF_senior_male_gravel_character.wav`, played with no
references in earshot and no idea what it was. He has no stake in either voice, so there is
no delivery of his own to recognise.

| clip | what he said, cold |
|---|---|
| the SOURCE (`ref_A`) | "young guy, 25, forcing a cartoon-type voice" |
| the TARGET (`ref_B`) | "older gentleman, 50+, raspy low, good for trailers" |
| **the OUTPUT** | **"male, 35-ish, deep but not too deep"** |

**The output landed almost exactly halfway between source and target.** CAMPPlus scored
that same output **0.92** against the target -- the highest number in the entire matrix and
"same speaker, confidently" on the tool's own published scale.

#### What this rules out

1. **NOT self-recognition bias.** That was the one explanation that would have saved the
   architecture. The stranger clip has no voice of Fabio's in it and still failed to arrive.
2. **NOT a bad pairing.** Three targets from his voice -- gravel senior male (0.84), midage
   UK female (0.82), young US male (0.75) -- every one still "sounds like me" to him:
   "me with a pitch-down effect", "me injecting female hormones", "me younger with a cold".
   Deliberately far targets, including cross-gender. The timbre-far/pitch-near thesis from
   2026-08-24 does not rescue it.
3. **NOT fixable by iteration.** `FL_ChatterboxVC` exposes no strength dial (only `use_cpu`,
   `keep_model_loaded`, `seed`), so the only lever is feeding the output back in. Chained
   3 passes in one graph:

   | | pass 1 | pass 2 | pass 3 | target |
   |---|---|---|---|---|
   | stranger, median f0 | 115.9 Hz | 116.6 | 121.4 | 125.7 |
   | Fabio, median f0 | 95.8 Hz | 101.5 | 103.3 | 125.7 |
   | cosine to target (Fabio) | 0.87 | 0.90 | 0.92 | -- |

   Fabio on the stranger's three passes: **"S1, S2 and S3 sound exactly the same. I even put
   on my headphones to make sure I wasn't hallucinating."** The encoder agrees -- S1 vs S2
   = 1.00, S2 vs S3 = 1.00. On his own voice pass 3 IS "further away from my voice" -- but
   it is **hallucinating: rumbling noises and pitch variations that are not in the source**.
   The only distance iteration buys is bought by the model inventing signal, which is
   degradation, not conversion. Pass 1 is still "my voice pitched down".

#### 🔴 THE CAMPPlus COSINE IS DISQUALIFIED AS A QUALITY GATE

This is the durable lesson and it invalidates earlier conclusions on this card, not just
this test. 0.92 = "same speaker, confidently" for a clip a listener with no stake places
15-20 years and a whole texture away from the target. The encoder measures x-vector
distance, which is what Chatterbox CLONES from -- it is a legitimate check that the pipeline
RAN, and it is not evidence the product is good. Every identity claim on this card that
rests only on a cosine needs re-judging by ear.

A second reason to distrust the scale here: `ref_A` vs `ref_D` -- two different library
voices, different genders -- scores **0.75**, which the tool labels "same-ish". The band is
compressed for these voices, so anything under ~0.8 carries almost no information.

#### What VC actually does, stated correctly

It moves timbre roughly halfway toward the target and stops, and it preserves accent,
mannerism, rhythm and pitch contour -- every cue a listener actually uses to identify a
speaker. Pitch does move a little toward the target (101.8 -> 94.2 Hz on one pair, 128.6 ->
115.9 on another) but never arrives, which refines the 2026-08-24 note: it is not that VC
leaves pitch untouched, it is that VC moves *everything* part of the way.

#### Consequences

- **Flow A does not deliver its promise.** "Convert your voice into a library character"
  returns the user, altered. The code is correct and it flushed out two real bugs, but the
  card's `user-ux` gate is FAILED.
- **The voice library is NOT the missing piece.** The 2026-08-24 plan was that pairing
  guidance plus a pitch-annotated library would fix this. Finding 2 kills that. Authoring
  library voices now would build on a floor that does not hold. Testing before authoring
  saved that work.
- **Open for Flow B:** its source is Chatterbox TTS output, not the user, so there is no
  user identity to leak -- but a halfway VC still means the character comes out halfway.
  Worth re-testing whether direct TTS cloning from a character clip is good enough on the
  EAR, since round 1's "identity survives VC, level with no-VC" verdict rests entirely on
  the cosine now disqualified above.

**Evidence:** `Desktop/MPI607_listen/` (round 1, blind) and `Desktop/MPI607_listen_2/`
(round 2, iterated). Scripts in the session scratchpad: `vc_blind.py`, `vc_iterate.py`.
Six bench generations, `execution_cached` empty on every VC node.

### 2026-08-25 -- REGISTER decides whether VC is wanted, and it retires "direct sounds robotic"

The 2026-08-23 note *"Direct is very neutral... sounds weird and robotic"* is **scoped to the
emotion tests and must not be generalised.** Fabio, 2026-08-25:

> "I've done some tests with TTS with my voice and just straight out of TTS with no VC.
> What I supplied is the way I talk, for example, in my tutorials, and what came out is
> exactly the same thing... for my tutorials it will be excellent."

So plain `FL_ChatterboxTTS` cloning, with **no VC stage at all**, is already excellent for
DICTATION register -- tutorial, narration, explainer, the way someone actually speaks. The
"robotic" verdict came from asking direct TTS to carry a pushed emotion, which is the one
job it cannot do.

**The axis is REGISTER, not quality:**

| register | route | evidence |
|---|---|---|
| dictation / tutorial / narration | TTS only, no VC | "exactly the same thing... excellent" (2026-08-25) |
| performance / emotion | TTS (perf clip, cfg 0.3, exag 1.2) -> VC (character) | "push does carry emotion" (2026-08-23) |

This **confirms Fabio's design instinct** that a `neutral` emotion should bypass the VC
stage: neutral is the dictation register, and in that register VC is not merely optional,
it is unnecessary. The concern that bypassing VC would land users on the worst-sounding
mode was based on the mis-scoped 23rd note and is withdrawn.

It also reframes today's halfway finding. VC's job in the settled architecture is to carry
a PERFORMANCE onto a character, and Fabio's own successful VC results ("it depends on what
I do to the pitch of my voice and my performance") say the transform is usable when the
user knows what to aim for. **The product obligation is truthful guidance, not a better
model** -- tell the user what VC does to a voice and what makes a pairing work, and let
them iterate. Flow A is NOT dropped and the library IS being built (Fabio, 2026-08-25).

What today's finding still constrains: the output is a BLEND, so any copy promising "become
this character" is false, and the guidance must say the result carries the user's own pitch,
accent, rhythm and mannerisms.

### 2026-08-25 -- CHARACTER CONSISTENCY HOLDS. But the VC route does NOT land on the character, and that breaks the neutral bypass.

Same character target (`A3_REF` gravel), same text, two performance clips that are
different speakers (`e1_angry` vs `e2_sad`, cosine 0.47). Only the performer varied.

| clip | driven by | median f0 | cosine to target | Fabio |
|---|---|---|---|---|
| `A` | angry performer (307.7 Hz) | 223.9 Hz | 0.82 | same character as B |
| `B` | sad performer (256.5 Hz) | 130.9 Hz | 0.90 | same character as A |
| `C_direct` | the character clip, NO VC | 116.6 Hz | 0.95 | **"sounds like target"** |
| `TARGET` | -- | 125.7 Hz | -- | -- |

**1. The library collapse SURVIVES.** A and B are 93 Hz apart -- close to an octave -- and
Fabio still hears one character: *"A and B seem like the same character. The only thing is
that when he was angry he was pitched up a little bit, which is natural."* The predicted
performer-drift did not happen perceptually; the pitch spread reads as emotion, not as a
second actor. **~60 neutral character clips + ~5-8 shared performance clips still holds.**

**2. 🔴 But neither A nor B sounds like the character.** Fabio: *"They do not sound like
Target at all, by the way. C_direct sounds like target."* So the VC route produces a
CONSISTENT voice that is not the one the user picked. Same halfway behaviour as the rest of
today, now measured inside the shipping pipeline.

#### 🔴 THE ROUTE DECIDES THE VOICE -- so the neutral bypass creates a mismatch

| register | route | what the user hears |
|---|---|---|
| dictation / neutral | TTS direct from the character clip | **the character** (verified by ear) |
| performance / emotion | TTS(performer) -> VC(character) | a consistent OTHER voice |

A script mixing neutral and emotional lines would therefore switch actors mid-scene. The
proposed `neutral` dropdown value that BYPASSES the VC stage is exactly this mismatch, so
the bypass cannot ship as a bare bypass. Three ways out, for the brainstorm to choose:

- **One route always.** Send neutral through VC too, driven by a neutral performance clip
  (`ctl_vc_neutral` already exists). Consistent across every emotion, and the cost is that
  no route ever reaches the library's own preview voice -- which the next bullet fixes.
- **Preview what ships.** Generate every library tile's audition clip THROUGH the shipping
  pipeline rather than playing the raw character clip. What you hear when selecting is then
  what you get. Needed for either route.
- **Two voices, declared.** Keep the bypass, and treat neutral and performance as two
  distinct presets of a character rather than one voice. Cheapest to build, worst to
  explain.

**3. Why the encoder never saw any of this.** CAMPPlus x-vectors are trained to be pitch-
and prosody-invariant -- that is what makes them good at speaker verification. Human
identity perception is largely pitch and prosody. The cosine is blind to exactly the cue
Fabio is judging on, which is the mechanism behind every disagreement recorded today.
**Replacement gate: cosine for timbre AND median-f0 delta for pitch.** Both are already
scripted (`research/speaker_similarity.py`; f0 via `librosa.pyin`, see the session
scratchpad). Cosine alone is not a gate.

**4. Performance clips are pitched wrong for male characters.** The current set sits at
256-307 Hz. Driving a 125 Hz male character from a 300 Hz performer is what produced A's
223.9 Hz. Performance clips need authoring per PITCH REGISTER, not one shared set -- a
direct requirement on the library.

**5. Emotion labels are approximate.** Fabio: *"performance A is angry, and performance B is
not really sad, it's a sad-angry kind of thing, but B did come out sad for some reason."*
The emotion the pipeline delivers is not reliably the label on the source clip, which is
another reason the performance clips are the quality lever worth auditioning by ear.

**Evidence:** `Desktop/MPI607_listen_3/`, scripts `vc_consistency.py` / `prep_round3.py` in
the session scratchpad. Three bench generations, VC and TTS nodes executed (only `LoadAudio`
cached).

### 2026-08-25 -- 🔴 TEXT CANNOT SELECT EMOTION. The library needs performance clips after all.

The `mpi607_emotion3` clips generated 2026-08-23 and left "unconfirmed" were finally
judged. A NEUTRAL reference (`e0_neutral.wav`) speaking angry and sad WORDS at
`cfg_weight 0.3` -- the cell that decides whether the library is 60 voices or 60 x N.

| clip | words | exaggeration | median f0 | Fabio |
|---|---|---|---|---|
| 1 control | neutral | 0.5 | 210.8 Hz | "empty shell... works for dictation" |
| 2 | angry | 0.5 | 215.1 Hz | monotonous, no emotion |
| 4 | sad | 0.5 | 215.1 Hz | monotonous, no emotion |
| 3 | angry | 1.0 | 254.3 Hz | **"more sad than angry... disappointed"** |
| 5 | sad | 1.0 | 248.5 Hz | **"sounds upset and disappointed"**, angrier than 3 |

**Two failures, and the second is the fatal one.**

1. At exaggeration 0.5 the words do nothing at all: *"Numbers 1, 2 and 4 sound like
   somebody took their soul away and they just became an empty shell."*
2. At 1.0 emotion appears but it is **the wrong emotion** -- the ANGRY text read as sad and
   disappointed, and the SAD text read as the more upset of the two. The dial produces
   generic INTENSITY, uncorrelated with what the script says.

**Conclusion: emotion cannot come from the text.** It has to come from a performance clip
through the VC stage, which confirms the 2026-08-23 settled architecture and closes the
question that was open since then. The library is 60 neutral character clips PLUS a set of
performance clips; the "60 voices, emotion free at runtime" collapse is dead.

**Product consequence: the emotion dropdown IS the performance-clip set.** The emotions the
product can offer are exactly the performance clips that get authored -- there is no
text-driven path to a new emotion.

**Silver lining, and it is real:** exaggeration 0.5 + `cfg_weight` 0.3 is precisely the flat,
even delivery the DICTATION register wants. Fabio: *"which works for dictation, I guess"* --
matching his own tutorial-voice result from earlier today. The flat setting is not a bug to
fix, it is the dictation preset.

**Evidence:** `Desktop/MPI607_listen_4/`, clips from `research/emotion_text_c03.py`
(generated 2026-08-23, judged 2026-08-25). No GPU spent -- the clips already existed.

## 2026-08-27 (session 26) -- THE MULTILINGUAL DEFECT IS `repetition_penalty`, PROVEN. Accent path unblocked.

`research/mtl_repetition_sweep.py`. 24 warm bench runs: 6 seeds x {base English, multilingual
French at rp 2.0 / 1.5 / 1.2}. Text, reference clip (`standard_male_1.opus`, the SHIPPED opus
decoded) and every other parameter held fixed; only seed and `repetition_penalty` move.

| config | n | median dur | vs base | median wall | runs that overshot |
|---|---|---|---|---|---|
| base, English | 6 | 3.90s | -- | 7.1s | 0 |
| **multilingual, rp 2.0 (node default)** | 6 | 4.38s | +0.48s | **14.2s** | **3 / 6** |
| multilingual, rp 1.5 | 6 | 3.56s | -0.34s | 8.0s | 0 / 6 |
| multilingual, rp 1.2 | 6 | 3.71s | -0.19s | 8.1s | 0 / 6 |

**The three failures at the default: 4.97s, 11.18s and 11.97s** against a 3.90s base median --
up to 3x the length of the line. Two carry a tail 2.65x and 3.05x flatter than their own body
(spectral flatness; noise is flat, voiced speech is peaky) with 0.00 and 0.09 voiced frames in
the last second: that is hiss, measured. The third babbles speech-like filler instead. All
three also ran 18-21s WARM. **Zero failures in the twelve runs at 1.5 or 1.2**, every duration
inside base's own 3.60-4.20s spread and no flatness ratio above 1.11x.

**Both of Fabio's symptoms are ONE cause, exactly as the card argued.** The multilingual model
is not inherently slow -- warm it is 8.0s against base's 7.1s, a ~1s overhead. It is slow
precisely on the runs where it fails to land a stop token, because it keeps decoding to the
cap. "A few extra seconds with some noise" and "it takes quite a while" are the same event.

**SHIP `repetition_penalty` 1.5** (fallback 1.2). 1.5 is the smaller move off the default and
keeps more of the penalty's actual purpose; no repetition appeared at either value across
twelve runs. Bake it in the graph -- it is not a user control.

### Two measurement traps hit on the way, both worth more than the result

1. **A COLD RUN CANNOT TIME ANYTHING.** The first pass ran `keep_model_loaded: False`, so
   every job reloaded ~3GB and measured 24.4s for the BASE model against 23.2s for
   multilingual -- indistinguishable, and both almost entirely load. That reads as "the
   multilingual model is not slow after all", which is the opposite of the truth. Warm, the
   gap is 14.2s vs 7.1s. **Never time a Chatterbox config cold.**
2. **A SILENCE TRIM CANNOT SEE TRAILING NOISE.** The first pass measured the tail with the
   `ingest.sustained_trim` rule and reported **0.00s of tail on the very run that overshot** --
   because NOISE HAS ENERGY, so an energy trim files it as speech. Same class of error as
   MPI-622's `trim(top_db=35)` finding, one layer up. What separates the two is SPECTRAL
   FLATNESS, and the ratio against the clip's OWN body is what makes it comparable across
   voices. A duration check against a control is the backstop that caught it either way.

### Scope of the claim -- do not widen it

One reference voice, one twelve-word English line, one language (French). It establishes that
the default is the cause and that lowering it removes the symptom on this line; it does NOT
establish a failure RATE, and it has not been checked on a second language. Neither gates the
graph build. **Fabio's ear is still owed** on the three overshooting clips -- the numbers say
"noise", only he can say it is the noise he heard. Clips:
`%LOCALAPPDATA%/cubric-vision/mpi607/mtl_sweep/` -- `mtl_rp20_s12345`, `mtl_rp20_s4242`,
`mtl_rp20_s1301` against `mtl_rp12_s12345` as the clean control.

**The bench holds ~4GB** from the `--warm` run: `keep_model_loaded` parks models in the pack's
module-level `_MODEL_CACHE`, which `model_management` never sees, so `POST /free` returns 200
having released nothing. It clears on restart.

## 2026-08-27 (session 26, later) -- CHAIN ORDER SETTLED, and the ACCENT AXIS should be DROPPED

### Order A wins. `TTS(perf clip) -> VC(voice)` stays.

Fabio challenged the order: *"User picks a voice. The voice goes through TTS ... comes out
normal, neutral. Only then do you add the performance."* Identity first. It is a fair
challenge -- this card's own text says order A lands on "a consistent OTHER voice" -- so it
was built and measured rather than argued. `research/chain_order_ab.py`.

    A  TTS(text, ref = perf clip)  ->  VC(input = A1, target = voice)
    B  VC(input = perf, target = voice)  ->  TTS(text, ref = B1)

| | cosine vs c0 (the voice) | f0 delta vs c0 | cosine vs c2 (performer) |
|---|---|---|---|
| c1 neutral TTS on the voice (calibration) | 0.811 | -1.15 st | 0.452 |
| **A  TTS -> VC** | **0.897** | **-1.20 st** | 0.507 |
| B  VC -> TTS | 0.827 | **+5.35 st** | 0.451 |

**B's failure is pitch, and only the f0 column sees it: +5.35 semitones, 135 -> 184 Hz** --
straight out of R2 and into R3. Its cosine stays respectable (0.827) because CAMPPlus
x-vectors are pitch-invariant by construction. That is the third time on this card that the
cosine alone would have passed something a listener rejects; the combined gate earned its
place again. Fabio's ear agreed with the numbers unprompted.

**A scored ABOVE the neutral-TTS calibration (0.897 vs 0.811), so the "lands on a consistent
OTHER voice" concern did not reproduce on this pair.** That claim came from the audition
work, where the TTS half was shared across every voice in a register -- a different setup.
ONE voice and ONE clip is not a refutation of the earlier finding and must not be recorded
as one; it is enough to say order A is not the thing to fix. Re-test on a second pair before
generalising either way.

**A constraint worth stating once so nobody re-proposes the naive version:** VC preserves its
SOURCE's linguistic content. `VC(input = perf clip, target = TTS output)` therefore speaks the
PERFORMANCE CLIP's sentence in the user's voice, not the user's text. Order B is the only
coherent "identity first" chain, because it uses the VC output purely as a TTS REFERENCE.

### The accent axis: only Hindi ever read, and not against a library voice

`research/accent_strength_probe.py`, five clips, judged by ear. Fabio: *"The only accent that
I actually noticed was the Indian accent. Every other accent just read neutral"* -- and on
this probe *"None of these have any accent"*, Hindi included.

**The card's own note is superseded for this purpose.** 2026-08-23 recorded *"`exaggeration`
0.8 gives a more pronounced accent than 0.5; both work."* 0.8 did not rescue French, German
or Italian here. The difference from the original test is the REFERENCE: that listening used
Fabio's own voice and a synthetic, this used a shipped LIBRARY voice. So the honest statement
is narrow -- **accent does not survive a library voice**, which is the only reference Flow B
has. Whether it survives a user's own recording is untested and belongs to a later card.

**RECOMMENDATION: drop the accent axis from Flow B v1.** One working accent out of 23 is not
a feature, and dropping it removes, in one move: the 3.2 GB `chatterbox_multilingual` set and
the bundled-vs-optional question with it; the `repetition_penalty` defect (multilingual-only,
solved earlier today but no longer load-bearing); the combo-injection constraint that forced a
curated accent list; and the four tokenizer deps (ja/he/ru/zh) missing from the python lock.
Flow B becomes base TTS + VC -- **3.19 GB**, one model, one switch bank.

### 2026-08-27 CORRECTION -- THE AXIS IS **LANGUAGE**, NOT ACCENT. MULTILINGUAL SHIPS.

**The recommendation above is SUPERSEDED. Its measurements stand; its conclusion was wrong,
because it was answering the wrong question.** Everything above tested "can multilingual
impose a foreign ACCENT on ENGLISH text". The answer is still no in any dependable way. But
that was never the feature that justifies the model.

Fabio, 2026-08-27, from his own bench testing:

- **Portuguese text through the BASE model is unusable** -- *"you get an English person trying
  to speak Portuguese very badly, and it sounds like crap."*
- **Portuguese text through MULTILINGUAL with Portuguese selected gives real Brazilian
  Portuguese.** That is the feature.
- Cross-language accent DOES work -- Portuguese text with Italian selected gave *"a Portuguese
  person with an Italian accent"* -- but it is *"very rare to land it correctly as an accent on
  a separate language"*, which is exactly what the probe above measured.

**HIS RULE: multilingual runs for any language that is NOT English. It is not an accent
creator.** The base model stays the fast default for English, unchanged.

So the selector is **Language**, not Accent, and everything the recommendation above proposed
dropping comes BACK and is load-bearing:

- `chatterbox_multilingual`, ~3.2 GB -- it buys non-English support, not an accent trick.
  The bundled-vs-optional question is REOPENED and still needs deciding.
- The `repetition_penalty` 1.5 finding, which now gates a shipping path.
- The combo-injection constraint: `language` refuses a link, so one baked arm per SHIPPED
  language, and the shipped list is a curated product decision.
- The four tokenizer deps missing from the python lock -- `pykakasi` (ja), `dicta_onnx` (he),
  `russian_text_stresser` (ru), `spacy_pkuseg` (zh). Shipping any of those four languages
  means adding its dep; the Latin-script languages need nothing extra.

**THE LESSON, and it is the second time today:** a negative result is only as good as the
question it answered. "Accent on English does not work" is TRUE and was measured properly --
and it very nearly deleted the multilingual model, which the product needs for a completely
different reason nobody had put in front of me. Ask what a model is FOR before recommending
its removal.

### 🔴 STILL OPEN: the emotion recipe is NOT validated on the multilingual model

`exaggeration` 1.2 / `cfg_weight` 0.3 is a BASE-model finding. Only `repetition_penalty` 1.5
has been measured on multilingual; `min_p` 0.05, `top_p` 1.0 and `temperature` 0.8 are node
defaults held fixed so the sweep had one moving part, and exaggeration/cfg were never swept
on it at all.

**There is already a warning sign.** Quadrant q4 ran multilingual + an angry performance clip
at exactly 1.2 / 0.3 and Fabio heard no emotion in it. So the recipe may not cross models,
and a performed read in a non-English language may need its own pair of values.

Do not carry the base numbers over -- that is precisely the error that produced q3's missing
accent (0.5 was locked for the base model's dictation read and was reused on the accent arm
without being re-derived). Sweep `exaggeration` x `cfg_weight` on multilingual with a real
non-English line before the op is wired.


The `repetition_penalty` finding stays recorded and stays true; it is simply not needed while
no multilingual node ships.

### Bench artifacts left for Fabio's own testing

- `G:\ComfyUi\ComfyUI\user\default\workflows\MPI607_FlowB_OrderA.json` (13 nodes, shipped
  shape) and `..._OrderB.json` (12 nodes), so the two can be driven directly.
- The whole library staged as wav: `input/mpi607_voices/<REGISTER>_<id>.wav` (56) and
  `input/mpi607_perf/<REGISTER>_<emotion>.wav` (30), register-prefixed so pairing a voice to
  its grid needs no manifest lookup. Index at `input/mpi607_index.json`.

### 🔴 THE LANGUAGE LABELS ARE UPSTREAM'S AND AT LEAST ONE OF THEM IS A LIE

Fabio, 2026-08-27, from his own bench testing: the node's dropdown offers **`Portuguese (pt)`**,
which reads as European Portuguese -- and what the model actually produces is **Brazilian
Portuguese (pt-BR)**. His words: *"it's actually PTBR ... which is very different. It's
different only because of the accent, by the way."*

Same written language, different accent -- which is precisely the axis a listener judges on,
and precisely the thing a Portuguese user would notice in the first sentence.

**THIS IS THE SAME RULE MPI-622 ALREADY SET FOR THE `accent` FIELD, one layer up: a wrong
label is worse than a missing one.** There it was a voice prompted "refined British" that a
listener heard cold as a 1930s New York gangster, and the resolution was to ship the field
EMPTY rather than wrong. The picker exists so a user need not audition everything, and a wrong
label spends exactly the trust that makes it useful.

**IT IS NOT A PORTUGUESE FOOTNOTE.** The list is upstream's, it is bare ISO 639-1 codes, and a
2-letter code carries NO variant information at all. Every entry with a major regional split is
suspect on identical grounds and NONE has been verified:

| entry | the unanswered question |
|---|---|
| `Portuguese (pt)` | **ANSWERED: it is pt-BR, not pt-PT.** Label it Brazilian |
| `Spanish (es)` | Castilian, or Latin American? |
| `Chinese (zh)` | Mandarin or Cantonese; and which script |
| `Norwegian (no)` | Bokmal or Nynorsk |
| `English (en)` | which English -- and it is the DEFAULT, so it is the one nobody checks |

**THE OBLIGATION ON THE SHIPPED LIST:** every language Flow B offers gets its actual variant
confirmed BY EAR before it is labelled, and the label names the variant that was heard --
"Portuguese (Brazil)", not "Portuguese". A language whose variant has not been confirmed either
does not ship or ships under a label that claims no variant. Do not infer the variant from the
ISO code, and do not infer it from the language's name in the node's own dropdown: that
dropdown is the thing that was wrong here.

This costs nothing to honour while the shipped list is curated anyway (the `language` combo
refuses a link, so each language is a hand-added graph arm regardless).


## 2026-08-27 (session 27) -- THREE DramaBox PACKS, NOT ONE. The rejection table was scored against the WORST of them.

**Nothing downloaded, nothing installed, nothing queued on the bench.** Fabio was pulling LTX
2.3 and said no downloads; the only fetch was MelodramaBox's **283 KB source zip** off the
ComfyUI registry CDN, read in the scratchpad. Everything below is from that source, from
`gh api`, and from the repo READMEs.

### The registry has SIX "drama" hits and only three are DramaBox

| pack | registry | stars | last push | shape |
|---|---|---|---|---|
| `kat3ri/ComfyUI-DramaBox` | yes (1 node) | 19 | 2026-05-25 | one monolithic node wrapping upstream `TTSServer` |
| `FranckyB/ComfyUI-DramaBox` | **NOT in registry** | 47 | 2026-05-20 | wrapper + own downloader, offload policy widget |
| **`doggeddalle/ComfyUI-MelodramaBox` 2.1.0** | yes | 0 (169 dl) | 2026-07-20 | **native ComfyUI, componentized, GGUF** |

`ComfyUI-OldTimeRadio`, `ComfyUI-SingleLinePicker`, `comfyui_audio_translator` and
`ComfyUI-Direct3D-S2` are the other four hits and are not DramaBox integrations.

### 🔴 THE REJECTION TABLE'S NUMBERS WERE RIGHT AND ITS VERDICT WAS SCOPED TO ONE FORK

`plan.md` rejects DramaBox on "24GB VRAM, no weight sharing". Both are true **of kat3ri**.
Neither is true of MelodramaBox:

| claim on the card | MelodramaBox |
|---|---|
| "24 GB VRAM" | **Q8_0 GGUF DiT + 4-bit Gemma = ~13.5 GB peak, measured on a 3090.** bf16 = 16.6 GB |
| "no weight sharing" | DiT + audio components resolve via `get_filename_list` / `get_full_path` -- **they honour `extra_model_paths.yaml`** |
| "~6 GB" (handoff) | **~16.5 GB to download**: DiT 6.6 + audio components 1.9 + Gemma-3-12B 4-bit ~8 |

The ~6 GB figure in the previous handoff is the DiT alone. There is **no upstream GGUF of the
audio DiT** (the published LTX-2.3 GGUFs are the full 22B audio+video model), so the 6.6 GB
bf16 download is unavoidable -- Q8_0 (3.5 GB) is produced locally afterwards by the pack's own
converter.

### 🔴 THE `folder_paths` CHECK: 2 of 3 COMPONENTS PASS, AND THE ONE THAT FAILS IS THE BIGGEST

This was the cheap check the handoff flagged as failing silently (`ComfyUI_Fill-ChatterBox`
computes its dir from `__file__` and never reads `extra_model_paths.yaml`, which is why the
Chatterbox weights had to ship as `targetPath` deps). Result per pack:

- **kat3ri**: `MODELS_DIR = Path(folder_paths.models_dir) / "DramaBox"`
- **FranckyB**: `_comfy_models_dir() -> Path(_fp.models_dir)`

`folder_paths.models_dir` is `<ComfyUI>/models` and **nothing else**. `extra_model_paths.yaml`
registers per-category search paths; it never moves `models_dir`. So for those two the Cubric
models root is invisible -- the handoff's instruction "weights into G:/CubricModels" would not
have been seen.

**MelodramaBox splits by component:**

| component | size | how it resolves | Cubric root? |
|---|---|---|---|
| DiT | 6.6 GB / 3.5 GB Q8_0 | `_folder_choices` -> `get_filename_list("diffusion_models")`, `_resolve_model_file` -> `get_full_path` | ✅ found |
| audio components (VAE + BigVGAN vocoder) | 1.9 GB | same, folder `vae` | ✅ found |
| **Gemma-3-12B text encoder** | **~8 GB** | `config.TEXT_ENCODER_DIR = get_folder_paths("text_encoders")[0]`, hardcoded | ❌ **pinned to `[0]`** |

The text encoder is **not a file dropdown**. `_VARIANTS` is a fixed two-entry list (4-bit
unsloth / bf16 google-gated) and `load()` calls `downloader.ensure_text_encoder(repo_id,
dirname)` unconditionally. That function checks exactly one directory
(`os.path.join(config.TEXT_ENCODER_DIR, dirname)`) and `snapshot_download`s if absent. There
is no multi-root search on that path at all.

**And `[0]` is never the Cubric root.** `routes/yamlHelper.js` emits additive blocks
(`comfyui:` + `comfyui_default:`) with **no `is_default: true`**, so Vision's models root is
appended to ComfyUI's list, never prepended. `get_folder_paths("text_encoders")[0]` is
`<engine>/ComfyUI/models/text_encoders`.

**FABIO'S RULING (2026-08-27): weights outside the dedicated models folder are NOT OK** --
*"It would mean that we couldn't share them across other models."* Gemma-3-12B is a general
text encoder, so this is the single most shareable file in the set. Three routes out, cheapest
first:

1. **Junction** `<engine>/ComfyUI/models/text_encoders/gemma-3-12b-it-bnb-4bit` -> the Cubric
   root. Zero code, but it lives in the engine tree the app reinstalls, and this repo has a
   standing rule against recursive deletes near junctions.
2. **Patch `config.py`** -- resolve `TEXT_ENCODER_DIR` by scanning
   `get_folder_paths("text_encoders")` for an existing snapshot. ~3 lines. **There is no
   upstream GitHub repo (see below), so adopting this pack means maintaining a fork
   regardless** -- which makes this the honest option and the smallest diff.
3. **Ship it `targetPath`** like Chatterbox -- established pattern, but concedes the sharing.

### 🔴 MELODRAMABOX'S GITHUB REPO DOES NOT EXIST

`gh api repos/doggeddalle/ComfyUI-MelodramaBox` -> 404. The registry record points at
`https://github.com/doggeddalle/ComfyUI-MelodramaBox`, which is gone or private. **The
registry zip is the only source**, served from
`https://cdn.comfy.org/doggeddalle/comfyui-melodramabox/2.1.0/node.zip` (283 KB). No issue
tracker, no upstream to file against, 0 stars.

Weighed against that: the code is materially better engineered than the 19-star pack --
vendored LTX-2 core with `ATTRIBUTION.md` and the licence text, each model component a real
`ModelPatcher` (so ComfyUI owns VRAM, offload and eviction, with a live progress bar and
Cancel), a GGUF loader plus its own pure-Python quantizer, LoRA support, and Perth
watermarking already wired -- Perth being the watermarker this card already committed to.

**This also fixes a known Chatterbox failure mode.** The handoff records the bench holding
~4 GB because `keep_model_loaded` parks models in the Chatterbox pack's module-level
`_MODEL_CACHE`, invisible to `model_management`, so `POST /free` returns 200 having released
nothing. Real `ModelPatcher`s do not have that hole. (One exception the pack documents: the
4-bit Gemma is pinned by bitsandbytes and comfy cannot evict it automatically -- hence its
`DramaBox Unload Models` node and the `keep_loaded` toggle.)

### THE LICENCE IS THREE LAYERS AND ONE IS NON-COMMERCIAL

- pack code: **Apache-2.0**
- DramaBox model + the vendored LTX-2 inference code: **LTX-2 Community License**
- optional **RE-USE reference denoising: NSCLv1, NON-COMMERCIAL**

The third must stay off for anything that ships. This does not change the LTX-2 Community
licence question the card already carries.

### ✅ THE AUDIO-BRANCH EXTRACTOR IS REAL AND IT IS THIS PACK'S

`dramabox_nodes/finetune_extract.py` (and standalone
`conversion_scripts/ltx_finetune_to_gguf.py`). It splits an **LTX-2.3 checkpoint**, not a video
file:

```
python -m dramabox_nodes.finetune_extract \
    --src  <path or HF url to a full LTX-2.3 .safetensors> \
    --dst  models/diffusion_models/<name>-audio-only.safetensors
```

- Keeps exactly the audio-only DiT's own `state_dict()` key set and drops the rest -- the
  ~14 GB video stream **and** the audio<->video cross-attention. Output ~6.6 GB.
- Pure safetensors header parsing; no torch, no ComfyUI; streams from a URL. fp8 sources
  (e.g. `fp8mixed`) are dequantized to bf16 so the output is universally loadable.
- Self-validating: the keep-set IS the target model's `state_dict()` names, so it either fills
  every parameter or hard-fails listing what is missing.
- Output loads through the normal `DramaBoxDiTLoader`, accepts LoRAs, GGUF-converts.

**ITS OWN CAVEAT, and do not lose it:** the audio-only forward disables the audio<->video
cross-attention the finetune was trained with, so a finetune's flavour may come out generic or
degraded. *"Loadability is guaranteed; audio quality is an experiment."*

**🔴 CORRECTION, same day, Fabio: DO NOT REACH FOR THIS TOOL HERE.** *"But why would we
extract the audio component when it already exists?"* -- correct. `dramabox-dit-v1.safetensors`
(6.58 GB on HF) **is already** the extracted, finetuned audio branch. Extracting it yourself is
backwards.

And the "this bridges the DramaBox route to the LTX route" line first written here was **WRONG**.
Vision ships `ltx-2.3-22b-dev-fp8`. Extracting *its* audio branch yields the **un-finetuned base**
audio branch -- which is exactly what DramaBox is a finetune OF. You would be hand-building a worse
DramaBox. The tool earns its place only if some future THIRD-PARTY LTX-2.3 finetune has a voice
flavour worth lifting. Speculative; not a reason to adopt anything.

### GGUF quant sizes (pack's own measurements, RTX 3090, same prompt/seed)

| quant | DiT file | peak VRAM w/ 4-bit Gemma |
|---|---|---|
| bf16 | 6.6 GB | 16.6 GB |
| **Q8_0** (near-lossless, recommended) | **3.5 GB** | **13.5 GB** |
| Q5_0 | ~2.3 GB | lower |
| Q4_0 | ~1.9 GB | lower |

K-quants (Q4_K/Q5_K/Q6_K) can be **read** by the loader but not produced in pure Python --
convert to F16 here, then `llama-quantize`.

### 🔴 DRAMABOX IS TAGGED **ENGLISH**, AND IT DOES NOT REPLACE THE MULTILINGUAL ARM

`huggingface.co/ResembleAI/Dramabox` carries the **`English`** language tag, every example on the
model card is English, and the card makes **no multilingual claim anywhere**. Nothing states an
English-only limitation either -- it simply never addresses the question.

**Consequence for this card, and it narrows the whole re-opening:** the 2026-08-27 LANGUAGE finding
is untouched. Non-English still goes through `chatterbox_multilingual`; DramaBox cannot take that
job. DramaBox is an **English-EXPRESSIVENESS** play only.

That is still the right axis to test -- English expressiveness is precisely where Chatterbox VC is
failing ("VC is very inconsistent, it destroys voices") -- but the goal is narrower than the handoff
framed it. "Do DramaBox + Chatterbox combine into a product" resolves to: DramaBox for performed
ENGLISH, Chatterbox multilingual for everything else, and the VC stage possibly dropped rather than
fixed.

### Upstream's own numbers (HF model card, for contrast with the pack's)

| | upstream card | MelodramaBox measured |
|---|---|---|
| VRAM | **~24 GB peak, warm server** | **13.5 GB** (Q8_0 DiT + 4-bit Gemma, RTX 3090) |
| speed | ~2.5 s / generation on an **H100**, once warm | not measured |

`gen_duration` guidance on the card is *"Set to 20-60 s for music or long scenes"*; no hard maximum
is stated. Watermarking is **on by default** unless explicitly disabled -- which matches the
watermark-always decision already on this card.

The 24 GB is upstream's own always-warm server holding everything resident. It is the number the
rejection table inherited, and it is the number the GGUF route undercuts.

### Weight sizes, read off the HF repo (not inferred)

| file | size |
|---|---|
| `dramabox-dit-v1.safetensors` | **6.58 GB** |
| `dramabox-audio-components.safetensors` | **1.94 GB** |
| repo total | **8.55 GB** |
| + `unsloth/gemma-3-12b-it-bnb-4bit` text encoder | ~8 GB |
| **total to download** | **~16.5 GB** |

Repo is 24 commits, last touched 4 months ago (matches the "stale since 2026-05-23" line), 318
likes, 9 community threads, licence `ltx-2-community`.

### NOT YET ANSWERED

- Which pack to adopt. MelodramaBox is the recommendation on the evidence above; the dead
  GitHub repo is the one real argument against it.
- Nothing has been generated. Every quality claim here is upstream's or the pack's own -- **no
  DramaBox audio has been heard by anyone on this card yet.**
