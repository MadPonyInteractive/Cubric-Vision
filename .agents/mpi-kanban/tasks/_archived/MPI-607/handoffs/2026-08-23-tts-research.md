# Handoff — MPI-607 TTS research session (2026-08-22 → 2026-08-23)

Written at close of the research session that produced the card. **Nothing in the Vision
repo was implemented.** Read `../plan.md` first — it carries the full findings. This file
only adds what the plan does not: the resume prompt, and the exact state of the bench.

---

## Resume prompt (paste into the fresh session)

> You are picking up **MPI-607** in Cubric Vision (`c:/AI/Mpi/Cubric-Vision`, branch
> `master`). Read `.agents/mpi-kanban/tasks/MPI-607/plan.md` and this handoff, then run
> `mpi-continue MPI-607`.
>
> The card is in **To do**; `mpi-continue` must move it to Doing and derive a checklist
> before any file edit. No Vision repo file has been touched yet — every change so far is
> on the standalone bench (`G:\ComfyUi`, port 8188) and in a session scratchpad that is
> now gone.
>
> **Step 1 is blocking and is a measurement, not a build.** Start the bench, load
> `TTS_Qwen3_voice-design.json`, generate once, and measure the silence ratio of the
> output with ffmpeg `volumedetect` — NOT `ebur128`, which reports the -70 dB floor on
> clips under ~10s and will read a perfectly audible clip as silent. Upstream PR #201
> measured 67-99% silence for Qwen3-TTS on transformers 5.x after applying the same three
> patches this session applied, and concluded API patches cannot fix it. That claim is a
> strong signal but NOT proof — parts of its reasoning are wrong — so settle it with the
> number, then take the branch the plan names. Do not vendor anything before that number
> exists.
>
> Weights are not downloaded; first run of each node pulls them (Qwen 1.7B ≈ 3.5GB,
> Chatterbox ≈ 1GB). Chatterbox is unblocked regardless of the Qwen result and can ship
> first.

---

## Bench state — `G:\ComfyUi`, port 8188

The bench is the ONLY thing this session mutated. ComfyUI core is `0.31.0`, which matches
`dev_configs/node_lock.json`, so no Comfy bump is needed.

**Python packages changed** (bumped to match `dev_configs/python_deps.txt`):

| Package | Was | Now |
|---|---|---|
| `transformers` | 5.9.0 | **5.13.0** |
| `timm` | 1.0.27 | 1.0.28 |
| `huggingface-hub` | 1.17.0 | 1.26.0 |

**Installed** (leaf deps; verified to move nothing engine-owned):
`librosa soundfile soxr sox s3tokenizer conformer pyloudnorm resemble-perth
openai-whisper tiktoken sentencepiece resampy omegaconf`

Rollback, if the bench ever needs to go back:

```
G:/ComfyUi/python_embeded/python.exe -m pip install transformers==5.9.0 timm==1.0.27 huggingface-hub==1.17.0
```

**Node packs cloned into `custom_nodes/`:**

- `ComfyUI_Fill-ChatterBox` (filliptm) — unmodified, builds clean
- `ComfyUI-QwenTTS` (1038lab) — **patched**, `2 files changed, 47 insertions(+), 3 deletions(-)`

The three Qwen patches, all in `qwen_tts/core/`:

1. `tokenizer_12hz/modeling_qwen3_tts_tokenizer_v2.py:498` — `@check_model_inputs()` → `@check_model_inputs`
2. `models/modeling_qwen3_tts.py:1022,1434` — `config.pad_token_id` → `getattr(config, "pad_token_id", None)`
3. `models/modeling_qwen3_tts.py` + `tokenizer_12hz/modeling_qwen3_tts_tokenizer_v2.py` —
   re-register `ROPE_INIT_FUNCTIONS["default"]`, inserted after the last top-level import
   (NOT before the first class — that splits a decorator from its class and is a SyntaxError)

> **A ComfyUI-Manager update to `ComfyUI-QwenTTS` reverts all three and Qwen breaks again**
> with `TypeError: check_model_inputs() missing 1 required positional argument: 'func'`.
> `git -C G:/ComfyUi/ComfyUI/custom_nodes/ComfyUI-QwenTTS diff` shows the current patch set.

**Workflows staged** in `ComfyUI/user/default/workflows/` — all node types verified to
resolve, so no red nodes on load:

- `TTS_Chatterbox_all-nodes.json` — includes `FL_ChatterboxDialogTTS`
- `TTS_Qwen3_voice-design.json` — Step 1's test graph
- `TTS_Qwen3_voice-clone.json`

---

## Verified facts worth not re-deriving

- Vision installs its curated lock in ONE `--no-deps` pass, so a node's `requirements.txt`
  is never read — but `uv pip compile` DOES resolve the closure. Adding `qwen-tts` to
  `python_deps.in` fails the compile loudly (proven), so the package can never be a lock
  line; only vendored source or an isolated runtime works.
- All 36 transformers symbols `qwen_tts` imports still resolve on 5.13.0. The `==4.57.3`
  pin is conservative at import level; the breaks are elsewhere.
- No fork solves this. 100 forks of `QwenLM/Qwen3-TTS`, all 0 stars. PR #201 closed
  unmerged, PR #157 open since June, issues #156/#237 closed unresolved — upstream is
  unresponsive, so a PR is not a path.
- `sox` (pysox) IS required — imported at module level by the 25Hz tokenizer. An earlier
  note in this session wrongly dismissed it.
- Chatterbox's `FL_ChatterboxDialogTTS` is a Python loop, not native multi-speaker.
  Per-speaker and per-line emotion ARE available (`generate()` takes them per call).

## Decisions already made by the user

- **Watermarking ON.** Fabio's position: AI video should be labelled. Perth is MIT and
  applies to any wav, so one MpiNode can stamp both engines.
- **DramaBox rejected**, VibeVoice parked (hard-excludes transformers 5).
- **Vendoring, not forking** — if and only if Step 1 says Qwen produces real audio.
- Flow A UI should be guided dropdowns/radios composing the prompt string, plus a raw box.
