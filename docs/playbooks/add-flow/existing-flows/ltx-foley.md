# Add Foley (LTX 2.3 v2v)

> Give a silent clip a soundtrack: a source video in, the SAME pixels out with generated
> foley across the whole clip. Card: **MPI-536** (member of the **MPI-552** v2v trio).
> **SHIPPED as a Flow** 2026-08-14 — no `ModelDef`, no `supportedOps`, but unlike its
> siblings it DOES add a weight (see § The LoRA).
>
> Authored from [ltx-extend.md](ltx-extend.md)'s shape: declared `controls`, no
> `uiComponent`. The two flows are twins with one deliberate inversion — resolution.

## Status

| Item | State | Notes |
|---|---|---|
| Bench graph | **PROVEN** before this card | 53 nodes, user-approved by ear (cfg 3.0, mean -33.2 dB) |
| LoRA on R2 | **DONE** 2026-08-14 | 216.21MB, public HEAD 200, exact byte length |
| Dep entry | **DONE** | `ltx23-lora-foley` → `ltx-23-balanced` only |
| Workflow synced | **DONE** 2026-08-14 | `raw/flow_ltx_foley.json` → `comfy_workflows/flow_ltx_foley.json`, 53 API nodes, injection-rules gate clean |
| Op + descriptor | **DONE** | `flowLtxFoley` in the 4 op files; `ltx-foley` in `flowsRegistry.js` |
| Render + payload | **VERIFIED** 2026-08-14 | Isolated app: both controls render, payload correct, reopen restores (§ Verification) |
| Real generation | **NOT RUN by the agent** | The playbook's live-run gate is the user's |
| Voice mode | **NOT SHIPPED** | § Foley only, and why |

## Shape

- **Model:** `ltx-23-balanced` only — the proven graph's `UNETLoader` bakes
  `...int8_convrot.safetensors`, same reason as extend.
- **Input:** one video slot (`video1` → `Input_Video`, `MpiLoadVideo`, path-reading + self-gating).
- **Output:** `mediaType: 'video'`; one capture, `Output_Video` (`use_audio: true`).
- **Steps:** none — nothing is marked on the clip, so it is a 2-step carousel (supply → run).

## The LoRA — the one thing extend did not need

`Foley_Lora#100` loads `ltx-2.3\ltx-2.3-22b-lora-foley-v2a-1.0.safetensors`, which was not a
dep. It is now `ltx23-lora-foley` in `loraDeps.js`, staged to R2 (216.21MB, sha256
`1bc16020…`).

- **On `ltx-23-balanced` ONLY, not both tiers.** The High card cannot run this Flow, so
  listing the weight there would cost those users 216MB for nothing. The three older LTX
  baked LoRAs sit on both tiers because the shipped t2v/i2v graphs load them on both — that
  is not true here, so do not copy their placement.
- **No `mirrorUrl`, deliberately.** The only upstream copy is
  `Lightricks/LTX-2.3-22b-LoRA-Foley-V2A`, a **gated** repo — an anonymous fetch returns
  `401` with `X-Error-Code: GatedRepo`, so a mirror entry would fail every failover it exists
  for. Comfy-Org's `split_files/loras` does not carry this file, and
  `FuzzPuppy/LTX-2.3-Foley-LoRA` is a DIFFERENT community train
  (`ltx-2.3-foley-400-steps.safetensors`) — not a mirror of these bytes.
- The graph's second LoRA (`talk3_ID_Lora#119`) was already `ltx23-lora-talkvid`.

## The controls, and what is deliberately absent

```js
controls: [
  { id: 'positive', type: 'text', rows: 3, label: 'What it should sound like', placeholder: '…' },
  { id: 'negative', type: 'text', rows: 2, label: 'Avoid', default: '<the bench negative>' },
]
```

Both are top-level run inputs — `submitFlowGeneration` reads `inputs.positive` /
`inputs.negative`. There is no `Input_*`-prefixed control here at all, so this flow's payload
carries **no `injectionParams`**, which is the difference from extend.

- **No resolution.** `Input_Width`/`Input_Height` were DELETED from this graph because they
  fed only the encode: `Output_Video.images` comes off the Foley Window off the RAW
  `Input_Video`, so a 1280x704 source returns 1280x704 while the model encodes at 832x480
  (now widgets on `#28 Resize To Target`). **This is the opposite of
  [extend](ltx-extend.md)**, where `#28`'s output IS the delivered clip. Same family,
  opposite call — do not carry either decision across.
- **No duration.** Whole-clip by construction: `#23 clip frames`
  (`floor((a-1)/8)*8+1` off `Input_Video.frame_count`) drives the foley window, the audio
  latent length and the mask end from one place.
- **No seed.** `_buildParams` fills `Input_Seed` per run.
- **No audio-influence knob.** `Audio_Influence#110` reaches the sampler only through
  `#113`'s TRUE branch, whose boolean is `Input_Use_Input_Audio` — i.e. voice mode. In foley
  mode it is dead, and a dead control is worse than a missing one.
- **The negative's default is the bench negative verbatim**, and it only bites because the
  guider runs at `#118 CFGGuider.cfg = 3.0`. At cfg 1, core `CFGGuider` sets
  `uncond_pred = None` (`comfy/samplers.py:610`) and the string is inert — do not "optimise"
  cfg back down.

## Foley only, and why (the decision this card owned)

The same file carries a **voice mode**: a real path in `Input_Audio#106`
(`block_if_empty=true`), the speech terms dropped from `Input_Negative`, and `Foley_Lora#100`
set to `None` so the SFX and ID LoRAs are not stacked. **It has never been run.**

Foley and voice are mutually exclusive settings, so shipping them as two toggles would
present untested configuration as a composable feature. v1 exposes neither switch: the op
declares **no audio slot**, and `Input_Audio` / `Input_Use_Input_Audio` /
`Input_Use_Reference_Audio` stay at their bench defaults. Voice mode becomes a separate Flow
(or a mode picker) once someone has actually run it.

## Known ceiling

**Long clips will OOM and there is no cap yet.** Chunking was considered and rejected — each
chunk re-rolls its own noise, so the ambience jumps at every seam. With resolution gone this
graph has no VRAM lever left, so the fix is a measured length cap with a real user-facing
message, in the app. Not built: the ceiling has not been measured on a target card.

## Verification (2026-08-14, isolated app on its own port + profile)

1. `flow:open` mounts a 2-step carousel with **no** `uiComponent`.
2. The run slide renders both `textarea`s — the negative pre-filled with the bench default.
3. **Payload proof without spending a generation:** type a prompt, then strip
   `state.s_installedModelIds` before clicking Generate. `_run` persists to
   `state.s_flowInputs` BEFORE `submitFlowGeneration`'s availability guard aborts:

   ```json
   { "positive": "boots on gravel, distant traffic, a door creaking open",
     "negative": "music, melody, song, singing, vocals, …" }
   ```

   Engine queue confirmed empty after (`/queue`: 0 running, 0 pending).
4. Reopening the flow restores both.

`tests/inject-params-titles.test.cjs` pins `input_video`, `input_positive`, `input_negative`,
`input_seed` and `output_video` against the workflow. `input_audio` is deliberately NOT
pinned — that node belongs to the unshipped voice mode and nothing addresses it.

## Siblings

[Extend Video](ltx-extend.md) shipped first (no new weight). Lipsync (**MPI-538**) is last and
needs `ltx-2.3-22b-ic-lora-lipdub-0.9.safetensors` staged the same way this LoRA was — check
whether `Lightricks/LTX-2.3-22b-IC-LoRA-DubIt` is gated too before planning a `mirrorUrl`.
