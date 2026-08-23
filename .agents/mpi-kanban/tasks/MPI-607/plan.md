# TTS in Vision: resolve Qwen3-TTS viability, then wire Chatterbox + Qwen as Flows

## Current State

Project mode: scalable-foundation.

Research session 2026-08-22/23 evaluated Chatterbox, Qwen3-TTS, DramaBox and VibeVoice.
Nothing in the Vision repo was edited. All changes so far are on the standalone bench
(`G:\ComfyUi`, port 8188) and in a session scratchpad.

**Model verdicts.**

| Model | Licence | Verdict |
|---|---|---|
| Chatterbox | MIT | Ship first. Clone-only, ~8 light deps, no transformers move, 1.97M HF dl/30d |
| Qwen3-TTS | Apache-2.0 | Only model that DESIGNS a voice from text. Blocked, see below |
| DramaBox | LTX-2 Community | Rejected: 240 HF dl/30d, stale since 2026-05-23, 24GB VRAM, no weight sharing |
| VibeVoice | MIT | Only NATIVE multi-speaker (4 spk / 90 min), but hard-excludes transformers 5 |

**The Qwen blocker.** `qwen-tts` pins `transformers==4.57.3`; Vision's engine is on
`transformers==5.13.0` (`dev_configs/python_deps.txt`). Three 4->5 breaks were found and
fixed on the bench clone (`2 files changed, 47 insertions(+), 3 deletions(-)`):

1. `check_model_inputs()` -> decorator factory in 4.x, plain decorator in 5.x
2. `config.pad_token_id` -> `PretrainedConfig` dropped pad/bos/eos token ids in 5.x
3. `ROPE_INIT_FUNCTIONS["default"]` -> removed in 5.x along with `_compute_default_rope_parameters`

After those, model classes construct cleanly on 5.13. **But loading is not generating.**
Upstream PR #201 (closed unmerged) patched the same rope break, then measured
**67-99% silence** on transformers 5.x and concluded API patches cannot fix it. Parts of
that write-up reason sloppily (it claims a KeyError causes a silent fallback, which is
not how KeyError works), so it is a strong signal, not proof. It is cheap to settle.

**Dependency facts (proven, not assumed).** Vision installs one curated lock in a single
`--no-deps` pass, so a node's `requirements.txt` is never read -- but `uv pip compile`
DOES resolve the closure, so adding `qwen-tts` to `python_deps.in` fails the compile
loudly. Leaf deps compile clean with zero movement in numpy/transformers:
`librosa soundfile soxr sox s3tokenizer conformer pyloudnorm resemble-perth`.
`sox` is required (pysox, imported at module level by the 25Hz tokenizer) -- an earlier
session note wrongly dismissed it.

**Watermarking.** Fabio wants Perth ON (his position: AI video should be labelled).
Perth is MIT, resolves from PyPI at 1.0.1, and applies to any wav -- so one MpiNode can
stamp both engines' output uniformly. Qwen has no watermarker of its own.

**Multi-speaker is a Flow feature, not a model feature.** `FL_ChatterboxDialogTTS` is a
196-line Python loop over `SPEAKER A:`-prefixed lines calling `tts.generate()` per line.
Its per-speaker stems (silence-padded, time-aligned) are the right shape for a video
timeline and worth keeping. Its limits: 4 hardcoded branches, exact case-sensitive
prefixes that `continue` silently on a mismatch, butt-joined clips with no inter-turn
pause, and a `keep_model_loaded` param that is never referenced in the body.
Per-speaker/per-line emotion IS possible -- `generate()` takes
`exaggeration`/`cfg_weight`/`temperature` per call; filliptm just did not expose them.

**Bench state (ready to test).** ComfyUI 0.31.0 matches `node_lock.json`. Bumped to the
engine's pins: `transformers 5.13.0`, `timm 1.0.28`, `huggingface-hub 1.26.0`
(rollback line in the session scratchpad). Installed + verified building:
`custom_nodes/ComfyUI-QwenTTS` (1038lab, patched) and `custom_nodes/ComfyUI_Fill-ChatterBox`
(filliptm, unmodified). Three workflows staged in `user/default/workflows/`:
`TTS_Chatterbox_all-nodes.json`, `TTS_Qwen3_voice-design.json`, `TTS_Qwen3_voice-clone.json`.
No weights downloaded yet. A ComfyUI-Manager update to the Qwen pack reverts the patches.

## Implementation

