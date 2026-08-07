# ComfyUI injection — multi-stage video workflows

> **AI INSTRUCTION:** Read [comfy_injection.md](comfy_injection.md) first for how injection
> works at all (title map, silent-skip trap, LoRA slots, standalone injectors). Read THIS
> file when touching `t2v_ms` / `i2v_ms`, the preview → Continue/Finish flow, or the
> `MpiStageLatents` node.

## What multi-stage means

An `_ms` op runs a cheap low-res **preview** pass, then a **final** pass that resumes from
the preview's saved latent. The user drives it with the "Preview initial stage" toggle in
PromptBox; the preview lands as a gallery card with Continue/Finish buttons.

**It is per-MODEL, not per-op.** The `_ms` op keys are shared, so the flow is gated by
`model.capabilities`:

| Model | `_ms` ops | `multiStage` | `branchingContinue` |
|---|---|---|---|
| `wan-22` | `i2v_ms` | yes | **yes** — Continue (branch) button; per-stage LoRAs may differ |
| `ltx-23` / `ltx-23-balanced` | `t2v_ms`, `i2v_ms` | yes | no — **Finish only** |
| `minimax-h3` | `t2v_ms`, `i2v_ms` | yes | no — **Finish only** |
| `wan22-5b` | — | no | no |

`branchingContinue` omitted → Finish-only, because those graphs lock stage 2 to stage 1's
conditioning: a re-prompted branch would not honour the new prompt. Gate helper:
`commandAllowsBranchingContinue(key, model)` in `commandRegistry.js`.

## ONE graph carries both stages

Every multi-stage model declares `capabilities.singleFileStages: true`, which stops
`resolveWorkflowFile` appending a `_stage2` suffix. **There is no `_stage2` file anywhere,
and adding one is a bug** — the resolver would name a file that must not exist and Finish
404s.

Both passes live in one graph, gated by **`MpiStageLatents`** — a single node, titled
`Input_Video_Latent`, that owns the save/load/gate cluster:

| Widget | Written by | Meaning |
|---|---|---|
| `is_preview` | app, per run | `true` halts at the preview pass |
| `is_continue` | app, per run | `true` resumes from `load_path` instead of sampling stage 1 |
| `load_path` | app, per run | which latent stage 2 reads |
| `save_path` | **baked, never injected** | where stage 1 writes; app collects it from `ui.latents` |

It also takes `latent` / `denoised` **links** from the sampler — see the wired-input trap
below.

This works because `MpiBlocker` and `MpiSaveLatent.enabled` are **lazy** inputs: a gated
sampler genuinely does not execute, rather than executing and having its output discarded.

## Authoring contract

A multi-stage graph MUST contain:

- One **`MpiStageLatents`** titled exactly `Input_Video_Latent`. Rename it and both stages
  silently run stage 1 — no error anywhere.
- A capture node titled **`Output_Preview`** — the preview clip, written on an
  `is_preview: true` run.
- A capture node titled **`Output_Video`** — the final clip.

Shipped examples: `ltx_i2v_t2v.json`, `ltx_i2v_t2v_int8.json`, `minimax_h3_fl2va.json`,
`wan22_i2v.json`. A single-stage video graph (`wan5b_t2v.json`) has `Output_Video` only.

`commandExecutor` picks the capture title per run: `previewOnly` + a multi-stage op →
`output_preview`, otherwise `output_video`. No `Output_Audio` on a preview — it is a
throwaway clip; audio rides the final `Output_Video` only.

## What the app injects per run

