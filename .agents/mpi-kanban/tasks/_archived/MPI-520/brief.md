# MPI-520 — LTX 2.3 v2v extend: wire the proven bench workflow into the app as a Flow

**BLOCKED on MPI-531** (authoring shape). The workflow itself is done and proven;
nothing here is research.

> **Drift note, 2026-08-11.** This card was written as a MODEL op and blocked on
> the 1.4 release. Both are now wrong.
>
> - **The 1.4 blocker is spent.** MPI-450 closed `done complete` at
>   `2026-08-10T19:46:56Z`. It is not what holds this card any more.
> - **The real blocker is MPI-531.** `FlowStepField`
>   (`MpiBaseFlow/stepKinds.js` + the `FlowDef` typedef in
>   `js/data/flowsRegistry.js`) is one row of `select | button | toggle` today,
>   which cannot express this flow's resolution / length controls. Authoring it
>   now means a new JS `uiComponent`, and MPI-531 item 4 would then have to port
>   it. MPI-531 item 1 (extend `FlowStepField` with slider / number / text) is the
>   specific dependency.
> - **Extend is a FLOW, not a model op** — see `project_ltx_workflows_land_as_flows`.
>   No `ModelDef`, no `supportedOps`, no `dependencies.js` entry; it runs on the
>   already-wired LTX 2.3 checkpoint. Work items 2 and 3 below were rewritten for
>   that. **Work item 1 survives the reframe unchanged** — the injector is the same
>   for Flows, so the linked-widget trap is identical.

## What already exists

`comfy_workflows/raw/ltx_v2v_template.json` — 56 nodes, 101 links, single stage.
Landed 2026-08-10, byte-identical to the copy that executed successfully on the
bench (127.0.0.1:8188) against both an H3 clip (with audio) and a WAN 16fps clip
(silent). The full authoring history, every root cause, and the code lines that
prove them are in `tasks/MPI-4/validation.md` — read that before touching this.

Proven behaviours:
- Extend via `LTXVAudioVideoMask` `max_length="pad"` (zero new node packs).
- Reference window derived from the clip (`floor((a-1)/8)*8+1` → clamp 1..73), so
  no clip length is rejected.
- Extend tail snapped to the 8n lattice at any fps, video and audio tails equal
  by construction (`MpiMath#51`, incl. the NTSC `+0.5`).
- Silent sources supported end to end, switched on `MpiLoadVideo.has_audio`.
- ~3s of generated foley over the reference window, at zero extra sampler cost.

## Work

1. **Restore `Input_Width` / `Input_Height` (`MpiInt`).** They were deleted on the
   bench and `Resize To Target` wired straight off `MpiLoadVideo:5/:6`. Correct
   there, fatal here: the app injects by writing `widgets_values`, and a linked
   widget-input makes ComfyUI ignore the widget — so the resolution picker would
   be silently dead. Derive the default client-side instead (default the picker
   to the clip's own dimensions), keeping the override for a 4K clip on a card
   that cannot take 4K.
2. **Fan to API format** — add the template to
   `comfy_workflows/scripts/workflow_generation/`, teach `generate_ltx.py` to emit
   `ltx_v2v.json` + `ltx_v2v_int8.json`. **Convert against the app engine (48188),
   not the bench (8188)** — the bench runs ahead and has silently shifted a widget
   before.
3. **Follow `/mpi-add-flow`, not `/mpi-add-model`.** `docs/playbooks/add-flow/` —
   README hub, then `01-descriptor-and-ops.md` for the `FlowDef` in
   `js/data/flowsRegistry.js` and the op's 4 files, `02-media-io.md` for the media
   slots. Shape: single model (LTX 2.3), video in → video out,
   `mediaType: 'video'`. Author declaratively via `steps` + `fields`, with **no
   new `uiComponent`** — that is the whole reason MPI-531 gates this card. There is
   no `supportedOps`/`workflows` entry in `models.js` and no `dependencies.js`
   entry to write.
4. **Re-check the LoRA slots and loaders** against what the app injects — the
   bench copy carries `int8` transformer + `fp4` gemma widgets and a TAE preview
   chain (`LTX2SamplingPreviewOverride` + `LatentUpscaleModelLoader` + TAE
   `VAELoader`) that may or may not belong in the shipped file.

## Open knobs (measured, not blocking)

- `Ref_Frames` cap 73 → 41 → 25. At 73 roughly 40% of every sampler step
  regenerates footage the crossfade then discards. The cap ALSO feeds
  `ImageBatchExtendWithOverlap.overlap`, so a sweep moves the crossfade length at
  the same time — decouple with a second clamp before trusting the comparison.
- Whether LTX 2.3's motion holds off-24fps. `LTXVConditioning` is told the frame
  rate, but told is not trained-on. 16fps verified to run; quality unjudged.

## Related

- `MPI-4` — the LTX umbrella. Brief + validation carry everything above in full.
- **`MPI-536`** — foley as its own Flow (freeze all video, mask all audio, generate
  no new frames). Carded 2026-08-11; it is NOT part of this card. **Its resolution
  decision is the opposite of this one** — foley deleted `Input_Width`/`Input_Height`
  because that graph never delivers the encoded pixels, while here `#28`'s output IS
  the delivered clip and they must be restored. Do not carry either decision across.
- **`MPI-537`** — lipsync, the third front end. Its own workflow file and its own
  op; it does not share `ltx_v2v.json`.
- **`MPI-531`** — the blocker. `MPI-529` (Flow Library v2) and `MPI-332` (rips the
  three test flows) sit upstream of it.
