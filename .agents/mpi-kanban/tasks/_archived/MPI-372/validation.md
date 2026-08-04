# MPI-372 Validation

Status: **USER-VERIFIED LIVE 2026-07-28 — "it all seems to work just fine now."**
Card closed to done. Both rounds below are complete; the Round 2 defect list is the
record of what the first cut got wrong, not open work.

## What shipped

One branch in `mountOptions()` in
`js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` (13 lines).
No new component, no CSS change, no other file touched.

```js
if (_isMaskTool(mode)) {
    _mountPromptBoxIfNeeded({ force: true });
    _pb?.el?.show();
} else {
    _pb?.el?.hide();      // unchanged behaviour for every other rail tool
}
```

## The finding that made it a 13-line change, not a redesign

The brief called the canvas/preview swap the design problem. It is not a display
requirement — it is a **VRAM optimisation**. `MpiCanvasViewer.swapToPreview()`
destroys `MpiCanvas` to release its GPU texture backing (~100MB per 4K image per
the `el.destroy` comment) and mounts `MpiMaskedImagePreview`: two `<img>` in a
CSS-transform stack, explicitly "no canvas GPU backing".

`MpiMaskedImagePreview` renders image + mask overlay. `MpiCanvas` renders image +
mask overlay **and is paintable**. The preview is a strict subset. A mask tool
already keeps the canvas mounted and already draws the mask, so the resolution is
to **not swap at all** — the coupling was never `prompt ⇒ preview`, it was
`no canvas tool ⇒ cheap surface`, and that job is untouched.

Consequences, all verified below:

- `--prompt-active` stays OFF for mask tools, so `#right-top-slot` keeps hosting
  the mask panel — the PromptBox and the tool options are both live.
- Run reads the mask from the **live canvas** (`el.hasMask()` /
  `el.getCurrentMaskDataURL()` both branch on `_previewInst` and fall to the live
  `maskCanvas`), so it is fresher than the old `_previewMaskCache` path.
- Ops unlock live while painting — `mask-ready` / `mask-clear` already call
  `_refreshOpOptions()`.
- New mask tools inherit this free via `_isMaskTool()`; Shapes (MPI-368) and Text
  (MPI-361 Phase B) need no work here.

Two risks checked and cleared before the edit:

- **Hotkeys vs the prompt textarea** — `HotkeyManager` already gates on
  `isTextEntryElement()` (`HTMLTextAreaElement` → `isTyping`), so typing a prompt
  cannot fire brush/eraser keys.
- **Canvas refit** — `#prompt-box-mount` is a flex sibling of `<main>`, not an
  overlay, so a visible PromptBox genuinely shortens the canvas. `MpiCanvas` owns
  a `ResizeObserver → this.resize()`, so it refits. **This is the one thing that
  is a judgement call, not a bug: less canvas height while masking.**

## Automated — PASS 2026-07-28

`npx eslint` on the touched file: **0 errors**.

Driven against the **running dev app** at `127.0.0.1:3000` (headless Chromium,
real project, real image group, real rail clicks) — **13/13 PASS**:

| Mode | PromptBox | Surface | `#right-top-slot` |
|---|---|---|---|
| `prompt` | visible | preview, canvas released | empty (unchanged) |
| `maskDetect` | **visible** | **canvas, not preview** | mask panel present |
| `maskPoints` | **visible** | **canvas, not preview** | mask panel present |
| `crop` | hidden | canvas | tool panel present |
| `crop → maskDetect` | **visible again** | canvas | mask panel present |

No page errors. `--prompt-active` confirmed absent on both mask tools.

**NEGATIVE CONTROL** — same harness against `git show HEAD` (pre-change) file:
**10/13**, failing exactly and only the three PromptBox-visibility checks
(`maskDetect`, `maskPoints`, `crop → maskDetect`). The other ten pass unchanged,
so the harness is measuring the change and nothing else. File restored byte-identical
after the control run.

Harness (throwaway, scratchpad only): `mpi372-check.cjs`.

---

# Round 2 — five defects the user found on first use

