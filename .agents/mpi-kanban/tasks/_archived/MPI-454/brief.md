# MPI-454 — Place: a composite tool that stamps an image onto the current entry

**UNBLOCKED 2026-08-21.** Read [docs/composite.md](../../../../docs/composite.md),
[docs/masking-tools.md](../../../../docs/masking-tools.md) and
[docs/masking-shapes.md](../../../../docs/masking-shapes.md) before planning this.

> **Redesigned with the user, 2026-08-21** (brainstorm opened against umbrella MPI-562).
> This card now ABSORBS MPI-377, and MPI-562 is closed. Everything below the
> "How the slot gets filled" section is the ORIGINAL brief and still holds — the build
> guidance did not change, only the framing did.

## What the user asked for

> A gizmo with handles like the other gizmos. It moves the image that is in the composite
> window so the user can scale and place it anywhere, then composites that image on top of
> the current entry, creating a new image from the two. So the user can add an object from
> another generation, or a photograph, onto a portion of an existing image. We already have
> Remove Background, so the user can grab any object from the internet, cut it out, send it
> to composite, place it in an already-generated image, create an image from that, and then
> detail it so it matches and blends.

## It is the OPPOSITE STACK of the composite we shipped

`maskComp` / `paintComp` (MPI-373) put the selected entry **on top** and the slot image
**underneath**, and you cut a hole through the top to reveal it. That is the right model when
the two images share a frame — a background swap, a region replacement.

It is the wrong model for placing a cut-out object. There the slot image goes **on top**, at
its own size, at a position the user chooses, and its **own alpha** is the cut — no hole, no
mask, nothing to brush. Same subsystem, same slot, same Apply-makes-one-entry contract;
inverted stack and a gizmo instead of a brush.

Name it `placeComp` and add it to `_COMPOSITE_TOOLS` alongside the other two.

## How the slot gets filled — MPI-377 absorbed (2026-08-21)

**MPI-377's original fix was REJECTED by the user.** It proposed turning the dropped file into
a history entry. An imported photo is not a generation, so that pollutes the group history.
The drop fills a **tool slot** instead, and an entry is written only at Apply — a composite,
which is a legitimate history artifact.

`uploadMediaFile` already returns a project-file URL the canvas can load, so the slot never
needed an entry in the first place. That was the whole of the blocking argument, and it was
wrong.

**Three gestures, two controls:**

| Gesture | Result |
|---|---|
| Drop an image file on the History workspace | selects `placeComp`, fills the slot |
| Click the empty slot | `MpiMediaPicker` — project media **and** import-from-disk |
| Right-click slot → Paste | the existing `_compositeImage` buffer, already seeded by *Send to Composite* — **free**, no new context row |

`MpiMediaPicker` is what makes this two controls instead of three: *"it IS the single entry
point for filling a slot: the upload card is the first cell of the grid, so the user has ONE
button to reach both their own media and the filesystem (settled with the user 2026-08-16,
replacing an earlier two-button split)"* — `MpiMediaPicker.js:14-21`. Adding it is one prop on
`MpiMediaSlot`, which stays dumb: the panel owns the picker.

**This widens a standing decision, deliberately.** `docs/composite.md` says *"`Copy image` in
the history list was the first source and came back out; a filled slot has one origin, not
two."* That killed a **redundant** gesture — two ways to paste the same project entry. A drop
and the picker are different *origins*, not a redundant gesture, and the picker was itself
settled as the unifier. **Update that doc line as part of this card** or the next agent reads
this as a violation.

## The panel

`MpiMediaSlot` (label *"Image to place"*) · **Remove Background** toggle · **Apply**.

**No Cancel.** `MpiToolOptionsComposite` has Apply and nothing else
(`MpiToolOptionsComposite.js:161-178`), and rail-switching away already discards the preview
by contract. Match the sibling.

**Remove Background is a toggle in the panel, not a forced step on ingest.** It runs the
existing `removeBackground` universal op — BiRefNet, an `engineAsset` that installs with the
engine, no download gate (`assetDeps.js:333-346`). Auto-running it on drop was considered and
rejected by the user: it is a **dispatch**, so every drop would pay a queue round-trip, and
the cases that need the full image with its background — filling a monitor screen, swapping a
painting on a wall, a cut-out that arrived already cut out — would pay it for nothing and
have no way back. Toggling it off must restore the original slot pixels with **no second
dispatch**.

## Drop routing — the load-bearing half

