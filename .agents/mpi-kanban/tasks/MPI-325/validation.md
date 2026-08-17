# MPI-325 Validation

## Automated — PASSED 2026-08-17

| Check | Result |
|---|---|
| `npm test` | **625/625 pass**, 0 fail (6 new in `tests/box-overflow.test.cjs`) |
| `npx eslint js/` | clean, exit 0 |
| `node scripts/validate-injection-rules.mjs comfy_workflows/flow_head_swap.json` | conforms |
| `MpiBoxCrop` pad branch, on real torch | **5/5 OK** — engine python, see below |

### The node's pad branch, proven on tensors

Run under `engine/ComfyUI_windows_portable/python_embeded/python.exe` against a
1792x1120 tensor — the real Head Swap shape:

| Case | Result |
|---|---|
| box fully inside, `pad` on vs off | byte-identical (`torch.equal`) — pad is a NO-OP inside the frame |
| overhangs RIGHT by 256px, `pad` off | `(1, 716, 460, 3)` — the squashed reference head this card exists to kill |
| same box, `pad` on | `(1, 716, 716, 3)`, kept pixels unchanged, pad = the last real column replicated |
| **NEGATIVE origin** `x = -200`, `pad` on | `(1, 716, 716, 3)`, left pad = column 0 replicated |
| two edges at once (top-left corner) | `(1, 716, 716, 3)` |
| box fully outside | image passes through, `w == 0` — unchanged by this work |

## Live — isolated app, port 54629, PASSED 2026-08-17

Own profile + own port (`npm run app:isolated`); the user's `:3000` session was never
touched. A temporary probe module mounted the REAL `MpiStepBox` twice and dragged the box
with **real pointer events** through cropTool's own handlers — not by calling a helper —
then the module was deleted and the process TREE killed (root PID confirmed as
`launch-instance.mjs` before killing, so the user's app could not be hit).

| | `overflow` OFF (default) | `overflow: 'allow'` |
|---|---|---|
| stage padding | `0px` | `48px` (`--s-6`) |
| overlay canvas | `400x250` — exactly the media | `496x346` — media + 2x48 |
| image offset inside canvas | `0px` | `48px` — real room for an off-frame box to draw into |
| box before drag | `x: 75, 250x250` | `x: 75, 250x250` |
| **box after dragging hard left** | **`x: 0`** — clamped, unchanged behaviour | **`x: -125`** — negative origin |
| still square | yes | yes, `250x250` — size survived the overhang |

`-125` is exactly `-w/2`: the half-its-own-size bound held to the pixel, so the box's
centre stays over the image however hard it is dragged. Browser console: 0 errors,
0 warnings.

## User-verified in the real app — 2026-08-17

Fabio drove Head Swap step 03 "Reference head" and dragged the box off the **top-right**
corner. Confirmed from his screenshot:

- The box hangs past both the top and right edges and is **drawn into the stage margin** —
  border and handles both live outside the image, which is the half of this that makes the
  overhang judgeable rather than guesswork.
- Readout stays **`642 x 642`** — square survived the overhang, so the reference crop is the
  size that was asked for.
- The scrim still stops at the image bounds, so the off-frame region reads as outside-the-
  picture rather than as part of the selection.

That closes the `user-ux` verify mode. The card stays `validating` on the two non-code
blockers below, not on anything about the interaction.

## NOT verified — needs a GPU run, which Fabio ruled out for this session

A real Head Swap generation through an overhanging box. Everything up to the graph
boundary is proven (the app emits a negative origin; the node pads it back to square on
real tensors), but the two have not been run as one pipeline.

When it is run:
1. Head Swap, box a head so the square hangs off an edge, Generate.
2. The reference head must come back square and un-squashed.
3. The target's mask must clip flush to the edge — **no padded strip on the delivered
   image**. A strip there means something padded the source, which is the failure mode
   this card deliberately avoided.

## Blocked on the user

`ComfyUi-MpiNodes` is edited but **not pushed and not pinned**. A node change ships only
when committed -> pushed -> pinned in `dev_configs/node_lock.json`; the dev machine
symlinks the pack into `custom_nodes`, so local work verifies with no pin and the drift
check stays quiet. Push is a user-authorized live op.

Until it is pinned, a user on the released engine gets `MpiBoxCrop` without `pad`, and
`comfy_workflows/flow_head_swap.json` now sends `pad: true` to it. ComfyUI ignores an
input a node does not declare, so the crop silently falls back to the intersection — the
old behaviour, not a crash. **The gizmo would let them drag off-frame and quietly hand
the model a squashed reference head**, so the pin is not optional dressing; it is what
makes this card's app half safe to ship.
