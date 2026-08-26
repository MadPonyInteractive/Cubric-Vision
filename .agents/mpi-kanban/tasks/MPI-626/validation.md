# MPI-626 — validation

**Verified by Fabio, 2026-08-26.** He asked for both changes, saw both tiles, and
said "this is verified". That is the gate that mattered — the whole card is a
judgement about whether two pictures read correctly, which no test can make.

## Agent evidence behind it

| Check | Result |
|---|---|
| Shipped bytes | `flow-head-swap.webp` **47,706 B**, `flow-draw-it-in.webp` **94,918 B** — both 896×1120 webp q90, both far under the 250 KB ceiling |
| Head Swap seam position | measured **50.0%** of tile width, on the nose bridge |
| Draw It In seam position | measured **25.7%** of tile width, through the drawn woman's face |
| Plate registration (Head Swap) | mean abs diff **0.49/255** between `t2i_008` and `flowHeadSwap_002`, changed bbox **x 771–943, y 122–267** — the head and nothing else, which is the property the before/after device depends on |
| Which after-plate | `flowHeadSwap_002`, not `_001`: `_001` keeps a grey goatee the shipped hero's second half does not have |
| Read at tile size | both rendered at **220 px** under the grid's real idle filter (`saturate(.92) brightness(.92)`) and compared against the shipped pair and their neighbours |
| Accent colours | **sampled**, not chosen — bar `#FF5FA2` (~(248,100,162) off the shipped tile), blob flat `#E0436B` (63,121 pixels of one exact value, so the fill is flat rather than the drawing's soft alpha) |
| Board | `validate_board.py` exit 0 |

## Not done, deliberately

Heroes untouched. Both `.mp4`s and `js/data/flowsRegistry.js` are unchanged —
the filenames did not move, so the descriptors already point at the new bytes.

One consequence worth knowing: the Head Swap tile is now a tighter crop than any
frame in its own hero, so tile and hero no longer share a literal frame. Offered
to re-cut the hero's wipe to match; not asked for.