- **Image mode** → select `placeComp`, fill the slot.
- **Video mode / video prompt tool active** → today's chip path, **untouched**. Dropping a
  start/end frame is how a user unlocks the frame-driven i2v ops when no media is staged
  (`_isVideoPromptToolActive()`, and the comments at ~217 and ~919 in the Block). Do not strip
  the chip globally to fix an image-mode bug.
- **Multi-file drop** → first file fills the slot, toast names the rest as ignored. MPI-377's
  old *"one entry per file"* acceptance is dead — a slot holds one media.

## Transient was considered and rejected

An earlier turn of the brainstorm had this as a *temporary* mode with no rail button, entered
only by a drop. A registered tool turned out to be **cheaper**: every canvas tool lives in
`_MASK_TOOLS` / `_PAINT_TOOLS` / `_COMPOSITE_TOOLS` folded into `_isCanvasTool`, and
`docs/masking-tools.md` says plainly *"a miss is silent"* — so an unregistered mode means
hand-wiring teardown, `discardPreview` and undo that a normal tool gets for free. Drop-only
entry also locked out project media, which is what surfaced the picker.

Consequence to know: **the Composite group drops the PromptBox** (`_modeKeepsPromptBox`).
Entering Place hides it; it returns when the user leaves to mask and detail. That matches the
intended sequence — place, Apply, *then* mask and detail.

## The lazy build — do not invent a new server route

`POST /project/apply-paint` → `compositeOverlay()` in `services/imageComposite.js` already
does the server half: an RGBA buffer carrying its own alpha, stretched to the base's pixel
size, flattened onto it, one new entry. If the tool **rasterises the transformed image into a
full-frame RGBA scratch layer client-side** — exactly what the paint layer is — the transform
never has to cross the wire and the server needs no change at all.

Known ceiling of that shortcut, write it into the plan rather than discovering it later: the
paint layer caps at `PAINT_MAX_EDGE` 4096 and `compositeOverlay` resizes with `fit: 'fill'`,
so a small object placed on an 8K base is resampled up from a 4096-wide plane and loses
detail. The upgrade path if that shows: pass the placement rect to the server and have Sharp
`composite` the source at its own resolution with `left`/`top`.

**Do not reuse `paintCanvas` itself.** docs/composite.md § The layer stack is explicit — the
paint layer **persists per entry**, so a placement would eat a paint layer the user made for
something else. The cut gets its own scratch layer for exactly this reason; a placement gets
one too, dropped by `discardPreview()` / `resetComposite()` on the one seam.

## Gizmo — import, do not fork

`ShapeManager` already imports `CropManager`'s 8 handles + `body`, its hit radius, its
fixed-screen-size drawing and `getCursor()`, and adds rotation and inverse-rotated hit
testing (docs/masking-shapes.md). A placed image is a **rotated rectangle with a texture** —
the same geometry ShapeManager's rect kind already has. The open question for planning is
whether this is a third `ShapeManager` kind or a small sibling manager that reuses the handle
module; decide it by reading `ShapeManager.js`, not from this card.

`shapeMode` is a FLAG, but `composite` is a canvas MODE — `CANVAS_MODES` in `MpiCanvasViewer`
**and** `_viewerModeFor()` in the Block, both, or the tool ships dead (docs/composite.md,
MPI-375's bug).

## Open questions for the plan session

1. **Multiple objects per Apply, or one at a time?** One is the lazy answer and Apply is cheap
   to repeat. Do not build a layer list unless the user asks for it.
2. **Does the placed image keep a soft edge?** `compositeThroughMask` feathers; `compositeOverlay`
   does not, it takes the alpha as given. A cut-out from Remove Background usually wants a
   1–2px feather to not read as a sticker — check what BiRefNet's alpha already gives.
3. ~~**Where does the second image come from besides the slot?**~~ **ANSWERED 2026-08-21** —
   three gestures, see § How the slot gets filled.
4. **Does the toolbar group need a name change?** Three tools in the Composite group, two of
   them hole-cutters and one a placer.
5. **Does the Remove Background toggle need to survive a slot change?** Toggling it off must
   restore original pixels with no second dispatch (acceptance 7), which means the panel holds
   both versions. Swapping the slot image should reset the toggle rather than carry it — cheap,
   and the alternative is a second BiRefNet run the user did not ask for.

## Sibling card

**MPI-596 — Object Stamp Flow.** The same capability on the Flow surface: SAM3 text extract,
a `kind: 'box'` placement step, a Krea2 detail pass, one dispatch. Deliberate duplication
(`project_flows_are_the_beginner_surface`) — shared control vocabulary, **zero shared code**.
This card is the workspace tool with a real drag gizmo; that one is a form.
