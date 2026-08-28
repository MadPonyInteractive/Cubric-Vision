# The approved composition

> Part of the flow carousel frame — [README.md](README.md) is the hub. **Where this file
> disagrees with the sketch in the README, this file wins.**

Three independent mock-ups ran on 2026-07-18 (MPI-306). Mock-up C ("surgical precision") won
and was revised to C2, which the user approved as **the** design. Reference implementation:
`mockup-C2.html` (scratchpad — a throwaway artefact; this file is the durable record).

## Air is structural, not leftover

Content clusters toward a **centre gravity** with generous empty outer margins — the opposite
of stretch-to-fill. A `max-width: 1180px` centre column inside `--s-7` padding. The outer
thirds stay empty on purpose.

## The divider is INSET, top and bottom

It does **not** run the full height and never touches the chrome. ~62% height, fading out at
both ends:

```css
background: linear-gradient(to bottom,
  transparent 0%, var(--line) 12%, var(--line) 88%, transparent 100%);
```

Quiet `--line`, never an accent colour. A full-height accent rule is the decorative use of
heat that Stage bans.

## Ambient gradient ground, matched to the Libraries

The flow frame sits on the **same ground as the Flow/Model Library** (`--lib-bg:
oklch(0.26 0.020 350)`), so the three overlays read as one family. Not a flat fill.

**Keep these tokens LOCAL to the component** — `--lib-bg` is already declared locally in both
`MpiFlowLibrary.css` and `MpiModelManager.css` rather than globally in `styles/01_base.css`.
The flow frame is the third local copy. Decided deliberately (2026-07-18): these are
overlay-ground values, not flow-wide tokens, and promoting them to global would invite reuse on
surfaces that shouldn't have them.

The flow's gradient is **centre-out horizontally** — brightest along the centre column where the
work sits, falling away to the left and right edges. This differs from the Libraries' flat
ground; it is what gives the frame its "air at the edges" reading:

```css
/* Direction is settled; exact stops are to be tuned live in the flow. */
radial-gradient(ellipse 75% 120% at 50% 50%,
  oklch(0.29 0.021 350) 0%,
  oklch(0.26 0.020 350) 55%,     /* = --lib-bg */
  oklch(0.225 0.019 350) 100%);
```

The mock-up used a wider top-biased ellipse; the horizontal centre-out form above is the
approved direction. **Fine-tune the stops in the running flow, not in a mock-up.**

## The slot is a PLACEHOLDER, not a container

This is the rule most likely to be got wrong:

| State | Rendering |
|---|---|
| Empty | Bordered box, fixed size, icon + "Drop image here" |
| **Filled** | **The image IS the box** — `width:auto; height:auto; background:none; padding:0`, border hugging the image at *its own* aspect |

**No crop, no letterbox padding, no box-around-an-image.** A filled slot is the media with a
1px outline, nothing else. Constrain with `max-width`/`max-height`, never fixed dimensions.

## Middle steps: bounded centred canvas, no annotation column

Title above, canvas, guidance below — all centred, no divider, no side column. Mock-up C's
60/40 split (annotation column beside the canvas) was **rejected**: the step's copy lives
*below* the canvas, not beside it. `.work { max-width: 900px }`.

## The step ticker NAVIGATES

**This overturns "step dots indicate but do not navigate."** All three mock-ups independently
rejected inert dots — a row that indicates but refuses clicks reads as *disabled*, not
*informational*. Resolution: make it real. The header ticker (`01 Inputs · 02 Target head ·
03 Reference head · 04 Generate`) is a row of buttons with `aria-current="step"`; active in
`--accent-heat`, completed in `--ink-3`, upcoming in `--ink-4`.

## Tier cost is RELATIVE, never absolute seconds

A hardcoded ETA (`~45 s`) is a lie on every GPU but the one it was measured on. The **ratio**
is a property of the pipeline (step count), so it holds everywhere:

| Tier | Steps | Measured | Cost label | Gloss |
|---|---|---|---|---|
| Quality | 20 (raw) | 386 s | `baseline` | Full sampling. Best edge blending and skin match. |
| Turbo | 8 | 100 s | `~25% of time` | Half the steps. Softer detail in hair. |
| Hyper | 4 | 51 s | `~13% of time` | Fewest steps. For checking framing, not final work. |

**Measure the ratio; do not derive it from step count.** The measured column above comes from
a real A/B on one machine (2026-07-18). Note it is *not* linear — 20 steps costs 386 s, not
4×100 s, because the raw tier runs **without the speed LoRA**. Deriving "20 steps = 2.5× of 8
steps" would have been wrong by a factor of ~1.5. Any new tier needs its own measurement.

Only the **ratio** is portable across GPUs, which is why the label is a percentage and the
seconds never ship. The label must say *time*, or "13%" reads as 13% quality. Progress during
a run comes from **server truth** (steps completed), never a baked per-tier duration.

> Later, once run history exists: measure the user's own first Quality run and show real
> seconds from *their* GPU. Their machine's number, not a marketing one. Not built.

## Settled odds and ends

- **Mid-run navigation is allowed** — the run keeps going, and closing does not prompt
  ([run-path.md](run-path.md)). Blocking the arrows during a full-quality run is a cage.
- **Explainer pane does not persist** on middle steps. It vanishes; the canvas hint carries it.
- **Generate button states:** `Generate` → `Cancel` (frost, during run) → `Generate again`.
  Copy change IS the state signal — no spinner. A 1px `--accent-frost` gauge under the button.
- **Live latents:** progressive de-blur + a 1px frost scanline. Honest about a half-computed
  image; never a spinner over blank space.
- Prose blocks are **centred as a block, left-aligned as text**, capped ~62ch.
