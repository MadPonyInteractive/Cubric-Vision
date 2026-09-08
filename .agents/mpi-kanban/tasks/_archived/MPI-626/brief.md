# MPI-626 — Re-cut two flow tiles so the seam bisects the face

Fabio, 2026-08-26, looking at the Flow Library grid: Head Swap's seam should sit
"right at the centre of his face, on his nose, so that it actually displays that
it's two different characters", and Draw It In's should be "at the centre of the
character grabbing part of her head".

Both tiles were right about the device and wrong about where to park it.

| Tile | Seam was | Seam is | What that changes |
|---|---|---|---|
| Head Swap | plate x ~800 — through his left cheek | **plate x 857** — the nose bridge | Old beard/new beard either side of one face. Two characters, one head |
| Draw It In | plate x 251 — past the drawing's right edge | **plate x 180** — her face | The drawn shape and the render are now the SAME head, half each. Before, they were two separate figures side by side |

## Plates — all four came off Fabio's own runs, nothing generated

Found through the sidecars, per `06-preview-image.md` § Making them.

- **Head Swap** — `mpi-546-smoke/Media/t2i_008.png` (before) and
  `flowHeadSwap_002.png` (after), both 1344×768. Registration proved before
  compositing: mean abs diff **0.49/255** with the changed bbox at
  **x 771–943, y 122–267** — the head and nothing else, which is what the wipe
  device depends on. `flowHeadSwap_001.png` pairs with the same before but keeps
  a grey goatee; the shipped hero's second half is clean-shaven, so **002** is
  the one that matches the hero.
- **Draw It In** — run **015** (`Untitled/Media/flowScribObj_015.png`, 896×1088)
  with its sidecar's two inputs: `image1` → `t2i_005.png`, `image2` → the
  transparent drawing at
  `.preview-assets/65df930df99831b649a3744dc9bae514e73ac1bede9896d67e5f49f1d66ba13e.png`
  (896×1088, alpha bbox x 63–313, y 265–917 — registered to the red-dress figure).

## Numbers

| | Head Swap | Draw It In |
|---|---|---|
| crop (plate px) | `left 707, top 9, 300 × 375` | `left 0, top 100, 700 × 875` |
| seam (plate x) | 857 → 50.0% of tile | 180 → 25.7% of tile |
| accent bar | yes, `#FF5FA2`, 4 px at tile scale | none — the drawing's own edge IS the line |
| size | 46.6 KB | 92.7 KB |

Both colours are **measured off the shipped pair**, not chosen: the Head Swap bar
samples ~(248,100,162) = `#FF5FA2` (the invented pink Fabio approved 2026-08-20,
explicitly not drift to repair), and the Draw It In blob is a flat
**`#E0436B`** — 63,121 pixels of one exact value in the shipped tile, so the fill
is flat, not the drawing's own soft alpha.

Draw It In is also punched in 1.28× on the figure (700 of 896 wide). At the
shipped full-plate framing the seam lands at 19% and the drawn half is a sliver
that reads as a stripe at 220 px; the punch keeps the full figure, its contact
shadow, the second woman and the tiger, and makes the half-drawn head legible.

## Scope

Stills only. No hero rebuild (both `.mp4`s untouched), no `flowsRegistry.js`
change — the filenames are the same, so the descriptors already point at them.

Poster/first-frame mismatch is unchanged either way: Draw It In's hero opens on
the bare photo and draws the blob in over the first 2 s, so its poster never
matched frame 0, before this card or after it.
