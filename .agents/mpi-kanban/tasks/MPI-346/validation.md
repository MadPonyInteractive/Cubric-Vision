# MPI-346 — validation

## Status: PARTIAL — app-level verification still pending

## Verified

**Node pin.** `dev_configs/node_lock.json` -> `223a9383`. Archive resolves and downloads
(46,276 bytes), `pyproject.toml` reports `version = "1.2.2"`. Both ComfyUI installs on this
machine confirmed on v1.2.2:
- `G:\ComfyUi\ComfyUI\custom_nodes\comfyui-krea2edit` — installed this session (was v1.1,
  a 10,277-byte `__init__.py`; now 23,320 bytes). Old file backed up to the session scratchpad.
- `engine\ComfyUI_windows_portable\ComfyUI\custom_nodes\comfyui-krea2edit` — already v1.2.2
  since 2026-07-20.

**Live schema gate.** `/object_info/Krea2EditModelPatch` on the restarted bench (PID 40140,
started 07:55:55) exposes all seven new optional inputs: `fit_mode`, `ref_boost`,
`ref_boost_a`, `ref_boost_mask`, `source_image`, `source_image_b`, `vae`. The sync was run
only after this returned green — converting against the stale v1.1 schema would have
silently mis-mapped the new widget values. See [[tool_comfy_schema_gate_before_workflow_sync]].

**Conversion + bake.** `sync-raw-workflows.mjs` -> `validate-injection-rules.mjs` passed both
files; `orchestrate.py` rebuilt both Krea2 cards at 104 nodes with 10 style LoRAs. Baked
runtime asserted directly:

| check | sfw | nsfw |
|---|---|---|
| dangling links | 0 | 0 |
| `UNETLoader` | `krea2_raw_int8_convrot` | `lustify-v10-krea-raw-int8_convrot` |
| `299`/`300` `grounding_px` | 1024 | 1024 |
| `306` (two-ref) | `ref_boost` 1, `ref_boost_a` 1, `fit` | same |
| `408` (one-ref) | `ref_boost` 4, `ref_boost_a` 1, `fit` | same |
| `vae` + `source_image` | wired on both patch nodes | same |

Variant substitution, tier scrub (2 -> 1), prompt scrub and seed scrub all fired as expected.

**Injection contract unchanged.** `Input_`/`Output_` title sets diffed old vs new runtime:
krea2 34 -> 34, describer 2 -> 2, nothing added or removed. No `commandRegistry` /
`operationRegistry` drift, so no version-registry work is implied.

**Describer scaffold.** Survived the round-trip intact — opens `<|im_start|>system`, closes
`<|im_start|>assistant\n`, exactly one `<|image_pad|>` inside the user turn, three turns
total. Bypassed bench nodes (45/46/47) dropped by the converter as designed.

**User bench testing.** Every Krea2 operation exercised in the ComfyUI node graph. Text-to-image
was initially BLOCKED — `Input_Image` (`MpiLoadImageFromPath`) had `block_if_empty: True`, so a
t2i run, which supplies no image, could never execute past that node. Turned off in the same
pass (`96980f88`); t2i then confirmed working in the browser, and image edit confirmed working.

> Trade-off accepted with that flag: an empty path now yields a blank image instead of halting,
> so a genuinely missing image on an EDIT run degrades to a black reference rather than
> erroring. The graph's `Input_Is_i2i` / `Input_Is_Edit` gates decide whether the branch runs
> at all, so this is contained.

**Export hazard hit twice, both caught before baking.** Two consecutive exports of this
template were serialized against the STALE v1.1 node schema and silently dropped the new
widget values — first run lost `ref_boost`, `ref_boost_a`, `fit_mode` and `system_prompt`
outright; second run restored the widgets but at DEFAULTS, so `408`'s `ref_boost` came back
as 1 instead of 4. Cause both times was the ComfyUI browser tab restoring its own cached copy
of the graph rather than the file on disk — not a stale install (both ComfyUI installs were
confirmed on v1.2.2). Caught by diffing `raw/` against HEAD BEFORE running the sync. Standing
lesson: diff the raw source, do not trust a green schema gate alone — the gate proves the
SERVER is current, not that the exporting TAB was.
See [[tool_comfy_schema_gate_before_workflow_sync]].

## NOT verified

- **App-level generation on any operation.** Nothing has been run through Cubric Vision
  itself. The injection surface is provably unchanged (34 -> 34), which is why the user judged
  the risk low, but "unchanged contract" is not the same as "ran green in the app".
- **`fit_mode: 'fit'` output effect.** It is genuinely active for the first time (both `vae`
  and `source_image` are connected, so it no longer warns and falls back). Reference geometry
  changes; nobody has compared before/after.
- **`ref_boost` 4 output effect.** Measured good on the bench, but the edit test above ran on
  a tab whose graph had been reset to the default `ref_boost` 1, so the shipped value has not
  actually been exercised end-to-end.
- **The describer's first-word behaviour end-to-end** — the entire point of the new recipe is
  that it no longer opens with "The image shows"; confirm on a real describe run.
- **Remote (RunPod) engine.** The `.mpi_node_commit` drift ladder should reinstall the node at
  the new commit on connect. Untested this session.

## Next action

Run one Krea2 edit and one describe through the app. If both land, this card can close.
