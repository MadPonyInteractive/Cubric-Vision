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
