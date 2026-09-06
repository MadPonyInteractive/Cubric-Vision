# H3 stage-2 windowing — `MpiWindowedSampler` and the tier table

> Part of [MiniMax H3](README.md). Why the stage-2 refine is sampled in temporal
> windows on some canvases and not others, what the numbers in the graph mean, and
> which of them are measured. Everything here was measured on a **16 GB RTX 4060 Ti**.

## The problem

Stage 2 refines a latent that is already at the OUTPUT size, so its peak cost is set by
the final canvas × the clip length — nothing upstream moves it. At 2K a 16 GB card
samples T=27 (90 frames) fine and OOMs at T=32 (107) and T=37 (124). **H3's shortest
trained clip is 124 frames**, so the model's own minimum was the one the card could not
refine, and no parameter fixed it: lowering the upscale factor moves cost into stage 1
without touching stage-2 peak.

Windowing is sound here and would NOT be for a first-pass generation. This is a
**refine**: motion, identity and framing were all decided upstream, every window reads
the same source latent and the same noise field, and a short sigma schedule only adds
local detail. Two windows cannot disagree about content the way two independent
generations would.

## How it is wired

Both runtimes (`minimax_h3_r2va.json` node 712, `minimax_h3_fl2va.json` node 532) carry
`MpiWindowedSampler` in place of `SamplerCustomAdvanced`. `overlap_frames` and
`frame_grid` are plain widgets; **`window_frames` is a LINK**, driven by an `MpiMath`
titled `Window Frames` that reads the two wires already feeding
`MinimaxH3LatentUpscaler3D`:

```
100000 if a * b < 850000 else (243 if a * b < 1100000 else (90 if a * b < 6000000 else 39))
```

`a` and `b` are the **stage-2 target** dimensions, not `Input_Width`/`Input_Height`, so
the tier folds in `Upscale Factor` automatically and is orientation-independent (a
portrait and a landscape 2K are the same token count and get the same plan).

| stage-2 output | MP | ceiling | 5 s (124f) | 10 s (243f) |
|---|---|---|---|---|
| 832×448 | 0.37 | 100000 — never windows | single | single |
| 1280×704 / 1344×768 | 0.90 / 1.03 | **243** | single | single |
| 1664×960 | 1.60 | **90** | 2 win, measured | untested |
| 1920×1088 / 2560×1472 | 2.09 / 3.77 | **90** | 2 win, 1.19x | 4 win, 1.50x |
| 3840×2176 | 8.36 | **39** | 6 win, 1.95x | 13 win, 2.17x |

**The second boundary is 1100000, not 1600000, and that is deliberate** (MPI-704). It was
1600000 while native 1344×768 was the largest 1K-class canvas the picker offered. The new
`high` tier is 1664×960 — 1.60 MP, which the old boundary would have handed the **243**
ceiling. That ceiling is not a formula: it was measured at 1344×768 (1.03 MP) and peaked
at **14,945/16,380 MiB**, 91% of a 16 GB card. 1.55× the pixels at the same 243 frames is
the MLP wall, not a margin. Dropping the boundary to 1100000 sends 1664×960 to the **90**
ceiling instead, which is measured safe at 2.09 MP and therefore strictly safe at 1.60.
Nothing else moved: 1344×768 is still 243, 1152×640 still never windows, and everything
from `very_high` up is unchanged. **Raise it only on a measured run at 1664×960**, never
by interpolating between two rows.

### 1664×960 is measured, through the APP, on both H3 ops

Three runs on a 16 GB RTX 4060 Ti, 2026-09-06, dispatched through `/connector/generate`
against the shipped runtimes — not the bench:

| op | frames | plan | wall |
|---|---|---|---|
| `t2v_ms` (fl2va) | 56 | single pass — at or under the ceiling | 3m51s |
| `t2v_ms` (fl2va) | 124 | **2 windows of 73**, sharing 22 | 8m22s |
| `ref2v_ms` (r2va) **+ 1 reference image** | 124 | **2 windows of 73**, sharing 22 | 10m45s |

All three delivered 1664×960 with audio and none came near an OOM. `MpiWindowedSampler`
logs its plan to `app.log` — `spans=[(0, 22), (15, 37)]` in latent frames — so the plan is
readable after the fact without instrumenting anything:

```
grep MpiWindowedSampler "%APPDATA%\Cubric Vision\logs\app.log"
```

**The reference run is the one that mattered.** Both `MpiH3References` nodes are live
during stage 2 — `Input_Refs` at `ref_image_size: match` feeding stage 1 and `Refine_Refs`
at `max` feeding the stage-2 guider — so the reference tower is resident *concurrently*
with the windowed refine, and every earlier measurement behind these ceilings was taken
without one. It cost 29% over the reference-free run at the same canvas and clip, and did
not change the plan. One image; **2–3 references is the normal user load and is still
unmeasured**, so treat the headroom above this as unknown rather than proven.

The 56-frame run is worth keeping in mind for a different reason: a dispatch that does not
set `Input_Duration` inherits the runtime's baked value, and fl2va bakes **2**, which is
below H3's 124-frame trained minimum.

