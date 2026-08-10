# MPI-520 — LTX 2.3 v2v extend: wire the proven bench workflow into the app

**BLOCKED until the 1.4 release ships (MPI-450).** The workflow itself is done and
proven; nothing here is research.

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
3. **Register the op** — `extend` in `js/data/commandRegistry.js`, `supportedOps`
   + `workflows` entry in `js/data/modelConstants/models.js`. Single stage, so no
   `_ms` treatment.
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
- Foley as its own op (freeze all video, mask all audio, generate no new frames)
  is the next piece of work and is NOT part of this card.
