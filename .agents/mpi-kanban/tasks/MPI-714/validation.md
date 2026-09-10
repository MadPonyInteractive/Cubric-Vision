# MPI-714 validation

## The finding

SAM3 prompted `face` / `head` returns a mask with the lips and teeth punched out. Neither
widget that looks like the fix reaches it:

- `threshold` gates a detection **score** — which objects survive the pick. It never decides
  which pixels a kept mask covers.
- `refine_iterations` **cannot carve**. `_refine_mask` returns
  `((full_mask[0] > 0) | (coarse_full[0] > 0))` — `comfy_extras/nodes_sam3.py:84`. The SAM
  decoder's output is unioned with the coarse mask, so refinement only ever adds; at 0 the
  same coarse mask returns via `_coarse_fallback`, hole included.

So the hole is in the detector's own concept mask, and the fix is downstream (fill it) or
upstream (name it in the vocabulary) — never on the node.

## Docs written

| File | Change |
|---|---|
| `docs/masking-sam3.md` | New bullet in the text-masking **Behaviour you must not "fix"** list: the two dead ends with their line references, then the enclosed-hole (`MpiMaskFillHoles`) vs bite-out-of-silhouette (`head, hat, mouth`) split, and why the two are not alternatives. Also **corrects** the standing "detector masks come back clean" line — true at the edge, false on the inside — which read as a blanket claim and is what made this a surprise. |
| `docs/masking-adjust.md` | Five lines under the MPI-431 Fill Holes ruling reconciling the new node with it. |

## Why the second file was in scope

`masking-adjust.md:131` carries a standing ruling — MPI-431 turned `mask_fill_holes` off in
every raw template, "the app is now the only thing that closes a hole", and it names its own
future sweep: *"who else closes a hole without being asked"*. A node pack that gains a
hole-filling node is precisely what that sweep hunts, and the sweep reads **that** file, not
the SAM3 one. Documented only in `masking-sam3.md`, the node would be found and removed by a
future session doing exactly what the doc told it to.

It is not a third copy, and the ruling's own wording is why: MPI-431 banned hole-filling that
runs **by default** — on inside raw templates, and a second private copy in
`compositeThroughMask()`. `MpiMaskFillHoles` fills nothing unless an author places it, on a
branch they chose, repairing a mask the app never drew. The doc names the line that would
change that: a flag on an existing node, or a default in a shipped template.

## Budget

`masking-adjust.md` is **208 lines against the ≤200 rule** (CLAUDE.md, Cardinal Rule 2). It
was already at 202 before this edit; my addition is +6, trimmed once from +7. Not fixed here —
trimming another card's doc to pay for this one is not a surgical change. Flagged to the user.
`masking-sam3.md` is 194, inside budget.

## Workflow sync — `flow_character_sheet`

Diff of the converted output against the shipped twin, whole file, 64 nodes:

| | |
|---|---|
| ADDED `893` | `MpiMaskFillHoles` — `{max_hole_size: 0, mask: ["755", 0]}` |
| CHANGED `757` | `MaskComposite.source` `["755",0]` → `["893",0]` |

Nothing else moved. `verify-workflow.mjs` ✓, `validate-injection-rules.mjs` ✓.

**The vocabulary did NOT change.** `face, hat, moustache` was already at HEAD in both `raw/`
and the runtime twin — checked with `git show HEAD:`. The only edit was splicing the node in.

### Converted against the wrong port, deliberately, and proved harmless

`converters.md` requires 48188 (the app engine). **48188 is down** (no listener), and it would
`404` on `MpiMaskFillHoles` regardless — the pinned MpiNodes predates the node. 8188 (the bench)
has it because `G:\ComfyUi\ComfyUI\custom_nodes\ComfyUi-MpiNodes` is a **symlink to the working
tree** at `C:\AI\Mpi\ComfyUi-MpiNodes`, which is how it was authorable at all.

The doc's warning is that a bench-vs-engine schema gap silently mis-maps widgets and still
reports OK. Answered empirically rather than assumed: the full converted output was diffed
against the shipped twin and the delta is only the two intended changes above. No collateral
remap in this graph.

### Open window — the one thing to watch

`comfy_workflows/flow_character_sheet.json` now names a `class_type` **no released engine has**.
Nothing guards this automatically: `engine-drift.mjs` compares one pin against another, so it
flags this graph only once the pin MOVES; it has no "graph names a class the current pin lacks"
check. `verify-workflow.mjs` would catch it, but only run against 48188, which is down.

The window closes when MpiNodes is released, pushed, and `dev_configs/node_lock.json` bumped.
Proof it is closed — with the app engine running:

```bash
COMFY_URL=http://127.0.0.1:48188 node scripts/verify-workflow.mjs comfy_workflows/flow_character_sheet.json
```

## Shipped

Everything above landed. `dbc6a74c` in Vision (pin `287edb83` → `a1890c86`, both docs, both
halves of `flow_character_sheet`), pushed to `master`. MpiNodes 1.2.12 released and on the
public registry. Pin == `origin/main` HEAD.

The bump carried **seven** classes, not the "six" the `dbc6a74c` commit message says —
`MpiPacker2` and `MpiUnpacker2` are two, and `NODE_CLASS_MAPPINGS` gained 7 keys. Caught by the
claim auditor after the push; the message is not being rewritten on a shared tree.

## Not done

The node has still never run in a live graph. The checks behind it are synthetic masks
(`ComfyUi-MpiNodes` MPI-7 `validation.md`), not a SAM3 output — the user confirmed it works in
their own graph, which is the only real-world evidence on record.