- [ ] Settle Qwen viability, then wire the TTS foundation down the branch it selects.
      **Verify:** a real generation from each shipped engine, with the Qwen output's
      silence ratio measured numerically rather than judged by ear.

## Completed

- [ ] Nothing yet.

## Remaining Work

- **Step 1 (blocking).** Restart the bench, run `TTS_Qwen3_voice-design.json`, measure the
  silence ratio of the output. Use `volumedetect`, not `ebur128` -- integrated LUFS reports
  the -70 floor on clips under ~10s (memory `tool_measure_generated_audio`). Everything
  below depends on this number.
- **Step 2, branch A (Qwen produces speech).** Vendor `qwen_tts/` from `QwenLM/Qwen3-TTS`
  (Apache-2.0, NOT from 1038lab/GPL-3.0 or flybirdxx/unlicensed) into `ComfyUi-MpiNodes`
  via `/mpi-nodes-sync`, carrying the 3 patches. Add the leaf deps to
  `dev_configs/python_deps.in`, run `node scripts/compile-node-deps.mjs`, commit both files.
- **Step 2, branch B (Qwen produces silence).** Do not vendor. Either run Qwen in an
  isolated `transformers==4.57.3` runtime out-of-process (the TTS-Audio-Suite pattern:
  "Legacy Transformers 4 engines use isolated runtimes"), or drop Qwen and cover both
  Flows with Chatterbox cloning plus a voice-reference library (see open question below).
- **Step 3.** Ship Chatterbox first regardless of the branch -- it is unblocked today.
  Build the dialogue splitter as an MpiNode rather than reusing `FL_ChatterboxDialogTTS`:
  speaker count as a parameter not 4 branches, warn instead of silently dropping an
  unmatched line, inter-turn pause, per-speaker and per-line emotion, keep the stems.
- **Step 4.** Flow A UI: `MpiRadioGroup` for short enumerations (gender, age band, emotion),
  `MpiDropdown` for longer ones (accent, texture), composing into the prompt string, plus a
  raw prompt box. Qwen's "Voice Instruct" node is only a prompt builder -- its output is
  plain text (`gender / age / pitch / speed / volume / clarity / fluency / accent /
  texture / emotion / tone / personality / style note`), so the same vocabulary serves both.
- **Step 5.** Add the probe scripts to the bump-engine checklist. `layer_type_validation`
  is scheduled for removal in transformers **v5.20** and `rope_config_validation` already
  warns as removed, so the 1.6 ComfyUI bump can break Qwen again at new call sites.

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux

Audio quality is a human judgement -- Fabio must hear the output. The silence ratio is
measured numerically, but "is this a usable voice" is not. Both Flows also have a UI
surface he must exercise in the running app.

## Preservation Notes

- **Open question, worth resolving before Step 2 branch B:** downloadable voice-reference
  libraries. If users can browse and fetch reference clips, Flow A becomes browse-and-fetch
  rather than generation, cloning covers everything, and Qwen becomes optional -- which
  would retire the whole transformers 4-vs-5 problem. Fabio's specific idea (2026-08-23):
  RVC hubs (weights.gg, voice-models.com) are enormous and every entry ships a PREVIEW
  clip you can play. The `.pth` voice-conversion model is irrelevant to us; the preview
  audio IS the clone reference Chatterbox wants. Three things to check, in order:
  1. **Licensing/consent** -- the deciding constraint. Much of that catalogue is cloned
     celebrity and character voices with neither consent nor redistribution rights, which
     sits badly beside Vision's watermarking stance. A permissive corpus route exists as
     the fallback (LibriVox, Mozilla Common Voice, VCTK, LJSpeech) -- real clips, licensed
     for exactly this, no consent exposure.
  2. **Download capability / API** -- whether previews are fetchable per site, or only
     streamed behind a player.
  3. **Clip suitability** -- Chatterbox wants ~10s clean single-speaker audio; a preview
     with music or effects under it is a bad reference.
- Session scratchpad holds the reusable probes: `probe_qwen_transformers.py` (symbol
  surface), `probe_qwen_build.py` (class bodies via stubs), `probe_qwen_construct.py`
  (model __init__ paths), `verify_bench_packs.py`, `validate_staged_workflows.py`,
  `patch_rope_default.py`, plus `bench_freeze_before.txt` / `bench_rollback.txt`.
  Copy anything worth keeping into the repo before the scratchpad is lost.
- On close-out: `docs/README.md` needs a TTS subsystem doc route, and the transformers
  4-vs-5 finding belongs in `.claude/rules/comfy_engine.md` or the new doc -- not in memory
  (it is codebase knowledge).
