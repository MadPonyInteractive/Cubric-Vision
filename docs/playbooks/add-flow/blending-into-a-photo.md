# Blending a generated object into the user's photo

> **Read this before building any flow that puts a generated thing into a photo the user
> supplied.** Stamping an object at the right place and scale is the easy half; making it
> *belong* to the photo is a separate pass with its own laws, and most of them are
> counter-intuitive enough that they were each found the expensive way.
>
> Benched on **Scribble-to-Object** (MPI-567) across five deliberately different lighting
> plates — hard sun, overcast, night/sodium, interior window light, cel-shaded anime — plus a
> tiny-subject ladder. Applies unchanged to **Object Stamp** (MPI-596) and to any future
> composite flow. Flow-specific detail: [existing-flows/scribble-to-object.md](existing-flows/scribble-to-object.md).
>
> **Why this is a flow-level concern at all:** *"Flows should give the user a finished product,
> which is different from the history workspace tools"* (Fabio, 2026-08-21). A flow may not
> leave the user to fix the seam in the History workspace, so the blend is in scope for the
> flow that stamps.

## The three laws

**1. Relighting is a GLOBAL-REFERENCE op. It cannot be done inside a crop.**
The model has to see the scene it is matching. Crop to the object's region and the reference
is gone, so it returns a blown-out patch — measured: a tower came back a glowing blob while
the surrounding photo was untouched. This is also why `boogu_edit_balanced.json`'s existing
localised-edit path is **not** the carrier for a blend pass.

**2. A localised crop/stitch RE-GRADES the returned patch, leaving a visible rectangle.**
Every model tried does it. It is worst over large uniform backgrounds (a dirt road, an empty
rooftop) where there is nothing to hide the box edge.

**3. So: relight the WHOLE image, then composite only the region back.**
The whole-image pass integrates the object correctly *and* re-grades the entire photo — which
is unshippable alone, because a flow may not restyle the user's photo. Taking back only the
object's region keeps the integration and discards the re-grade. The region returns through a
feathered composite rather than a model-graded stitch, so there is no box edge to see.

## The re-grade is NOT a model quirk to shop around for

This was tested properly because the expectation was the opposite — that some model would
simply not do it, which would have unblocked the much simpler localised route.

| model / tier | sun | overcast | notes |
|---|---|---|---|
| Klein 4B edit | ring 21.5 | 15.6 | 10–16s |
| Qwen Edit, tier 3 Hyper (4-step) | 13.7 | 14.1 | melts fine structure — 4-step artifact |
| Qwen Edit, tier 2 Turbo (8-step) | 10.4 | **20.4** | best Qwen arm, but plate-dependent |
| Qwen Edit, tier 1 Quality (~20-step) | **22.9** | 16.4 | *worst* — a blatant box |
| **whole-image relight → composite back** | **0.91** | **1.13** | ring under ~2 is invisible |

Boogu behaves as Klein does. **Four model configurations, one conclusion: stop looking for a
model that returns a clean patch, and use a route that never asks for one.** Qwen additionally
costs ~105s per image against Klein's 10–16s.

> **Trap:** `qwen_edit.json` ships baked at `Input_Tier: 3` (Hyper). Tier is a *runtime radio*,
> not a model variant — 1 Quality / 2 Turbo / 3 Hyper. Any measurement that does not set it is
> silently measuring the fastest arm.

## Measuring the rectangle — and two metrics that DON'T work

Judging this by eye across a matrix does not scale, and the obvious metrics mislead.

- ❌ **Column/row profile step ratio.** Cannot separate the routes (0.246 vs 0.280) because
  the object's own pixels dominate any whole-frame profile, not the seam.
