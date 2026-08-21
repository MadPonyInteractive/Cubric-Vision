# Place — a composite tool that stamps an image onto the current entry

Design is settled: [brief.md](brief.md) plus the 14 acceptance lines on the card. This plan
carries **no unresolved decisions** — the four that were open at brainstorm close were
resolved by inline investigation and are recorded below.

## Current State

Project mode: `scalable-foundation`.

`placeComp` is a THIRD front end on a system that already exists. Nothing here is new
machinery; the work is wiring plus one gizmo. Verified in the codebase at plan time:

| Assumption | Verified |
|---|---|
| `_viewerModeFor()` already maps any `_COMPOSITE_TOOLS` member to `'composite'` | `MpiGroupHistoryBlock.js:160-164` — **one Set entry, no branch to add** |
| Rail Composite group takes a third button with no structural change | `MpiHistoryTools.js:128-141` — a flat `group: []`, not a collapse |
| `TOOL_OPTIONS_REGISTRY` already registers one component under several keys | `MpiGroupHistoryBlock.js:86-113` (`maskComp`/`paintComp` → one panel) |
| Server half needs no change | `compositeOverlay()` at `services/imageComposite.js:170`, `POST /project/apply-paint` at `routes/projects.js:2415` |
| Paint layer caps at 4096 | `PaintManager.js:39` — the known ceiling, see Preservation Notes |
| `MpiMediaPicker` unifies project media + disk import behind one control | `MpiMediaPicker.js:14-21`, already consumed by `MpiBaseFlow.js:667` |
| BiRefNet ships with the engine, no download gate | `assetDeps.js:333-346` (`engineAsset`) |

### Decisions resolved during planning — do NOT re-litigate

**1. How Remove Background runs on the SLOT image without polluting anything.**
`_runImageTool()` (`MpiGroupHistoryBlock.js:1494`) cannot be reused: it hardwires the source to
`_group.history[_currentIdx]` and dispatches `scope: 'groupHistory'` with `existingGroup`, so
its result **appends a history entry**. That is the exact pollution the user rejected.

