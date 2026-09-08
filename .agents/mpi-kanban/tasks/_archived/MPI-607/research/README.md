# MPI-607 research scripts

Saved out of the 2026-08-22/23 research session scratchpad before it was lost. All were
written against the standalone bench (`G:\ComfyUi`, port 8188) and are run with its
embedded interpreter:

```
G:/ComfyUi/python_embeded/python.exe <script>
```

They are ASCII-only on purpose — the Windows console is cp1252 and a Unicode print dies
with a `charmap` error that reads like a broken script.

| Script | What it answers | Cost |
|---|---|---|
| `probe_qwen_transformers.py` | Do all 36 transformers symbols `qwen_tts` imports still exist? | instant |
| `probe_qwen_build.py` | Do the module bodies execute? Stubs absent audio libs so the failure is never a missing dep | seconds |
| `probe_qwen_construct.py` | Do the model `__init__` paths run? **This is the one that caught the `pad_token_id` and rope breaks** — builds from 1-layer configs, no weights | seconds |
| `verify_bench_packs.py` | Do both installed node packs build with REAL libs, and does Perth watermark a buffer? | seconds |
| `validate_staged_workflows.py` | Will the staged workflows load without red nodes? | instant |
| `patch_rope_default.py` | **Re-applies rope patch #3.** Idempotent — run it after any ComfyUI-Manager update to the Qwen pack | instant |
| `bench_rollback.txt` | The one-line pip command to put the bench back to pre-session versions | — |
| `bench_freeze_before.txt` | Full `pip freeze` of the bench before this session touched it (197 packages) | — |

## Why they exist

Each layer of testing found a break the previous layer could not see:

1. **imports** → `check_model_inputs()` was a decorator factory in transformers 4, a plain
   decorator in 5
2. **class bodies** → nothing new
3. **model `__init__`** → `config.pad_token_id` (dropped from `PretrainedConfig` in 5) and
   `ROPE_INIT_FUNCTIONS["default"]` (removed in 5)
4. **forward pass** → **still untested.** This is where upstream PR #201 reported 67-99%
   silence, and it is the card's blocking Step 1

So a green run of all of these means the model *loads*. It does not mean it *generates*.
Do not let a clean probe run stand in for hearing the audio.

## Reuse beyond this card

`probe_qwen_transformers.py` and `probe_qwen_construct.py` are worth wiring into the
bump-engine checklist. `layer_type_validation` is scheduled for removal in transformers
**v5.20** and `rope_config_validation` already warns as removed, so a future ComfyUI bump
can break Qwen again at call sites none of these currently cover. Both scripts run in
seconds and name the exact symbol that moved.
