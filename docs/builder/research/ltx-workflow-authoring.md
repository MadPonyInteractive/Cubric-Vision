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

## SINGLE-STAGE vs TWO-STAGE — the deconfounded A/B (local bf16, 2026-07-03/04, MPI-186)

Ran the comparison properly. **t2v is useless for this A/B** — any change (sigmas, base res,
sampler) reshuffles the whole composition (new scene = effectively a new seed), so every t2v
run looked "different" and settled nothing. **i2v with a locked start frame is the only clean
test** (composition anchored; only the changed variable moves). All conclusions below are from
the i2v A/B on the same start frame (mall / phone / red-sleeve portrait).

### VERDICT: single-stage wins QUALITY; two-stage wins MOTION. It's a tradeoff, not an upgrade.

**Single-stage (native res, no ÷2, no stage-2):**
- ✅ **Better faces — crisp teeth.** Two-stage teeth **morph like lips** (the exact artifact in
  every YouTube LTX two-stage video). Single-stage teeth stay solid. For a face-first product
  this is the headline.
- ✅ Sharper hair, freckles, garment detail. Two-stage blurs all three.
- ❌ **MORE hallucination.** Single-stage invented nail polish that wasn't in the start frame and
  flipped the phone (back→front). Two-stage stayed more faithful to the input here. (Plausible
  mechanism: native-res single pass has more freedom/detail budget to invent; the ÷2 base +
  low-denoise refine constrains two-stage closer to the source.)
- ❌ **Less motion / stiffer.** t2v: single-stage = lift-phone-and-talk; two-stage = show-phone-
  turn-walk-away. i2v: both natural, two-stage slightly more dynamic (smaller gap under i2v).
- ❌ **High VRAM.** Native-res single pass at 1080p spilled ~21GB into shared/system RAM on a
  16GB 4060 Ti (Dedicated 14.6/16, Shared 21.6/31.9). Only completes with a big RAM cushion.
  This is the reason two-stage exists.

**Two-stage (÷2 stage-1 → x2 upscale → refine):**
- Motion is BETTER because **low-res stage-1 = more dynamic motion** (see ltx-2.3-tiers.md:
  "motion peaks at low ~448, decays as res climbs"). The ÷2 base is a **motion feature**, not
  just a VRAM trick.
- Fits 24GB, scales to LONG clips (users report 30s on a 5090 — only possible multi-stage;
  native-res 30s single-pass is infeasible even on 32GB). **This alone keeps two-stage in the
  product.**
- Softer faces + the teeth-morph + occasional hallucination are its real costs.

### THE REAL QUALITY BUG WAS OUR STAGE-2 SIGMAS (0.65) — now corrected to 0.85

Our shipped stage-2 = `ManualSigmas "0.65, 0.45, 0.25, 0.0"`. Official reference (that ÷2 note
above) = `"0.85, 0.7250, 0.4219, 0.0"`. **Live i2v A/B (same seed, same two-stage, only sigmas
toggled): official 0.85 beats our 0.65** — sharper face, better detail recovery. Our 0.65 was
UNDER-denoising the refine → the upscale pass had too little noise budget to rebuild detail.
**This overturns the earlier "0.65 didn't change quality" tuning conclusion — it did; 0.85 is
better.** ⚠️ Do NOT confuse with the stage-1 ManualSigmas-vs-LTXVScheduler A/B above (that was
stage-1, still stands: keep LTXVScheduler for stage-1). This is a **stage-2** sigma fix.
(SamplerCustomAdvanced vs our LTXVNormalizingSampler for single-stage = tested, no clear win —
sampler is not the lever.)

### ÷2 base res is BOTH a feature (motion) AND a cost (composition/detail)

At high tiers the ÷2 stage-1 is too small to carry composition faithfully (t2v: floating detached
van door; phone flip) — it plans a lower-fidelity scene that the upscale then faithfully enlarges.
i2v anchors this (start frame holds composition) so the damage is milder under i2v than t2v.
The `×0.66`-instead-of-`÷2` some workflows use is a hardcoded guess at "halving is too aggressive
at high res." **OPEN LEVER: replace `MpiMath floor(a/2)` (nodes 155/156) with an equation that
picks the stage-1 base from the user's target res + ratio** — a base big enough to hold
composition but small enough to keep motion + fit 24GB. Between ÷2 (breaks composition, best
motion) and ÷1 (= single-stage, best detail, worst VRAM/motion). Not yet designed/measured.

### DECISION (user, 2026-07-04): TWO-STAGE IS THE WINNER. Settled — do not reopen.

Two-stage has more pros (faithful i2v, dynamic motion, fits 24GB, scales to 30s clips) and its
weaknesses (soft faces, teeth-morph) are fixable by the user bumping to 2K/4K OR — the real
unlock — a proper **video upscaler** (we don't have one yet; the current stage-2 "upscale" is a
low-denoise refine that morphs teeth, which is WHY faces suffer). **3-stage = REJECTED** (see
below). **Single-stage = REJECTED for product** (best faces but hallucinates more on i2v, stiffer
motion, high VRAM/OOM risk). The ONE clear ship-it win from this whole arc = the **stage-2 sigma
fix 0.65 → 0.85** (strictly better detail, no downside, fits everywhere).

**3-stage evaluated + rejected (aistudynow.com article, 2026-07-04):** base stage-1 = **320×244**
(vs our ÷2), then 2x→4x upscale subgraphs. Wins motion/audio/VRAM/long-clips; SILENT on face
fidelity because low-res destroys it — a 320×244 base reconstructs the user's uploaded face from a
thumbnail = max hallucination, worst i2v fidelity. Also stacks TWO inter-stage re-fault seams (2×
the Pod reload tax). Its claimed "fixes" are all motion/background/audio (axes low-res helps),
never faces. Wrong trade for a face-first product. (Ref numbers: 5090 HD 222s / ~55GB overhead;
3060 12GB did 20s@~30min.)

**The real unlock (parked):** a proper VIDEO upscaler would let single-stage gen (best faces, most
faithful) at low-ish res + upscale cleanly, decoupling detail from the base gen — dissolves the
whole detail-vs-fidelity dilemma. We don't have one. Until then, two-stage + 2K/4K bump is the path.

### (superseded) earlier crossroads note

Was leaning **single-stage for RunPod/Pod** — it removes the inter-stage `MpiClearVram` re-fault seam
(the biggest Pod per-gen tax; see pod-perf-investigation.md) AND wins faces. Open risk to settle
LIVE before committing: **does bf16 single-stage OOM or just-slow on a 24GB Pod?** bf16 has no
GGUF dequant spike (that was the MPI-185 OOM, GGUF-specific), so single-stage bf16 should degrade
to slow RAM-offload, not crash — but the native-res sampling latent on 24GB is UNTESTED. The
biggest standing pain remains the RunPod cold-load times, not the workflow. fp8 stays REJECTED
(eyes/teeth — the very artifact single-stage fixes; don't trade a solved infra problem for a
permanent face-quality one).

---

## ComfyUI groups are position-based, not nodes[]

Workflow `groups` store `nodes: []` (empty) — group membership is computed at render time
by which nodes fall inside the group's `bounding` box `[x, y, w, h]`. Adding a node to
`nodes[]` does NOT place it visually; setting the node's `pos` inside the bounding box
DOES. When a script adds a node that should land in a named group, read that group's
`bounding` and set the new node `pos` to `[bounding.x + ~40, bounding.y + ~60]`.
