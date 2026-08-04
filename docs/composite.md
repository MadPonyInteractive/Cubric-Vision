# Composite — one operation, two front ends (MPI-373)

Blend two entries by cutting a hole through the top one. The selected entry is **image 1** and
sits on top; a slot holds **image 2**, underneath. `paintComp` cuts the hole live with the brush;
`maskComp` takes the same hole from the mask already on the selected entry. Read before touching
`js/components/Primitives/MpiCanvas/managers/CompositeManager.js` or `MpiToolOptionsComposite`.
The last card of the MPI-424 umbrella. Related:
[masking-tools.md](masking-tools.md) (the taxonomy and the preview contract this obeys) ·
[masking.md](masking.md) (the layer model) · [masking-undo.md](masking-undo.md) (the entries a
cut records) · [painting.md](painting.md) (the brush engine it borrows).

## Why it replaced the modal

MPI-362 shipped a composite that worked and asked the user to decide blind: select two entries,
one of which had to already carry a mask, then an **Add / Subtract** dialog describing the two
directions in prose. The user's report, 2026-08-01: he ran it three or four times per result,
because the blend was invisible while he was deciding it and changing the selection restarted
the whole thing.

`MpiMaskCompositeDialog`, the `composite-requested` handler and the history list's two-entry
mask gate are **deleted** (user, 2026-08-04) — kept as a "fast path when a mask already exists"
would have left two ways to do one thing, one of them the bad one. **The server side is
untouched:** `_runComposite()` and `POST /project/composite-media` are MPI-362's, and direction
is no longer a question because the selected entry is always the base.

## The layer stack

| Layer | Owner | Persisted |
|---|---|---|
| `manualCanvas` + `subtractCanvas` | `MaskManager` | yes, per entry |
| `paintCanvas` | `PaintManager` | yes, `paint.png` per entry |
| `holeCanvas` + `underlay` | `CompositeManager` | **never** |

**The cut gets its OWN scratch layer** (user, 2026-08-04). Painting it into the mask layers was
the cheap option — free brush, free undo, free export, near-zero new pixel code — and it was
rejected: the mask **persists per entry**, so a composite would silently consume a mask the user
had brushed for an inpaint and leave its own cut behind in its place. A composite is a one-shot
decision about two images, not an annotation on one.

`holeCanvas` is capped at 1536 like the mask and for the same reason (it is consumed AS a mask),
and `getURL()` exports at the source's own resolution, so the cap stays on the paint loop rather
than on the contract with Sharp.

## The brush means the opposite here

The **eraser** erases the top image, which ADDS to the hole. The **brush** paints the top image
back, which REMOVES hole. Every other destination in the app paints what the brush touches; this
one paints what it does not. `CompositeManager.paint()` owns the inversion —
`eraser → source-over`, `brush → destination-out` — so the shared strip stays a table and only
its labels change. Both panels open on the **eraser**, because revealing is the reason the tool
exists.

`dest: 'composite'` is a row in `MpiMaskStrip.DESTINATIONS`, alongside `mask` and `paint`. It is
the first row to drop the **opacity slider** (`opacitySlider: false`): the other two destinations
have a display alpha that means something, but a composite is a hard cut — a slider ghosting the
reveal would make the preview disagree with the file Sharp writes. The row is REMOVED from the
DOM, not hidden, because a class carrying `display` outranks `[hidden]` (MPI-382).

## The reveal costs no scratch buffer

`_renderOverlay()` draws the reveal **first**, while the overlay canvas is still cleared:

```js
this.comp.drawUnderlayCover(ctx, W, H);          // image 2, covering the frame
ctx.globalCompositeOperation = 'destination-in';
ctx.drawImage(this.comp.holeCanvas, 0, 0, W, H); // keep it only inside the cut
```

`destination-in` against a freshly cleared canvas clips the underlay to the hole with no
intermediate buffer and no per-frame allocation — the paint layer and the mask then draw over it
in their usual order. That ordering is also why the reveal is opaque: it shows the result, not a
tinted hint of it.

## COVER, and the two ends that must agree

An underlay that does not match image 1's pixel dimensions is **scaled to cover and
centre-cropped** (user, 2026-08-04). Fit-and-pad was rejected: letterboxing puts a transparent
band inside the frame, so erasing into it would reveal nothing — a preview showing a hole where
the result has image.

**`services/imageComposite.js` was changed to match.** `compositeThroughMask()` resized the
overlay with `fit: 'fill'`, so a mismatched pair would have stretched on disk while the canvas
showed a centre-crop, and the user would approve one image and receive another. It is
`fit: 'cover', position: 'centre'` now — identical to `fill` whenever the aspects already agree,
which is every pair the retired modal was ever used on. `tests/mask-tool-registry.test.cjs`
guards both ends together.

**`fillHoles` stays opt-out.** MPI-437 made it opt-in because an edge-band mask composited as a
solid disc; this route inherits that and passes nothing. Closing a hole is the app's job — the
Fill button in [masking-adjust.md](masking-adjust.md).