User verdict on the space trade: **acceptable** ("the prompt box is slim exactly for
that reason"). Then five defects, four of them made reachable by the change itself.
The user also supplied the key lead on the first one.

| # | Symptom | Root cause |
|---|---|---|
| A | Picking an op in the strip jumps the rail to Prompt | `workspace:set-operation` force-set `setMode('prompt')` |
| B | Op strip never unlocks the mask-only ops | mask state was published **only on tool exit** |
| C | Clicking the entry the mask lives on wipes the mask | `loadEntry` sameEntry skips the persist but still restores from stale TEMP |
| D | No brush on the new entry after a masking op | `_reloadViewerWithEntry` cleared the mode **before** `loadEntry` could preserve it |
| E | Op strip covers the last history card | nothing reserved the 35px the strip hovers over |

**A — the op strip yanked the canvas away** (user's own diagnosis, confirmed).
`MpiPromptBox._refreshOpStrip` routes every strip click through
`Events.emit('workspace:set-operation')`, and the Block's handler force-called
`historyTools.el.setMode('prompt')`. From a mask tool that runs `swapToPreview()`,
which **destroys the canvas** — brush gone, strokes collapsed to a flat preview.
First fixed by gating on `_isMaskTool`, then — on the user's call — **deleted outright**,
because the grep says the whole mechanism is vestigial:

- `workspace:set-operation` has exactly **one emitter**: `MpiPromptBox._refreshOpStrip`.
  The radial does not emit it. `RADIAL_ITEMS` in `js/shell/navigation.js` is
  `[{ action: 'models' }]` for BOTH gallery and history — the radial carries no
  operations at all any more, so the "Radial → operation sync" comment was stale.
- The strip lives *inside* the PromptBox, so by the time the event fires the box is on
  screen by construction. There is no reachable state where the workspace must change
  tools to serve it.

So the handler now just validates the op against live context and sets it. The Block
keeps the validation — the strip is a second view of this state, not a source of truth.
Swept the other `setMode('prompt')` call sites: the frame-grab one is behind
`if (!isVideo) return;` and can never collide with an image-only mask tool (classified,
not changed); `MpiGalleryBlock`'s handler never forced a mode (nothing to do).

**B — mask state was published only on tool exit.** `evaluateMask()` had exactly two
callers: `MpiToolOptionsMaskDetect.destroy` and `MpiToolOptionsMaskPoints.destroy`.
Painting emitted nothing. That was sufficient while the PromptBox was hidden for the
whole life of a mask tool — you always left the tool before you could see the strip.
With the box live, the strip has to unlock on the stroke that *creates* the mask.
Added the missing publisher: `InputController._endMaskStroke()` →
`MpiCanvas onMaskStrokeEnd` → `MpiCanvasViewer._publishMaskState()` → the existing
`evaluateMask()` → the existing `mask-ready` handler. No new event bus. Emits only on
a flip, so it is one signal per transition, not one per stroke. Space-cancel routes
through the same helper so an interrupted stroke still publishes.

**C — re-clicking the active entry wiped live paint.** `loadEntry`'s `sameEntry`
guard correctly skips persisting (so a fresh empty canvas can't overwrite a good TEMP
mask at mount) but then still ran `_showEntry` + `_restoreLayers`, restoring a TEMP
that predates the strokes. Fixed by returning early when the same entry is already on
a live canvas *with content* — the mount case has an empty canvas, so it still falls
through to the load path it needs.

**D — the tool disarmed on every finished result.** `_reloadViewerWithEntry` called
`viewer.el.exitMode()` and *then* `loadEntry`. `loadEntry` captures the active mode and
restores it after the image swap, so pre-clearing it threw that away: the rail still
showed an armed mask tool over a canvas in mode `none`. Harmless while every Run came
from prompt mode; reachable the moment Run works from inside a mask tool. Fixed by
dropping the pre-emptive exit and re-arming from the rail afterwards, through a new
`_syncViewerToolMode()` that `entry-selected` now shares — the two reload paths had
already drifted once and can no longer.

*Behaviour change worth naming:* a generation finishing while **crop** is active now
also leaves crop armed (it used to silently disarm). Consistent with the rail, but it
is a change; say so if you want crop excluded.

**E — 35px of strip over the history list.** Measured live: the strip is 35px and sits
at the bottom of the right column. Added `padding-bottom: 2.5rem` (40px) to the
scrolling column.

## Automated round 2 — PASS 2026-07-28

eslint on all five touched files: **0 errors**. **21/21** against the running app.
The two that read as direct measurements of the user's report:

```
ops before paint: ["i2i","depth","upscale"]
ops after  paint: ["i2i","depth","upscale","detail"]     <- B
picked op "depth" -> rail=Detect                          <- A
canvas activeMode: mask -> mask                           <- D
```

**NEGATIVE CONTROL** — all five files reverted to `HEAD`: **12/21**, and every one of
the five defects reproduces with the symptom the user described:

```
FAIL  A — rail STAYS on the mask tool     — rail=Prompt
FAIL  A — canvas NOT swapped to preview   — canvas=false preview=true
FAIL  B — op strip unlocks mask-only ops  — 3 -> 3 enabled
FAIL  C — mask survives re-clicking the entry it lives on
FAIL  D — canvas stays in mask mode       — before=none after=none
FAIL  E — right column reserves strip height — pad=0 strip=35
```

All five files restored byte-identical after the control run.

Fix D is exercised through `gallery:item-updated`, which is the *same*
`_reloadViewerWithEntry` path `generation:complete` uses — a real GPU generation is not
runnable headlessly, so **the end-to-end "Run a masking op and paint on the result"
still needs the user.**

## Still needs the user — UI/UX judgement

1. ~~**The space trade.**~~ **ANSWERED 2026-07-28: acceptable.** The prompt box is
   slim by design.
2. **Run a real masking op end to end** — the one thing no harness covers. Paint,
   Run from inside the mask tool, and when the result lands: the brush must still be
   there on the new entry, with no click on the history card first.
3. **The op strip unlocks as you paint** — mask-only ops (detail / inpaint) light up
   on the stroke, not on a tool switch.
4. **Picking an op keeps you where you are** — the rail stays on the mask tool and the
   canvas is not swapped out.
5. **Clicking the entry the mask lives on keeps the mask.**
6. **The last history card clears the op strip.**
7. **Both mask tools.** Detect and Points behave the same.
8. **No regression on the other rail tools.** Crop, Resize, Upscale, Remove Background,
   Interpolate, Export GIF still hide the PromptBox. Note crop now stays armed after a
   generation finishes — flag it if that is unwanted.
9. **Video history unchanged** — the mask branch is image-only; video never had a
   canvas to swap.

## Docs drift (needs permission per CLAUDE.md rule 5)

`docs/masking.md` (at 199/200 lines) and `.claude/rules/component-events-blocks.md`
both describe the mediator's `prompt` special case. Neither is updated yet —
ask the user before touching the rule file.
