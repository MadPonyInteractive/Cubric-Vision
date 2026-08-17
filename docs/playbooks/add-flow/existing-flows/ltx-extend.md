# Extend Video (LTX 2.3 v2v)

> Continue a clip past its last frame: a source video in, the same clip plus newly generated
> seconds — with matching audio — out. Card: **MPI-520** (member of the **MPI-552** v2v trio).
> **SHIPPED as a Flow** 2026-08-14 — no `ModelDef`, no `supportedOps`, no dep entry; it runs
> on the already-installed LTX 2.3 checkpoint.
>
> **This was the first Flow authored with no component at all** (they are all like this now —
> the component surface was removed in MPI-572). Its three controls are declared
> data (`FlowDef.fields`, MPI-531). Adding a JS component here to gain a knob would undo
> that — add the field type instead. Portable UI decisions live in [../ui/](../ui/).

## Status

| Item | State | Notes |
|---|---|---|
| Bench graph | **PROVEN** before this card | 56 nodes, user-approved end to end incl. silent sources + 3s foley |
| Workflow synced | **DONE** 2026-08-14 | `raw/flow_ltx_extend.json` → `comfy_workflows/flow_ltx_extend.json`, 56 API nodes, injection-rules gate clean |
| Op + descriptor | **DONE** | `flowLtxExtend` in the 4 op files; `ltx-extend` in `flowsRegistry.js` |
| Render + payload | **VERIFIED** 2026-08-14 | Live in an isolated app: controls render, values reach the payload, reopen restores them (§ Verification) |
| Real generation | **NOT RUN by the agent** | The playbook's live-run gate is the user's. Nothing about the graph changed, but the app-side dispatch has never produced a clip |
| Resolution control | **DEFERRED** | See § The width/height decision |

## Shape

- **Model:** `ltx-23-balanced` — and only that tier. The proven graph's `UNETLoader` bakes
  `...int8_convrot.safetensors`, so the High card's bf16 weight does not satisfy it. One tier,
  one workflow file. Revisit if the Flow Library leaves the dev gate while a user has only the
  High card (the fix is a generator that bakes a bf16 twin, as `generate_ltx.py` does for the
  model — deliberately not built for a dev-gated surface).
- **Input:** one video slot (`video1` → `Input_Video`, `MpiLoadVideo`, path-reading + self-gating).
- **Output:** `mediaType: 'video'`; one capture, `Output_Video`.
- **Steps:** none. Nothing is marked on the clip, so it is a 2-step carousel (supply → run).

## The controls, and why each is what it is

```js
fields: [
  { id: 'positive', type: 'text', rows: 3, label: 'What happens next', placeholder: '…' },
  { id: 'negative', type: 'text', rows: 2, label: 'Avoid', default: '<the bench negative>' },
  { id: 'Input_Duration', type: 'slider', label: 'Seconds to add', min: 1, max: 10, step: 1, default: 4 },
]
```

- **`positive` / `negative` are top-level run inputs** — `submitFlowGeneration` reads
  `inputs.positive` / `inputs.negative` and the executor writes them to `Input_Positive` /
  `Input_Negative`. The prompt describes the NEW seconds, not the whole clip.
- **The negative's default is the bench negative, on purpose.** Those runs are what "proven"
  means here; an empty box is a different graph.
- **`Input_Duration` is prefixed, so the frame routes it into `injectionParams`** rather than
  the top level — an `Input_*` id names a graph node. It is SECONDS, snapped to whole latent
  frames by the graph itself (`MpiMath floor((a*b+0.5)/8)*8/b`, off the source's own fps), so
  a slider is honest: the value is coarse by construction.
- **No seed control.** `_buildParams` fills `Input_Seed` with a fresh random seed per run.

## The width/height decision (MPI-520's open half)

The card asks for `Input_Width`/`Input_Height` restored as `MpiInt`. They are **not** in the
shipped v1, and the flow is coherent without them: `ImageResizeKJv2` (#28) takes its width and
height from `Input_Video`'s own outputs, so the result matches the source clip's resolution.

Restoring them needs a **bench re-export** (agents never hand-edit a workflow JSON), plus the
card's own warning: a linked widget-input makes ComfyUI ignore the injected widget, so they
must arrive as real `MpiInt` nodes. Until then, "output matches the source" is the contract.

**Do not copy the resolution decision from foley.** There, `Input_Width`/`Input_Height` were
DELETED because they fed only the encode and never the delivered pixels. Here #28's output IS
the delivered clip. Same family, opposite call (`MPI-536` brief § Deliberately NOT exposed).

## Verification (2026-08-14, isolated app on its own port + profile)

1. `flow:open` mounts a 2-step carousel with **no** component — `_flowComponents[undefined]`
   resolves to `null`, which is a supported path, not a hole.
2. The run slide renders all three declared controls: two `textarea`s and a `range` with its
   live readout.
3. **Payload proof without spending a generation:** type a prompt, move the slider to 7, then
   strip `state.s_installedModelIds` before clicking Generate. `_run` persists the collected
   inputs to `state.s_flowInputs` BEFORE `submitFlowGeneration`'s availability guard aborts, so
   the exact payload is readable with nothing queued (engine queue confirmed empty after):

   ```json
   { "positive": "the camera pushes in as she turns to leave",
     "negative": "letterbox, black bars, …",
     "injectionParams": { "Input_Duration": 7 } }
   ```

4. Reopening the flow restores all three — including the slider, which seeds from
   `injectionParams`, not from the top level.

`tests/inject-params-titles.test.cjs` pins `input_video`, `input_positive`, `input_negative`,
`input_seed`, `input_duration` and `output_video` against the workflow — a declared control
whose node is missing would otherwise move the slider, run clean, and silently use the graph's
baked default.

## Siblings

Foley (**MPI-536**) and lipsync (**MPI-538**) are the other two of the trio and each needs a
LoRA staged to R2 first (`ltx-2.3-22b-lora-foley-v2a-1.0`, `ltx-2.3-22b-ic-lora-lipdub-0.9`).
Extend needed none, which is why it shipped first.