## One slot, and where the cut comes from

**Right-click the canvas → Send to Composite** (user, 2026-08-04). The same gesture the Video
workspace offers as *Set as start frame* / *Set as end frame*, and the right one here: the image
you want underneath is usually the one you are looking at. It writes `_compositeImage` in
`MpiGroupHistoryBlock` — app-local, workspace-lifetime, deliberately not the OS clipboard,
because a slot needs a project-file URL the canvas can load. The panel seeds the slot from it on
mount and sees it through a `clipboard` accessor object passed by `mountOptions()` — accessors,
not values, because the panel mounts once and the buffer changes under it. **`Copy image` in the
history list was the first source and came back out**; a filled slot has one origin, not two.

**There is no mask slot.** `maskComp` reads the mask already on the selected entry. The pasted
one was a second, worse way to produce the same pixels — the user already has the whole mask
toolkit (brush, detect, points, text, shapes, adjust) pointed at that exact layer. Reading that
layer is fine; *writing* into it is what the scratch-layer decision above rules out.

`MpiMediaSlot` stays a dumb one-media drop point: a label, a thumbnail URL, a right-click
Paste / Clear whose rows are conditional rather than greyed, a left-click paste shortcut, and
`setValue()` for the mount-time seed. What a filled value MEANS belongs to the panel.

### The hole is an ALPHA layer, and the mask export has two flavours

`MaskManager.getURL()` **with no arguments** exports white-on-transparent; `getURL('black',
'white')` — what every prompt-tool consumer reads — exports OPAQUE black-and-white. Only the
first can feed `holeCanvas`, because the canvas consumes the hole by **alpha** (`destination-in`
in `_renderOverlay`, and `isEmpty()`) while Sharp consumes it by **luminance**. Hand it the
opaque flavour and the canvas cuts the *whole frame* while the server cuts only the white part:
the preview lies, which is the one thing this card exists to fix. `MpiCanvas.setCompositeHoleFromMask()`
is the single caller and picks the overload; `tests/mask-tool-registry.test.cjs` holds it there.

An unpainted mask exports blank, so the hole comes back empty and Apply's gate stays shut on its
own — there is no separate has-a-mask check, and the panel's hint line says why.

## The contracts it obeys

- **The whole preview is scratch.** `discardPreview()` calls `resetComposite()`, which drops the
  cut AND the underlay on the ONE seam, never at the `mountOptions()` call site
  ([masking-tools.md](masking-tools.md) § The preview contract). Leaving the tool restores the
  single-entry canvas, leaves no mask on either entry, and writes nothing to disk.
- **Every cut is undoable.** A stroke is a gesture on the shared `UndoStack`; Clear is a
  layer-wide one-shot. Reading the entry's mask into the hole is a LOAD and records nothing
  ([masking-undo.md](masking-undo.md)).
- **Every path that changes the cut ANNOUNCES it**, through the single
  `setOnCompositeChange` slot the panel claims on mount and clears on destroy. A slot
  rather than a subscription because the panel is rebuilt on every rail switch and
  `instance.on()` hands back no unsubscribe, so listening would leak one per mount.
  **This is not bookkeeping** — it shipped broken on 2026-08-04 and the user found it:
  Apply reloads the entry it just created, `loadImage()` → `comp.init()` wiped the cut,
  nothing told the panel, so Apply stayed enabled over a hole that no longer existed and
  the next press returned silently at its own null guard. No error, no toast, nothing.
  The announcing paths are `loadImage`, `clearComposite`, `setCompositeHoleFromDataURL`,
  `_applyUndo` and the end of a cut stroke; `tests/mask-tool-registry.test.cjs` holds
  each one.
- **`composite` is a canvas MODE, not a flag.** It needs its own brush ownership, exactly as
  `paint` does — that is what `activeMode` decides. (The shape gizmo could be a mere flag
  because it is not a brush and never competes for the pointer.) Adding it meant `CANVAS_MODES`
  in `MpiCanvasViewer` **and** `_viewerModeFor()` in the Block; MPI-375's dead-tool bug was
  exactly one of those two being missed.
- **It is the one group that DROPS the PromptBox.** `_COMPOSITE_TOOLS` is in `_isCanvasTool` (for
  teardown and the mode bridge) but absent from `_modeKeepsPromptBox`. Those two predicates must
  not be collapsed into one — the shortcut hands the box straight back.

## Apply

Panel emits `composite-apply` → the Block calls `_runComposite(baseItem, { filePath: overlayUrl },
maskDataUrl)` → `POST /project/composite-media` → `compositeThroughMask()` → one new history
entry at full resolution. The result never round-trips as base64, and the sources are untouched.
Apply is gated on **both** halves — an image underneath and a cut to show it through — and
renders disabled rather than inert, because a button that swallows its own click is the silent
failure this codebase keeps paying for (MPI-375).
