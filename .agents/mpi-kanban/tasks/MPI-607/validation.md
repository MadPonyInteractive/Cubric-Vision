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
