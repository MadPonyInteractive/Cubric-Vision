# LTX Workflow Authoring — Mechanics & Gotchas

> Template-wiring research for the LTX-2.3 workflow. Applies when editing
> `LTX_i2v_t2v_template.json` or authoring a new LTX-class workflow.
> See [05-author-and-test.md](../05-author-and-test.md) for the cooperative loop.

---

## Live latent previews — KJNodes override + the 28-byte VHS header trap (MPI-166)

LTXAV (patch-packed video latent) shows NO live preview by default: the in-loop sampler
latent is packed transformer tokens (live-probed shape `(1,1,50048)`, not a `[B,C,F,H,W]`
grid), so core ComfyUI's previewer (matmul or taesd) fails. Do NOT patch core
`latent_formats.py` (both approaches are dead ends — reverted).

**Working path = KJNodes `LTX2SamplingPreviewOverride` node.** It installs an
`OUTER_SAMPLE` wrapper that has `shape`/`latent_shapes` context, unpacks correctly, and
carries its own LTXAV `latent_rgb_factors` table (cheap matmul, no extra model, zero added
per-step cost). A taeltx VAE is NOT needed.

Wiring: insert AFTER `Model_Connect` reroute so it wraps whichever loader the engine-split
keeps → `UNETLoader → Model_Connect → LTX2SamplingPreviewOverride → rest`. Title-driven
so `generate_ltx.py` carries it into all 8 output files untouched.