`_buildParams` ([`commandExecutor.js:661`](../../js/services/commandExecutor.js#L661)), for
multi-stage ops only:

```
Video_Latent.is_preview   = historyMode ? false : previewOnly
Video_Latent.is_continue  = isStage2
Video_Latent.load_path    = payload.loadLatentName || 'ComfyUI_00001_.latent'
Input_Video_Latent        = same name (plain-title form)
```

The dotted `Title.widget` form is required because these are WIDGETS — a plain title spray
would write one value into every recognised key on the node.

`historyMode` (the video-history workspace) forces `is_preview` false regardless of the
toggle, so re-generating from history never produces a preview card.

**Nothing is staged before a stage-1 run.** No placeholder latents, no defaults, no
`input/` folder — a new model ships no latent files. Stage 2 is different: see below.

## Preview → Continue / Finish

Before dispatching, `MpiGalleryBlock` calls `validatePreviewAssets(itemId)` →
`GET /project-media/:projectId/validate-preview-assets` (`routes/projects.js`), which stats
the project latent (`Media/.latents/<id>.latent`) and any i2v snapshots
(`Media/.preview-assets/<id>/<role>.<ext>`) recorded on the sidecar. Three outcomes:

- **`canFastPath`** — latent present. Dispatch stage 2: `POST /comfy/stage-preview-latent`
  copies the latent into the engine `input/` folder, and `load_path` points at it.
- **`canColdFallback`** — latent missing but `frozenParams` and all required snapshots are
  present. Continue reruns stage 1 with `replaceItemId` to rebuild the latent in place, then
  auto-enqueues stage 2 on `gallery:item-updated`. Finish instead runs the whole graph with
  `previewOnly: false` — both passes fuse into one submission.
- **`blocked`** — neither is possible. The card shows a red "Missing" badge and hides
  Continue/Finish; deleting the preview cleans `.latents/<id>.latent` +
  `.preview-assets/<id>/`.

T2V previews carry no snapshots, so only latent state gates them.

`frozenParams` snapshots the determinism-critical inputs at preview time (seed, prompt,
dims, the full `injectionParams` map, media items) so the final matches the preview's
intent — see [docs/project-integrity.md](../../docs/project-integrity.md).

Engine `input/` copies are not cleaned per run. `cleanComfyUITempFiles` empties `input/` and
`output/` on app exit (SIGTERM/SIGINT, `server.js`). Mid-session bloat is bounded by uuid
uniqueness — one staged latent per preview, overwritten on rerun.

## Traps

**A param whose title matches no node is skipped SILENTLY.** This is the failure mode
behind every bug in this file's history: no error, no warning, the graph just runs its baked
default. When preview produces a full video instead of stopping, check in order — (1) the
graph has an `MpiStageLatents` titled exactly `Input_Video_Latent`; (2) the dispatched graph
really carries `is_preview: true`, read off the engine's `/history` rather than inferred
from the run finishing; (3) `historyMode` is not forcing it false.

**Never overwrite a wired input.** `MpiStageLatents` carries both `latent`/`denoised` links
and injectable widgets under ONE title. Injection targets widgets only; writing a scalar
over a link hands the node a filename where it expected upstream data and it dies on
`string indices must be integers`. `comfyController._inject` guards this — do not bypass it.

**`MpiString` = a media PATH. `MpiText` = plain text/data. Choosing wrong breaks REMOTE
ONLY.** `PATH_MEDIA_CLASSES` in `comfyController` holds `MpiLoadImageFromPath`,
`MpiLoadAudio`, `MpiLoadVideo`, `VHS_LoadVideoPath` **and `MpiString`** — so any param whose
same-titled node is an `MpiString` is classified `imagepath`, pushed through
`_resolveMediaPath()` and, on a remote engine, `_uploadRemoteMedia()`. Aim a param carrying
non-path data (JSON, a number, a prompt fragment) at an `MpiString` and the Pod tries to
upload a file named after that data. **Locally it passes** — nothing uploads — so a green
local test proves nothing. `MpiText` subclasses `MpiString` in the node source but is a
distinct `class_type` and is NOT in the set, so switching is a one-word change in the raw
graph (also fix `Node name for S&R` and the output name → `Text`). Precedent both ways in
`klein_t2i.json`: `MpiText` for `Input_Positive`/`Input_Negative`, `MpiString` for
`Input_Mask`/`Input_Image_2`. Data case: SAM3's `Input_Points_*` in `img_auto_mask.json`,
guarded by `tests/auto-mask-inject-titles.test.cjs`.

**Media inputs need no placeholders.** Image/mask/video/audio params are path-reading
loaders that self-gate on an empty string (`ExecutionBlocker`), so an unused optional slot
rejects nothing. Full contract:
[docs/workflow-authoring/media-inputs.md](../../docs/workflow-authoring/media-inputs.md).

**Re-running an UNCHANGED multi-stage graph always re-runs stage 2. Expected — do not
chase it, and do NOT "fix" it with `IS_CHANGED`.** Measured on the bench 2026-08-07 with a
byte-identical re-dispatch (H3 ref2va, 53 nodes): 41 cached, and the 12 misses were
`MpiStageLatents` plus its entire downstream closure — stage-2 sampler, both VAE decodes,
both audio decodes, both VideoCombines, `Output_Preview`/`Output_Video`, both
`MpiClearVram`. Nothing UPSTREAM of the node missed, which is what identifies it as the
origin rather than a victim.

`OUTPUT_NODE` is not the reason: the nine `MpiLoadImageFromPath` nodes in the same graph are
also `OUTPUT_NODE` and cached fine. The node reads its latent back from a FILE, which is
what breaks the signature.

Two consequences worth keeping:
- **`IS_CHANGED` cannot help.** `execution.py` treats the ABSENCE of `IS_CHANGED` /
  `fingerprint_inputs` as "not changed" (`self.is_changed[node_id] = False`), so adding one
  can only ever make caching worse. A future session must not try it as a fix.
- **It cannot reach the app.** Every app generation injects a fresh `Input_Seed`, so the
  dispatched graph never repeats and the cache is never consulted for this. The cost is
  bench time while authoring, nothing else.

## One latent per preview

A preview saves exactly ONE latent — `MpiStageLatents` packs video and audio into a single
file. There is no separate audio latent anywhere: not in a graph, not in `previewAssets`,
not in the delete sweep, not on the wire.
