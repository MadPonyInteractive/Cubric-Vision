# Upscale Video (`ltx-upscale`) — the second surface of one capability

> The Flow half of the LTX Video upscaler. The **plugin** half — an entry in the History
> workspace's video Upscale dropdown — shipped first (MPI-579). One graph, one op, one
> injector, two surfaces. MPI-584.

## Shape

| | |
|---|---|
| id / title | `ltx-upscale` / **Upscale Video** |
| requiredModels | `['ltx-23-balanced']` — the graph bakes the **int8** transformer, so the High tier's bf16 weight cannot run it |
| requiredDeps | **absent.** It owns no weight: `ltx23-spatial-upscaler` is already in both LTX tiers' `dependencies` |
| operation | `ltxVideoUpscale` — **reused**, not new. Universal, `injector: 'ltxSigmas'` |
| workflow | `ltx_video_upscale.json` (29 nodes) — **reused** |
| inputs | one video slot, role **`inputVideo`**; 3 run-slide fields; no steps |
| output | `video`, 2x the source's /32 fit, **audio passed through** |
| result | `result: { compare: 'inputVideo' }` — the first consumer of the shared before/after surface (MPI-585) |

Because the op, the graph, the injector and both registry mappings already existed, this
Flow is **one FlowDef plus one test case**. No op registration, no `appVersionIntroduced`,
no version bump.

## The role name is the op's, not the flow family's

Sibling flows use `roles: ['video1']` because their ops declare `video1`. This op predates
them and is shared with the plugin, where the key is **`inputVideo`**. The slot role must
match the op's `mediaInputs` key, so the flow bends to the op — not the other way round.
(A type-match fallback would have covered it silently; matching by role keeps the failure
mode loud if the op is ever re-keyed.)

## The fields are the plugin's, verbatim

The three declarations are copied from `pluginsRegistry.js` → `upscale.fields`. Keep them
identical: two surfaces of one capability with different defaults is a bug nobody will
report as one. Both ranges were measured and closed by Fabio on 2026-08-19 (MPI-568):

| field | UI | maps to | default |
|---|---|---|---|
| `positive` | text, 3 rows | `Input_Positive` | **empty** — a default prompt ordered the very artifact the pipeline removes (freckles rendered as moles) |
| `Input_Denoise` | slider 0–1 | start sigma **0.50–0.85** via `mapTo`, then the whole schedule via `ltxSigmasInjector` | 0.5 → sigma 0.675 |
| `Input_Prompt_Strength` | slider 0–1 | cfg **1–3** via `mapTo` | 0 → cfg 1, the **no-guidance** end, on purpose |

`Input_Denoise` names no node. `ltxSigmasInjector` consumes it
(`LTX_SIGMAS_CONSUMES`) and writes `Input_Sigmas`, which is why the title test pins
`input_sigmas` and not `input_denoise`.

## The result is shown against its source

An upscale improves footage the user already had, so the result pane declares a comparison
(`result: { compare: 'inputVideo' }`) rather than painting a lone `<video>`: source left,
upscaled right, draggable reveal bar, both clips frame-locked. The role names which INPUT is
the "before" — one line, no flow code, and the same surface the History workspace uses on two
selected entries. Contract: [04](../04-overlay-and-shell.md) § The result pane.

The 2x output and its 1x source are **different resolutions on purpose**, and that is handled:
`MpiCanvas._drawComparisonLayer` cover-fits the after into the before's frame, so the reveal bar
crosses one picture rather than two mismatched ones.

## No middle step, unlike extend and foley

Both siblings put their prompt on a `preview` step so the user judges the clip while
describing it. Here the prompt is optional and secondary — an upscale is a fidelity job —
so there is nothing the user must watch the clip to write. All three fields sit on the run
slide.

## THE OPEN RISK: no frame or resolution cap

Measured on a 16380 MB card (MPI-579 validation § Phase 5): **12752 MB at 25 frames,
14721 MB at 73**. The ceiling is real, it grows with length, and a failure is a ComfyUI OOM
minutes deep.

Nothing caps it, and a cap is **not** a small addition: the graph's only `Input_*` nodes are
positive / video / sigmas / prompt_strength / seed, so capping needs a new node plus a
control — its own card. Until then the flow's `description` carries the warning
("Short clips first…"). `LTXVEmptyLatentAudio.frames_number` caps a pass at 993 frames
(8n+1), far above what VRAM allows, so that is not the binding constraint.