**Because `window_frames` is a link, the app can never write it** and node 712 needs no
`Input_Window` title. Re-title it only if an app-side override is ever wanted — and note
that a title matching no node is skipped silently, so a half-done job is invisible
(MPI-116, [../../workflow-authoring/injection.md](../../workflow-authoring/injection.md)).

## The ceiling is a CEILING, not a target

`plan_windows` fixes the pass count from the ceiling, then shrinks the windows to the
smallest legal size that still covers the clip in that many passes. A generous ceiling
therefore costs nothing and a low one costs passes. It also means the window you get is
rarely the number you typed: at a 240 ceiling a 481-frame clip plans 175-frame windows.

Legal H3 lengths are `17k + 5` at 24 fps, and legal latent lengths are `5k + 2` — H3
patchifies time as a 2-frame causal head plus blocks of 5. A window off that grid ends in
a padded part-block that **decodes BLACK**, which reads as a blend artefact rather than as
an illegal length. `frame_grid` is 5 for H3; set 1 only for a model with no such
structure, which also makes both frame widgets count LATENT frames instead of video ones.

## Overlap is ONE CONSTANT — 17

Swept every legal clip from 124 to 362 frames against all three ceilings:

- **`9` and `17` produce byte-identical plans everywhere.** So do `26` and `34`.
- **At the 4K ceiling the asked overlap does nothing at all** — 0/9/17/26/34 all give 20
  windows of 39f sharing 22f, because the stride floors at 5 latent frames.
- Only `0` is genuinely different: it can collapse to a 5-frame fade.
- At the 90 ceiling, `26` is expensive on long clips — 15 s goes **1.26x → 1.77x**.

So a single widget at **17** covers all three tiers. The number typed is a MINIMUM, never
the fade obtained: real fade = `window − stride`, and the stride is snapped down to a
multiple of `grid`, which can only ever hand back more shared frames than were asked for.

**Fade width is not the seam lever.** 243 frames at a 22-frame shared region — the
NARROW bucket — came out with no visible seams. The 2K portrait clip that DID show a
barely-visible seam had **56** shared frames, more than twice the fade. Narrow-clean
against wide-seamed is close to the inverse of what a windowing bug looks like, which is
why the remaining seam question sits on the generation rather than on this node.

## There are TWO memory walls, and they are different

Measured, and the distinction matters because only one of them is predictable:

| canvas | clip | died in | note |
|---|---|---|---|
| 2560×1472 | 107f | `prequantize_int8_attention` | attention |
| 2688×1536 | 243f single pass | `int8_linear` `torch.empty((m,n))`, **11.66 GiB** in one allocation | MLP |
| 3840×2176 | 124f, window 3 of 6 | `int8_linear`, 5.45 GiB | MLP |

The MLP allocation is **linear in latent frames** — 11.66 GiB at T=72 is ~0.162 GiB per
latent frame at that canvas — so unlike the attention wall it can be computed before
sampling. Which wall a run hits depends on the SHAPE, not just the token count: a 2K-tier
canvas hit the MLP wall once the clip got long.

Do not extrapolate a ceiling from one of these to the other, and do not extrapolate
either from token count alone. That mistake was made twice on this card. **The tier table
above is a table of measurements plus a toggle, modelled on tile decoding — it is not a
formula**, and the OOM retry ladder is the fallback for unmeasured cards, not the primary
mechanism.

## What is measured, and what is not

| claim | status |
|---|---|
| 2K needs windowing at 124 frames; 90 survives | **measured** |
| 10 s at 1K single-passes — 12 min, peak 14,945 / 16,380 MiB (91%) | **measured** 2026-09-06 |
| 4K is out of reach on 16 GB | **measured** — OOM at 3840×2176, and every smaller legal window is worse in every dimension except memory |
| the `243` row is safe on a card with other VRAM pressure | **NOT measured** — 91% peak leaves ~1.4 GB. Deliberate: an OOM there is recoverable, slow-by-default is not |
| 1920×1088 needs the 90 ceiling | **NOT measured** — it sits in the 90 tier conservatively, since 90 is proven safe at twice the pixels |

## Audio

Audio is sliced to its window alongside the video (`ed4d289`); the joint AV latent is a
`NestedTensor` of two differently-shaped tensors, which is why the video half cannot
simply be sliced in place. `denoised_output` is accumulated through the same blend
weights as `output` rather than aliased to it — an aliased second output is valid-looking
and quietly wrong, and `ltx_i2v_t2v` really does consume it.

## Do not

- **Do not add a `SplitSigmas` to stage 1.** The author's example workflow has one and
  ours deliberately does not: H3's joint video+audio latent survives a
  complete-pass-then-re-denoise refiner but NOT a split trajectory (MPI-477).
- **Do not unload the model between windows.** It re-streams a 20 GB DiT over PCIe once
  per window and costs far more than the sampling it protects.
- **Do not read a bench export at face value** — a bypassed node is pruned into a
  pass-through and the resulting graph is internally consistent. See
  [../../workflow-authoring/bench-editing.md](../../workflow-authoring/bench-editing.md)
  § A BYPASSED node.

## Sources

- `c:/AI/Mpi/ComfyUi-MpiNodes/sampler.py` — `plan_windows`, `latent_to_frames`, the node
- MPI-699 (`.agents/mpi-kanban/tasks/MPI-699/plan.md`) — every measurement above