**The 28-byte header trap.** The node sends preview frames with VideoHelperSuite's 28-byte
binary header (not core's 8-byte). The app handles this via
`comfyController._stripPreviewHeader()` which scans for the JPEG SOI marker (`FF D8`) and
slices from there — format-agnostic, fallback to `slice(8)` if no SOI. **Rule: never
hardcode the preview-header length** — different sampler nodes use different protocols.
LIVE-VERIFIED local 2026-06-30 (t2v + i2v).

**Multi-frame looping previews (MPI-167).** LTX previews are a MOTION CLIP (sequence of
frame positions), not a refining still. The app holds frames as a rolling clip and cycles at
8fps (`PREVIEW_CLIP_MAX=48`). **Stage boundary = reset the clip** — each sampler stage
fires a `VHS_latentpreview` WS text event once (`{length,rate,id}`); the app routes it to
`exec.onPreviewReset` → card `resetPreviewClip()`. Without the reset, multi-stage gens
concatenate all stages into one growing loop. LIVE-VERIFIED local 2026-06-30.
Pod NOT yet verified (proxy WS passes binary through, so the SOI fix should cover remote —
unconfirmed).

---

## Workflow deconstruction — monolith split

The NerdyRodent monolith is being deconstructed into separate per-operation workflow files
(plain direct-wired, no Get/Set/Any-Switch maze). Key findings:
- **ControlNet Union 2.3 = SOFT control.** `strength_model` is a dead knob — tighten via
  AddGuide params instead. TIER is the big lever: low 448 starves pose-lock; medium 640
  gives good dance adherence.
- Comfy node naming law: all new non-Tier-1 nodes MUST be `Input_*` / `Output_*` (MPI-116).
  See `mpi-kanban/tasks/MPI-4/` for full record.

---

## FF/LF wave distortion — wrong node, not model limit (MPI-4, 2026-06-24)

The wave distortion at clip tail came from using the WRONG NODE:
`LTXVImgToVideoInplaceKJ` (a multi-image SEQUENCE node). Fix = two chained
`LTXVAddGuide` nodes: first @ `frame_idx=0`, last @ `frame_idx=-1`, strength 0.7.
Applied to BOTH stages — S2 MUST re-lock the end frame or it hallucinates the tail.
S2 AddGuide `latent` MUST come from `LTXVLatentUpsampler` (the upscaled stage-1 latent),
NOT a fresh `EmptyLTXVLatentVideo`. Gated by `Input_Use_End_Image` boolean — NOT a
separate file. Full record: `.agents/mpi-kanban/tasks/MPI-4/research/flf-addguide-splice.md`.

---

## `Input_Use_Reference_Audio` (#296) MUST bake `false` — `true` default = fade-from-black in t2v

The `Input_Use_Reference_Audio` MpiIfElse (#296) gate selects the stage-1 guider:
`true` → `LTXVReferenceAudio` #274 (ID-LoRA path); `false` → clean text-only CFGGuider
#293. The app injects this gate ONLY when an audio chip is present. So a plain t2v gen
(no audio) runs whatever the JSON bakes.

If #296 bakes `true`, EVERY audio-less t2v runs through `LTXVReferenceAudio` with no real
ref clip → degenerate dark first-frame conditioning → **fade-in from black.** Bake #296
`false` in the template; the app flips it `true` only on a reference-audio chip.

`generate_ltx.py` does NOT stamp this gate (only `Input_Text_to_video` + `Input_Is_Continue`
are stamped) — it's a pure authoring default, survives template→output verbatim, and MUST
be correct in the exported `LTX_i2v_t2v_template.json`. Symptom is app-only / invisible in
a raw ComfyUI graph run (manual runs load a real image and don't exercise the `_ms`
orchestration path the same way). Fixed + live-verified 2026-06-29 (t2v_ms_005 bright first
frame).

---

## Single-stage distilled = our stage-1 minus the ÷2 + upscaler — keep OUR scheduler, NOT ManualSigmas

The official Lightricks single-stage distilled workflow
(`example_workflows/2.3/LTX-2.3_T2V_I2V_Single_Stage_Distilled_Full.json`) is NOT a new
recipe to port — structurally it's **our stage-1 with the input ÷2 downscale removed and no
stage-2** (gens straight at target res, one `SamplerCustomAdvanced` pass, no
`LTXVLatentUpsampler`). So the distilled single-stage is a **config of what we already have**,
not a fresh author.

**The one real delta is the sigmas, and it's already settled AGAINST theirs:** the official
file uses `ManualSigmas`; we use `LTXVScheduler`. **A/B tested (user) — ManualSigmas produces
worse results than our `LTXVScheduler` for distilled. Keep our scheduler; do NOT adopt the
official ManualSigmas.** Nothing to import from their JSON for the distilled path.

**Why single-stage is the big-card Pod lever:** it drops the stage-2 load entirely — the ÷2
downscale, the x2 spatial upscaler (`LTXVLatentUpsampler` + `ltx-2.3-spatial-upscaler-x2-1.1`),
the `MpiClearVram` re-fault seam, and the second sampling pass. On a card that holds the working
set resident, that removes the biggest per-gen tax (stage-2 re-stages the model through the
memlock-fail path — see [pod-perf-investigation.md](pod-perf-investigation.md)). Cost: gens at
full res in one pass = bigger latent = more VRAM (the big card has it), and loses stage-2's
hi-res-fix detail pass.

**To build the distilled single-stage path:** stop dividing input res by 2
(`ImageResizeKJv2`/`LTXVPreprocess` + `EmptyLTXVLatentVideo` → target res), skip the
`LoadLatent` stage-2 handoff + `LTXVLatentUpsampler` + second `MpiClearVram`, single output,
keep `LTXVScheduler`. Note the `/64` size rule in [ltx-2.3-tiers.md](ltx-2.3-tiers.md) assumes
the ÷2 stage — revisit it for a single-stage path.

**OPEN / NOT yet measured:** total wall-clock + VRAM peak + quality A/B (single-stage vs
two-stage) on a big Pod, at a low tier AND a high tier — big-card + low/mid tier is where it
should win outright; high tier is where two-stage's detail-fix may still hold. Also OPEN: the
**full (non-distilled) `dev`** single-stage is a separate story (different sampler behaviour,
may justify its own scheduler/sigma tune) and needs the full 22B dev model downloaded first.

---

## ComfyUI groups are position-based, not nodes[]

Workflow `groups` store `nodes: []` (empty) — group membership is computed at render time
by which nodes fall inside the group's `bounding` box `[x, y, w, h]`. Adding a node to
`nodes[]` does NOT place it visually; setting the node's `pos` inside the bounding box
DOES. When a script adds a node that should land in a named group, read that group's
`bounding` and set the new node `pos` to `[bounding.x + ~40, bounding.y + ~60]`.
