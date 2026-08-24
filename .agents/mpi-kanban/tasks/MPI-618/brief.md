# MPI-618 — Draw It In: the subject lands cropped, so nothing casts a shadow

Carded out of **MPI-567** (done, 2026-08-24). The root cause was found and evidenced there
and deliberately **not** fixed, because it is a prompt-behaviour change that needs its own
live run. Fabio: address it in a fresh session.

**Run `/mpi-add-flow`? No.** This is a change to an existing shipped flow's graph, not a new
one. Read `docs/playbooks/add-flow/existing-flows/scribble-to-object.md` (the flow's own doc)
and `docs/blending-into-a-photo.md` first.

## The chain

```
#17  Input_Positive          what the user types in "What did you draw?"
      ↓
#18  Append Clean Background  StringConcatenate — bolts on a FIXED suffix:
     "isolated object on a plain white background, centered,
      full object in frame, product shot, no scenery, no ground, no shadow"
      ↓
     the RENDER phase prompt (SDXL + ControlNet reading the drawing)

#103 Blend Instruction        the Klein edit prompt — asks for contact shading
                              and a cast shadow that follows the scene's light
```

## The bug

`full object in frame` is the only clause asking for full-body framing, and it **loses to
SDXL's portrait prior**. A prompt like *"a Latina in a red dress at the beach"* comes back
framed at the shins. No feet → no contact point → `#103`'s contact shading has nothing to
ground → no shadow. The model is not refusing; it was never given a place to put one.

Today the flow silently requires the user to know to type *"A full body far shot of…"*
themselves. That is the thing to remove.

## Evidence — it is FRAMING, not a LoRA

Fabio's first read was that a style LoRA was suppressing the shadow. The graph record from his
2026-08-23 live session disproves it:

| run | LoRA | prompt | good? |
|---|---|---|---|
| 011, 012 | with | old | no |
| **013** | **none** | old | **no ← the control** |
| 015 | — | new (*"A full body far shot of…"*) | yes |

`013` ran with no LoRA on the old prompt and was still wrong. Only the prompt change fixed it.

**The counter-example is useful:** run `008`'s reptile DID get a proper cast shadow on the
sand. A creature on two legs with a tail reads as full-body to SDXL without being asked, so
the suffix was never tested against the prior. Any fix should still be checked against a
*human* subject, which is where it fails.

## Two things NOT to do

- **Do not remove `no shadow` from #18.** It is correct. The render phase must return a clean
  cutout; every shadow is the blend phase's job. Deleting it puts a baked-in shadow into the
  cutout that then fights the scene's real light.
- **Do not chase shadow DIRECTION by prompting.** `docs/blending-into-a-photo.md` already
  records that telling the model where the light is makes it *worse* — which is why the box
  step asks for room and never for light direction. Separate, known limit.

## Definition of done

1. `#18`'s suffix strengthened so a plain *"a woman in a red dress at the beach"* returns a
   full-body subject with feet, in **both** workflow twins
   (`comfy_workflows/flow_draw_it_in.json` and `comfy_workflows/raw/flow_draw_it_in.json`).
2. **A live run proves it** — this is a prompt-behaviour change, so validation alone passes
   the bug. Needs Fabio's GPU or a Pod. Test a human subject specifically; the reptile passes
   either way and will hide a regression.
3. Do not overshoot into a literal product shot — the suffix already says `product shot`, and
   pushing framing harder can flatten the subject's pose. Judge by eye.
4. `npm test` **and** `npm run test:desktop`. The node suite alone is not the CI gate.

## Watch the raw twin

`comfy_workflows/raw/flow_draw_it_in.json` must be edited **by line, surgically**. Re-serialising
it with `JSON.stringify` collapses `1.0 → 1` and `0.0 → 0` across unrelated nodes and turns a
one-line change into a 26-line diff. (`git checkout --` is hook-blocked; recover with
`git show HEAD:<path>`.)

## Sibling open question

MPI-567 also left **the box step's whole-image default** unresolved, and **MPI-596**'s open
question 1 is the same question from the other side. Whoever picks up either should answer both.

## Ownership

`files.json` is not written yet — at creation it is a guess. Whoever moves this card
`todo → doing` writes it, and it will be at least the two workflow twins.

---

## Shipped 2026-08-24 — code done, LIVE RUN is the open gate

**Node #18's suffix, both twins** (`comfy_workflows/flow_draw_it_in.json` and
`comfy_workflows/raw/flow_draw_it_in.json`, one line each — the raw twin edited surgically, no
reserialisation):

```
- isolated object on a plain white background, centered, full object in frame, product shot, no scenery, no ground, no shadow
+ full body far shot, entire subject in frame from head to toe, zoomed out with empty margin on all sides, isolated on a plain white background, centered, product shot, no scenery, no ground, no shadow
```

Three deliberate choices, reasoning in
`docs/playbooks/add-flow/existing-flows/scribble-to-object.md` § The framing suffix:

1. **Framing leads the suffix.** The suffix is appended AFTER the user's words, so its own tail
   is already the weakest slot in the prompt. `full object in frame` sat at position 4 of 7 —
   which is most of why it lost to the prior, independent of its wording.
2. **`subject`, not `object`.** "Object" is precisely the word that does not read as a body, and
   the flow was renamed away from it for the same reason.
3. **`no shadow` / `no ground` / `product shot` all kept**, per the two DON'Ts above. Framing was
   strengthened by ADDING vocabulary, not by trading any of the cutout clauses away.

**Tests:** `npm test` 729/729 green. `npm run test:desktop` 26/26 green.

### Still OPEN — DoD item 2, and it is Fabio's

**The live run has not happened.** An agent cannot dispatch this flow: it needs a photo, a
painted layer and a box drawn through two gizmo steps, and the connector's generation route does
not take media inputs. Needs Fabio's GPU or a Pod.

**Test a HUMAN subject** — plain *"a woman in a red dress at the beach"*, no "full body" typed by
hand. The reptile (run `008`) passed under the OLD suffix and will hide a regression.
Judge item 3 by eye at the same time: the suffix already says `product shot`, so watch that the
added framing has not flattened the pose into a literal catalogue stance.

### A SECOND defect found while tracing — deliberately not fixed here

Node **#19** is titled `Input_Negative` and carries a baked
`blurry, low quality, watermark, text, multiple objects, cropped`. This flow declares **no**
negative field, so `_buildParams` sends `Input_Negative: ''` and `_inject` writes it — the baked
negative, `cropped` included, **never reaches the sampler on any run**. Identical to the defect
MPI-594 found on Outpaint, whose fix was to leave the node untitled.

Left alone on purpose: the KSampler is `lcm` at **cfg 1.5**, where negative conditioning barely
steers, so it buys little — and shipping it here would have made the one live run a two-variable
test of a prompt-behaviour change. Fabio's call whether it earns its own card.

### Pre-existing, not touched

`docs/playbooks/add-flow/existing-flows/scribble-to-object.md` was already 291 lines (over the
200-line budget, and not on `docs/README.md`'s exemption list) before this change; it is now 351.
Flagged, not split — splitting it is not this card's job.
