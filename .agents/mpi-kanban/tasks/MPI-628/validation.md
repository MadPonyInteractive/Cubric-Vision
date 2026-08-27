# MPI-628 - validation

## The graph, before any repo write

Dry-converted the exported raw to a scratch file and gated it there, so nothing landed in
the tree unverified.

| check | result |
|---|---|
| bench 8188 vs app engine 48188 | both ComfyUI **0.31.0**, frontend 1.48.7 — no drift |
| `node_lock.json` pin | `v0.31.0`, engine matches what ships |
| all 13 node classes used | present on BOTH ports, identical signatures |
| `LoadBackgroundRemovalModel` / `RemoveBackground` | core ComfyUI since 0.27.0 — no new pack |
| `bg_removal_name` combo | `birefnet.safetensors` on both engines |
| conversion | exit 0, no stderr, 66 nodes (was 94) |
| `verify-workflow.mjs` | exit 0 |
| `validate-injection-rules.mjs` | exit 0 |
| `control_after_generate` phantom sweep | clean (`ClownsharKSampler_Beta` is the flag-less biter) |

The shipped runtime twin came out **byte-identical** to that verified dry run.

## What the converter did with the debug nodes

`MaskPreview` 856 sat in the LIVE path at mode 4 (bypass), which reads alarming and is
correct: bypass rewires by type, so the converted graph has
`859 InvertMask.mask <- ["742", 0]` straight off `MpiIfElse`. Muted 766/767 were dropped.
Only two output nodes survive — `Output_Image` (494) and `Output_prompt` (673).

## Absent, verified in the converted JSON

`Input_Edit_Model`, `Input_Edit_Clip`, `Input_Lora_Phase2*`, `klein`, `LanPaint`,
`MaskDetailer`, `InpaintCrop`, `InpaintStitch`.

## Loaders remaining

| loader | weight | status |
|---|---|---|
| `Input_Base_Model` + CLIP + VAE | Krea 2 stack | the flow's ONE `requiredModels` slot |
| `SAM3 Model` | `sam3.1_multiplex_fp16` 1.63GB | `engineAsset: true` |
| `Load Background Removal Model` | `birefnet` | `engineAsset: true` |

Both survivors install with the engine, so neither is a flow requirement. `requiredModels`
is the Krea 2 any-of slot and nothing else.

## Suite

`npm test` **747/747**, 0 fail. `npx eslint js/ tests/` exit 0.
`npx playwright test --config=playwright.desktop.config.js flow-lora-button` — 1 passed (8.1s).

## THE FINDING THIS CARD TURNED UP

**The Character Sheet was the LAST two-slot flow in the repo.** Every shipped flow now
declares exactly one model slot:

```
head-swap 1 · ltx-extend 1 · ltx-foley 1 · ltx-upscale 1 · scribble-object 1
scribble 1 · character-sheet 1 · outpaint 1 · voice-changer 0
```

So the multi-slot machinery — `flowModelChoices`, per-slot picks, per-phase LoRA racks,
`MpiBaseFlow`'s cogwheel loop — is live code with no shipped caller exercising more than
one slot. It was carrying six tests as a real fixture, which is why removing one slot
broke eight of them at once.

**Kept, not deleted.** The coverage moved to a synthetic `TWO_SLOT_FIXTURE` pushed onto
`registry.FLOWS` and spliced off in `finally` — the pattern 'picks are PER SLOT' already
used in that file. That also stops the next flow re-shape breaking these tests, which is
exactly what just happened. MPI-586's Prop Sheet needs the same shape, so the machinery
has a caller coming.

One thing did NOT survive: the Library detail panel's MULTI-slot render has no desktop
probe any more. A synthetic flow is the wrong fix there — the Library renders a tile, and
a missing preview asset 404s the whole suite (the failure mode behind `.husky/pre-push`).
Noted in the spec and in `docs/playbooks/add-flow/ui/lora-rack.md`.

## Pre-existing shape found while rewriting a test, NOT a regression

The phase-1 LoRA rack chains in an order that is not its title order (1 -> 4 -> 2 -> 5 ->
3 -> 6). Harmless — LoRA application is a stack — and `flow-lora-rack.test.cjs` already
documented it and walked backwards for that reason. My first rewrite in
`flow-model-choice.test.cjs` asserted positional edges and failed on it; it now walks the
chain and asserts the property that actually matters (all six in one unbroken path
originating at the render loader). The old test never checked phase 1's chain at all, so
this is newly covered rather than newly broken.

## OPEN - needs Fabio's eye, nothing an agent can settle

1. **Hair matte at 100% on the portrait panel.** BiRefNet's edge is where this shows, and
   the whole sheet's backdrop is replaced now, not just the head region.
2. **The neck cut.** `GrowMask` expand 6, hard-edged, where the removed branch grew 32 with
   a 16px blur because an inpaint needed the slack. A subtraction may want less, or may
   want a blur back.

Fabio ran the graph on the bench before exporting, so both are "does it look right",
not "does it run".