- ❌ **Border coverage** (how much of the changed region's bbox edge differs). The localised
  rectangle scores **0.034** — the outermost ring of a returned crop matches its surroundings
  even when everything inside it is re-graded. Reads as "no box" on the worst case.
- ✅ **`fill`** — changed pixels ÷ area of the changed region's own bbox. A stitched rectangle
  returns the whole crop so it FILLS its box (~0.9+); a feathered composite changes a round
  blob inside a square box (~0.4–0.55).
- ✅ **`ring_step`** — mean |difference| in a ~12px band just *inside* that bbox edge. This is
  the one that matches the eye: the rectangle is visible precisely because that band is
  re-graded while the pixels immediately outside it are untouched. **Under ~2 is invisible.**

Calibrate against a case a human has already called, then trust the number. Note a **dark,
low-contrast plate under-reports** — the night plate scored 6.2 on a route that rectangles
everywhere else, because the re-grade sits below the visible threshold there. Never calibrate
on the darkest plate.

## The composite region decides whether shadows survive

The obvious region — the object's silhouette, grown and feathered — **clips long cast
shadows**, because the shadow the relight drew reaches well past the object.

Derive the region from **what the relight actually changed** instead, at a HIGH threshold, and
union it with the silhouette. The threshold is the whole trick: the object and its cast shadow
are a large local change, the global re-grade is a small one, so a high cut keeps the first and
rejects the second. Shadows then run out of the region instead of dying at its boundary.

```
region = grow(  silhouette(photo vs stamped, thresh 12)
              ∪ strong_change(relit vs stamped, thresh 40, median-5)  ) → feather
```

## A shadow needs PIXELS, and the box is what supplies them

Measured live 2026-08-23 (Fabio, MPI-567). A small object boxed tightly in a small source image
came back with no usable contact shadow at all. Same drawing, same prompt, same strength on a
**2x upscaled source**: the shadow appeared and read correctly.

**The variable is the box's size in SOURCE pixels, not its size on screen or its fraction of the
frame.** The blend pass samples the boxed region; a region only a few hundred pixels across has
too little room for the model to resolve a soft gradient falling away from a contact point, so it
either omits the shadow or renders a hard smudge. Upscaling the photo does not change the
composition or the box's *relative* size — it changes how many pixels the sampler is given, which
is the whole of it.

This is the same failure the ~96px ink floor describes one stage earlier, moved down the pipeline:
starve the model of pixels and it invents rather than resolves. Two distinct floors, one cause.

**What this means in practice:** when a shadow is missing and the composition looks right, check
the box's pixel dimensions before touching the prompt, the strength or the region maths. A
shadow-less result on a small source is not a blend bug and no amount of prompt work fixes it.
Upscaling the source first is the fix, and it is the user's move rather than the graph's.

## The blend prompt

Four properties, each one a bug that was shipped and removed:

**Generic — no object noun, no scene noun.** Any prompt naming "the watchtower" or "the forest"
is not shippable. One line must run unchanged across every plate.

**Medium-neutral — never "photographed".** The same flow runs on ILL Anime and PONY Mix, and a
photographic term fights an illustrated scene. Use *"looks like it was always part of it"*.

**Conditional shadow physics — never an ORDER.** *"Cast a natural shadow onto whatever it rests
on"* produces a shadow whether or not the scene has one, and an invented shadow has no reason to
match the scene's light — it produced a long shadow to the right on a plate whose own grass and
stones cast short shadows to the left. Fabio, 2026-08-21: *"shadows aren't present in every
image. If a subject is backlit right from behind them, it won't cast any shadows, it will just
have a light silhouette around it. If the scene is lit from where the camera is, or the sun is
at 12:00, the shadow might not be visible."*

**An anti-glow guard — and do NOT ask for a rim.** This one bites from both directions. Asking
for *"a cast shadow"* once produced a lit dust cloud at the object's base; the cure was
forbidding glow outright. Later, asking for *"a rim of light"* in the backlit case brought it
straight back as a luminous OUTLINE around the subject. Describe edge light as something the
object's **own edges** do, and keep the guard.

The shipping wording, confirmed by Fabio 2026-08-22:

> `Place the object into the scene so it looks like it was always part of it, not pasted on: match the scene's lighting direction, colour temperature, contrast and art style, and let the scene's light and shadows fall across it. Ground it with contact shading where it meets the surface. Any cast shadow must follow the scene's own light in direction, length and softness; if the light is overhead or comes from behind the camera, keep the shadow small and directly beneath it, and if the light comes from behind the object, let its own edges catch that light instead of casting a shadow toward the camera. Do not add glow, haze, or an outline of light around it. Let nearby foreground elements overlap its edges. Keep the object's shape and design.`

**Asking for OCCLUSION is what sells it.** *"Let nearby foreground elements overlap its edges"*
produces real foliage crossing the legs. A pure relight never generates occlusion, and occlusion
is the strongest "this is really there" cue in a cluttered scene.

**The shadow must NOT be a user toggle.** The prompt already makes it conditional on the light,
so a toggle re-introduces exactly the unconditional instruction this wording removed — on gives
a wrong-direction shadow in a scene that has none, off gives a floating cut-out in hard sun. It
also asks a beginner to predict an outcome they cannot picture, on an axis the image already
knows. Decided 2026-08-22.

## The mask handed to the model must be a FILLED RECT, not a silhouette

If the blend pass takes a mask at all, a silhouette mask confines the denoise to the object's
outline, so the model can neither cast a shadow onto the ground nor let scene light fall across
the object — the result comes back flatly lit. A filled rectangle over the area gains sunlight
across the top, shade on the far face and real contact shadows. Note that squaring the CROP
(`MpiMaskSquareBbox`) is **not** the same as filling the DENOISE region.

## It is a graph tail, not an app-side step

The bench proves this route with a Python composite, which wrongly implies a second dispatch, a
`multiStage` op, or a new server-side image service. **None is needed** — every piece is a core
node (verified against a live `/object_info`, 2026-08-21):

| step | node |
|---|---|
| difference of the plate and the stamped composite | `ImageBlend` (blend_mode `difference`) |
| difference → mask | `ImageToMask` |
| binarise | `ThresholdMask` |
| grow + feather in one | `GrowMaskWithBlur` |
| union two masks (shadow-aware region) | `MaskComposite` |
| take the region back | `ImageCompositeMasked` |

So stage 1, the relight and the composite tail fit in **one graph, one dispatch**, and
`capabilities.multiStage` stays false. Confirm each node's input names when authoring — the
table records existence, not signatures.

### BUILT AND PROVEN, 2026-08-22 — and the translation has three traps of its own

The single merged graph exists (scribble stage 1 + the Klein relight arm + this tail, 74 nodes,
one dispatch, ~16s). It beats the three-step bench route's published seam on **every** plate:

| plate | merged, one graph | session 3, three steps |
|---|---|---|
| sun | **0.42** | 0.91 |
| overcast | **1.03** | 1.13 |
| night | 0.45 | 0.33 |
| indoor | **1.09** | 2.53 |
| anime | **0.93** | 1.93 |

Each trap below returned a plausible, silent, WRONG result — none errored:

**1. `ImageBlend`'s `difference` is `img1 - img2` CLAMPED at 0, not `abs()`.** So a single call
returns an EMPTY mask wherever `image2` is the brighter one. This cost the indoor plate its whole
composite: the region came back changed by 0.18/255 and the flow read as if the blend simply had
no effect. Screen the two directions together — `screen(x, 0) == x` and one of the pair is zero at
every pixel-channel, so `ImageBlend(A,B,difference)` → `ImageBlend(B,A,difference)` → `screen` IS
`abs()`.

**2. The Python thresholds LUMINANCE (`convert("L")`); a graph can only threshold a CHANNEL.**
Max-of-three-channels (three `ImageToMask` OR'd) is strictly more permissive and drags the global
re-grade in — sun `bg_mean` 11.24 against luminance's 10.34, night 6.53 against 4.52. **Use the
GREEN channel alone**: it carries 0.587 of luminance and tracked it to two decimal places on every
plate, so the calibrated thresholds keep meaning what they meant. Red-only or max does not.

**3. A high threshold alone does NOT separate the shadow from the re-grade.** The rule above says
the object and its shadow are a *large local* change and the grade a small one — but the threshold
only encodes "large". Klein also makes large changes far from the object (on the sun plate
`bg_mean` plateaus at 8.3 even at threshold 150, so no threshold rejects it). The missing half is
LOCAL: intersect strong-change with a dilation of the silhouette. Gate 100px measured best —
ungated the sun seam is ring 11.09, gated 0.71.

> **The published ring/fill table above is the SILHOUETTE region** (`compose_back`), not the
> shadow-aware one. The shadow-aware region was only ever judged by eye, on shadow quality, and
> the two were never crossed. Measured on session 3's own frames, ungated shadow-aware costs 2–3×
> more movement in the user's untouched photo (sun `bg_mean` 10.34 vs 3.45). The proximity gate is
> what makes the shadow-aware region shippable; without it, pick the silhouette.

No median filter. The only median here is RES4LYF's `Image Median Blur`, which asserts on a float
3-channel image (`ksize % 2 == 1 && dims <= 2`) **and** is a custom node the app does not pin —
a core `ImageBlur` before the threshold despeckles the same way.

## Two traps that cost real time

**The edit pass CHANGES DIMENSIONS.** Klein snaps to ÷32 and the two axes do not scale by the
same factor: 896×1200 in → 880×1184 out; 736×1168 in → 816×1296 out. Any composite-back must
resize the relit image to the base, or the region lands a few pixels off.

**A cut-out preview's ALPHA IS NOT A SILHOUETTE.** A preview PNG can be ~90% opaque with corners
at 254, so `getbbox()` returns the whole frame and a crop silently does nothing. Derive the
object from non-white RGB instead. This produced two wrong fixtures before it was noticed.

## Where the control strength sits, and the size floor

Both are ControlNet-hint properties rather than blend properties, but they decide what the blend
is handed — see [existing-flows/scribble-to-object.md](existing-flows/scribble-to-object.md)
§ Control strength and § The size floor for the measured numbers. In short: a high hint strength
renders the user's *ink* as object detail, and a hint drawn too small makes stage 1 invent extra
subjects — neither is something the blend pass can repair.
