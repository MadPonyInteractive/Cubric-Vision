# MPI-531 — Validation (item 1 slice)

Scope validated: item 1 (`FlowStepField` gains `number` / `slider` / `text`) **plus the
scope extension** it turned out to need — `FlowDef.controls`, declared controls on the run
slide. Items 2–4 are NOT validated here; they are untouched.

## Why the scope had to grow

`fields` render on MIDDLE steps only. The run slide's controls came from exactly one place,
`props.uiComponent` (`MpiBaseFlow.js`), so field types alone would have left MPI-552 as
blocked as before: any Flow needing a prompt still had to ship a JS component. `controls`
closes that with the same vocabulary and the same renderer.

## Evidence

| Check | Result |
|---|---|
| `npm test` | **591/591 pass** (590 before + the new MPI-520 title guard) |
| `npx eslint js/ --max-warnings=0` | clean |
| `node --check` on every edited `.js` | clean |
| Head Swap's `uiComponent` path | untouched — `_flowComponents[flow.uiComponent] \|\| null` unchanged, component still mounts and still wins on merge |

**Live, in an isolated app instance** (own port + own profile; the user's `:3000` untouched),
driving the first Flow authored with NO `uiComponent` (`ltx-extend`, MPI-520):

1. Run slide renders all three declared controls — two `textarea`s (`text`, `rows > 1`) and a
   `range` with its live readout (`slider`).
2. Values reach the run payload, split by id as designed:

   ```json
   { "positive": "the camera pushes in as she turns to leave",
     "negative": "letterbox, black bars, …",
     "injectionParams": { "Input_Duration": 7 } }
   ```

   Read from `state.s_flowInputs` after `_run` persisted it and `submitFlowGeneration`'s
   availability guard aborted — so the payload is proven with NOTHING queued (engine queue
   confirmed empty afterwards). No GPU spent.
3. Reopening the flow restores all three, including the slider — which seeds from
   `injectionParams`, not the top level. That branch exists because `_collectInputs` puts it
   there; without it the control would silently come back at its default after a reopen.

`number` is implemented and typechecked but has **no live consumer yet** — the first will be
extend's width/height once the graph is re-exported (MPI-520 § The width/height decision).

## Not validated

- Items 2 (`steps[].image`), 3 (author every 1.5 Flow declaratively), 4 (port
  `MpiFlowHeadSwap`). The card stays open for those.
- MPI-532 (the 1.6 package format) — deliberately untouched, per the user's steer that
  community integration lands in a later version.

## Flow-frame punch list (2026-08-15, session 2)

Verified in an ISOLATED app instance (`CUBRIC_MODELS_ROOT="G:/CubricModels" npm run
app:isolated` → port 56938, never the user's :3000), driven with playwright-cli against
the real project `1.4 media` (9 hydrated history items: 8 image, 1 video).

### Item 1 — in-app media picker: VERIFIED END TO END

New `MpiMediaPicker` (Compound over `MpiModal`), reached from a new "Choose from
project" button on an empty Flow slot. Scope settled with the user: CURRENT PROJECT
ONLY, filtered to the slot's media type.

Real UI path — `flow:open` → foley frame → slot → browse → pick:

| check | result |
|---|---|
| frame open, slot count | `frame:true, slots:1` |
| browse button present | `browse:true` |
| picker filtered to `video` | `pickerTiles:1` (of 9 items — 8 images excluded) |
| picked payload | the real `.mp4` path, `mediaType:'video'` |
| slot filled after pick | `slotFilledAfterPick:true` |
| picker closed after pick | `pickerClosed:true` |

Image mode separately: 8 tiles, thumbnails REALLY decoded (`naturalWidth:512`, not a
broken-image box).

**Two bugs found and fixed during this verification, both mine:**
1. Nesting was inverted — `el.appendChild(modal.el)` instead of the
   `modal.el.appendChild(el)` precedent in `MpiAddToProject`. `MpiModal` portals ITSELF
   to `document.body`, so content nested inside `el` stayed in the host and `hide()`
   left the dialog on screen (`closedAfterPick:false`). Fixed → now `true`.
2. A first test read `videoTiles:9` — that was a STALE picker from the previous eval
   still in the DOM, not a filter bug. Re-tested clean: 1 tile. Recorded because the
   wrong reading looked exactly like a broken filter.

Data-source check that mattered: `itemGroups[].history[]` holds UUID STRINGS on disk
(`projectService.js:371`), objects only after `reconcileAndHydrate`. The picker reads
`state.currentProject`, so it gets hydrated objects — confirmed live (`hydrated:"object"`,
`hasPath:true`). Reading the file instead of state would have listed nothing.

### Item 4 — dead air on Generate: VERIFIED

The scanline already worked; it was simply never armed until the first latent
(`_setScanline(true)` lived only in `_paintResult`). Armed it in `_setRunning`, the single
owner of run state, so every reset path disarms for free.

124 ms after the Generate click: `scanlineArmed:true`, `emptyHidden:true`,
`status:"Generating…"`, button `"Cancel"`. Cancel then restored
`btn:"Generate"`, `status:"Cancelled."`, `scanline:false`, `active:0`.

Also guarded `_showResults`'s `_setScanline(false)` behind `!_running`: a slide REBUILD
mid-run replays the last result through that function and would have disarmed a sweep the
run still owned.

### Item 2b — muted result video: FIXED (user-reported mid-session)

`_showResults` hardcoded `muted: true`, so foley — a Flow whose entire output IS the
audio — played silent until the user found the speaker button. Verified there is NO
`autoplay` anywhere in `js/components/`, so `muted` was guarding nothing. Removed.

### Item 2 — result pane: DIAGNOSIS PENDING (needs one GPU run)

NOT the reported bug. `_showResults` already builds `<video controls loop>`; what the user
saw is `_resultEmptyEl`, hidden only when `_resultMediaEl` has a child. So the cause is
upstream — `onComplete` firing with no items, or an item not tagged `video`. Held: the GPU
was handed to another agent's session. No generation was run this session (the one job
enqueued was the 124 ms scanline check, cancelled immediately; engine queue confirmed empty:
`queue_running:[] queue_pending:[] queue_remaining:0`).

### Item 3 — relayout step 2: NOT STARTED

### Suite
608/608 green, eslint clean, `node --check` clean on every edited file.

### OPEN — "it's not working" on the isolated instance (Fabio, 2026-08-15)

Fabio closed the agent's isolated instance (port 56938) and reported it "not working",
deferring diagnosis. **Not dismissed — unresolved, and this session's changes are in scope.**

What WAS verified in that instance (DOM-level, all passing): picker filters + fills the
slot, picker closes on pick, scanline arms 124 ms after Generate, cancel disarms it,
608/608 suite green.

What was NOT verified: a full generation end to end. So a fault that only shows on a real
run would not have been caught.

Candidates, in order:
1. `_setRunning` now also calls `_setScanline` + `_syncResultEmpty` on EVERY run
   transition. It is the single owner of run state, so a fault here shows on every
   generate/cancel/complete.
2. The `MpiMediaPicker` import added to `MpiBaseFlow.js` — a module-load failure would
   break the whole frame, not just the picker.
3. NOT this session: that profile was a throwaway with no models installed and no
   projects; "no models" reads as broken (memory `tool_isolated_instance_needs_models_root`).

Next session: reproduce with a real generation before assuming (3).