There are only two scopes (`gallery`, `groupHistory`), and neither is right on its own — but
**`deferCommit: true` is** (`generationService.js:1373-1394`, MPI-306's HOLD-UNTIL-APPLY):

> *"with deferCommit the groups are built but NOT persisted — the media + sidecars are already
> on disk, only the project record is withheld. The caller holds them and commits on Apply, or
> simply drops them. Orphaned files are the existing .preview-assets + Cleanup GC path's job
> (MPI-277/227), not a new mechanism."*

That is precisely what the toggle needs: a transparent PNG on disk with a real project-file URL
the canvas can load, committed **nowhere**. Toggle off = drop it and restore the original slot
URL, no second dispatch (acceptance 7). Apply = the placement flattens into one entry; the
cutout stays uncommitted and is GC'd.

**Write a NEW small dispatch helper — do NOT parameterise `_runImageTool`.** It is a shared
primitive meaning *"run an image op on the current entry and append it"*; Place needs *"run an
image op on an arbitrary URL and commit nothing"*. Those are different operations, so this is a
sibling function, not a flag. Adding a source/scope parameter would force a re-check of every
existing consumer (`imageUpscale`, `removeBackground`, the plugin ops at
`MpiGroupHistoryBlock.js:603`) for a code path none of them wants.

**RISK, verify early:** `MpiBaseFlow.js:89` says *"`deferCommit` still exists on
startGeneration for a caller that needs it"* — i.e. it currently has **no live consumer**.
Live-verify the deferCommit path before building the toggle on top of it. If it has bit-rotted,
that is a repair on `generationService.js`, not a reason to fall back to a committing scope.

**2. Third `ShapeManager` kind, or a sibling manager?** Decide by reading `ShapeManager.js`
during Phase 2, as the brief says — but the bar is set here: a placed image is a rotated
rectangle **with a texture**, and if the rect kind's geometry, handles and inverse-rotated hit
testing carry it, reuse them. Do not fork the handle module either way (`ShapeManager` already
imports `CropManager`'s handle set; follow that precedent).

**3. Where the slot image comes from.** Answered — three gestures, see brief § How the slot
gets filled. Not open.

**4. Multiple objects per Apply.** ONE at a time. Apply is cheap to repeat. Do not build a
layer list; if the user asks for one later it is its own card.

### The guard test has a real gap

`tests/mask-tool-registry.test.cjs` hardcodes `COMPOSITE_MODES = ['maskComp', 'paintComp']` and
**subtracts** them so they do not pollute the mask/paint scrapes. It does not guard the
composite family at all. `placeComp` will not collide with the prefix scrapes, so the suite
stays green whether or not the tool is wired correctly — the silent-failure class the test
exists to prevent. Close that gap in this card.

## Implementation

- [ ] **Register the tool and prove it is not dead.** Add `placeComp` to `_COMPOSITE_TOOLS`, to
      `TOOL_OPTIONS_REGISTRY`, to the rail's Composite group, and to `TOOL_LABELS`. Extend
      `tests/mask-tool-registry.test.cjs` with a composite-family guard so a miss goes red
      instead of silent. **Verify:** the new guard fails with the registration removed and
      passes with it; the rail button opens a panel in the running app.
- [ ] **Panel + slot, three fill gestures.** Build `MpiToolOptionsPlace` (slot labelled *"Image
      to place"*, Remove Background toggle, Apply — **no Cancel**, matching
      `MpiToolOptionsComposite.js:161-178`). Add the picker-on-empty-click prop to
      `MpiMediaSlot` keeping it dumb; wire right-click Paste to the existing `_compositeImage`
      accessor. **Verify:** all three gestures fill the slot; Apply is disabled with a hint
      while it is empty (acceptance 13).
- [ ] **Drop routing.** Image mode selects `placeComp` and fills its slot; video mode with the
      video prompt tool active keeps today's chip path untouched; a multi-file drop takes the
      first and toasts the rest. **Verify:** all three by hand in the running app — the video
      case is the regression risk (start/end-frame drops must still unlock the frame-driven i2v
      ops).
- [ ] **Remove Background toggle** on `deferCommit`. Live-verify the deferCommit path FIRST.
      **Verify:** the cutout appears in the slot, no gallery card and no history entry is
      created, and toggling off restores the original pixels with no second dispatch.
- [ ] **Gizmo + preview.** Move/scale/rotate over the selected entry, SHIFT aspect-lock, ALT
      centre-scale, its own scratch layer (never `paintCanvas` — it persists per entry), and
      `discardPreview()` **extended**, never the call site. Undo/redo covers a placement like a
      shape commit. **Verify:** `tests/preview-contract.test.cjs` green; leaving the tool
      restores the single-entry canvas and writes nothing to disk.
- [ ] **Apply.** Rasterise the transform into a full-frame RGBA scratch layer client-side and
      reuse `POST /project/apply-paint` → `compositeOverlay()`; one new history entry at the
      base entry's full resolution, both sources untouched, alpha honoured with no mask
      involved. **Verify:** a background-removed PNG shows the entry through its transparent
      pixels; reload the project and the entry survives.
- [ ] **Docs.** Update `docs/composite.md` for the third front end and the widened slot-origin
      rule (its rationale was already narrowed on 2026-08-21; this is the widening half —
      acceptance 14). **Verify:** the doc names `placeComp` and the 200-line budget is
      respected — see Preservation Notes.

## Completed

- [ ] Nothing yet.

## Remaining Work

- All seven implementation items above.

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux

A drag gizmo, a preview that must feel right, and a blend the user judges by eye. The
non-visual half self-verifies (the registry guard, `preview-contract.test.cjs`, the
no-entry-created check on deferCommit, project reload), but the tool is not done until the user
has placed an object in the running app and looked at it.

Run `npm test` before handing over. Drive a private instance with
`npm run app:isolated` — **never** the user's app on `:3000`.

## Preservation Notes

- **`docs/composite.md` is at 194 lines against the 200-line budget.** This card adds a third
  front end plus a gizmo section and WILL exceed it. Split rather than trim: a sibling
  `docs/composite-place.md` (the pattern `masking-*.md` already follows), with
  `docs/composite.md` keeping the shared operation and routing to it, and `docs/README.md`
  updated. Do not solve this by deleting existing prose.
- `docs/masking-tools.md` § Canvas tool taxonomy lists the Composite group's buttons — update
  the table row.
- Open brief question 4 (does a group holding two hole-cutters and one placer still deserve the
  name *"Composite"*?) is a **user** call. Ask at close-out; do not rename unilaterally.
- Open brief question 2 (does the cut-out need a 1-2px feather so it does not read as a
  sticker?) — `compositeOverlay` takes alpha as given and does not feather. Check what
  BiRefNet's alpha actually gives before adding anything.
- Sibling card **MPI-596** (Object Stamp Flow) is the same capability on the Flow surface.
  Deliberate duplication, zero shared code — do not converge them.
