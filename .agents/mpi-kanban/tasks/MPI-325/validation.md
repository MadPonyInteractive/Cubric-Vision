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

## Nodes pack SHIPPED - pushed + pinned 2026-08-17

The pack was committed but local-only, and `comfy_workflows/flow_head_swap.json:281`
already sends `pad: true` to `MpiBoxCrop`. ComfyUI ignores an input a node does not
declare, so an unpinned engine would have taken the drag off-frame and quietly handed the
model the intersection - a squashed reference head, no error anywhere.

**Why nothing local surfaced it - and the reason written in the handoff was WRONG.** The
handoff said the dev machine symlinks the pack so the drift check skips it. That junction
was deleted 2026-08-08 along with the `_devMode` skip in `checkUniversalWorkflowDepsStatus()`
(`routes/shared.js`, `.claude/rules/comfy_engine.md` § Engine Split) - the app engine is a
USER REPLICA and drift-checks the pin like anyone else. The real cause was `skipLocalEngine`
skipping the WHOLE boot gate, dep check included, so the repair never ran across six boots.
CLAUDE.md and the `mpi-nodes-sync` skill both carried the stale claim and were healed here.

Fabio authorized the push. Closed as one chain, each link proven:

| Link | Evidence |
|---|---|
| pushed | `fe812d4..38b3a27  main -> main` (the pack's branch is `main`, not master) |
| on the remote | `git ls-remote origin main` -> `38b3a27a2d32b3522d27bc3de3aa8053d578020d` |
| GitHub serves it | `gh api repos/MadPonyInteractive/ComfyUi-MpiNodes/commits/38b3a27a...` returns the commit |
| the pushed tree declares the input | `git grep '"pad"' 38b3a27 -- '*.py'` -> `img.py:593  "pad": ("BOOLEAN", {"default": False,` |
| Vision pins it | `dev_configs/node_lock.json` `nodes.ComfyUI-MpiNodes.commit` = `38b3a27a2d32b3522d27bc3de3aa8053d578020d` (was `fe812d47...`, the commit BEFORE the pad node) |
| no stale copy of the old SHA | `grep -rn fe812d4762 dev_configs/` -> none |

Note for anyone re-treading this: a plain `curl` of the GitHub archive URL returned
`000`/exit 43 from the agent shell, which reads as "the SHA is not there" and is not -
`gh api` reached it immediately. Do not diagnose a pin from a bare curl here.

The pin is the released-engine half of this card. One item remains.

## GPU run - PASSED 2026-08-17, and it exercised BOTH fixes at once

Fabio ran a real Head Swap through an overhanging box on his own app once the GPU
freed up. His verdict on the delivered image: **"the result is good. There is no padded
strip."** That is the pass condition - a strip would have meant something padded the
SOURCE, which this design deliberately avoided on the target path.

Ground truth for the graph half, read from the engine's `/history` on port 48188 (the graph
the app actually INJECTED, not the one it intended to). These are runtime values - no file in
the repo carries them, so re-read `/history` rather than expecting a test to assert them:

| Node | Dispatched |
|---|---|
| `MpiBoxCrop` #89 | `{"pad": true, "image": ["81",0], "mpi_box": ["88",0]}` |
| `Input_Box_2` (reference) | `width 1354, height 1354, x -267, y -5` |
| `Input_Box` (target) | `width 199, height 199, x 214, y 211` |

Three things this single run proves that no local check could:

1. **`pad: true` was NOT dropped.** ComfyUI silently discards an input a node does not
   declare, so its presence in the executed graph is positive proof the engine is on
   `38b3a27` - the pin took effect end to end.
2. **The reference box exceeded the image WIDTH** (1354 on a 768-wide source) and sat at
   a **negative origin on both axes** (`-267, -5`). The size cap and the position
   overflow were both exercised in one dispatch.
3. **The target box stayed inside the frame** (199 at 214,211), which is why the
   delivered image has no strip. The asymmetry held in practice, not just in theory.

## Still open - one item, cosmetic, not yet seen live

The Settings switch for `skipLocalEngine` (below) greys out once an engine is installed,
and a stale flag clears itself at boot. Both are covered by tests, neither has been seen
in the running app - Fabio's flag was still set when this was written, so his NEXT app
start is the check: the switch should be greyed, and `[shell]` should log
`skipLocalEngine cleared`.
