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

## Session 4 (2026-08-16) — the rip landed, the picker was rebuilt, foley gained a middle step

### MPI-332 — VERIFIED LIVE, and it closes the rip

Registries read out of a running isolated app (port 51603), not from source:

| check | result |
|---|---|
| `flowsRegistry.FLOWS` ids | `head-swap`, `ltx-extend`, `ltx-foley` — the three ripped flows gone |
| `flowsRegistry` helper exports | all 9 intact |
| `commandRegistry` flow ops | `flowHeadSwap`, `flowLtxExtend`, `flowLtxFoley`; ripped set empty |
| suite | 608 → 605 (the 3 tests pinning the deleted workflows went with them) |

**The card body was wrong twice, both times from the Apps→Flows rename (`985faa09`).** Every
line number was stale — even the healed `:88/:103/:137` were really `:108/:123/:157` — and the
`app_*.json` workflow files it listed had been renamed to `flow_*.json`, so a worker reported
deleting five files that did not exist. Locate by id/symbol, never by line.

### The media picker — REBUILT, and signed off by Fabio in the app

His verdict on the first cut: *"it works and it's useless."* Rebuilt to his spec (`cf8b6208`):
filter tabs, names with the extension dropped, an expand button that previews without picking,
hover-to-play with the poster underneath, gallery ordering at open time, and **upload as the
first grid cell** so the picker is the single entry point. The empty slot box lost its rival
file-dialog click and its Browse button — one box, one job.

Verified by Fabio in the running app: *"I just tested it, and it's all good."*

Two real bugs fixed inside that work, both silent:

- `_handleFiles` targeted only FREE slots, so an upload aimed at an occupied slot landed in the
  next one — or nowhere at all on a single-slot Flow like foley.
- Both the picker tooltip and the slot name split a `/project-file?path=<urlencoded>` URL on
  slashes, so they showed the encoded query tail (visible in his screenshot).

**Tiles are SQUARE.** An earlier revision made them 16:9 unprompted; Fabio rejected it because a
9:16 vertical crops to a sliver. Do not re-litigate.

### Step 2 — the first attempt was WRONG, and the correction is the lesson

The run slide was first restructured into a stacked layout. **Fabio caught it: `_buildRunSlide`
is shared frame code**, so that change would have hit head-swap and ltx-extend — neither of which
asked for it, and head-swap's `uiComponent` mounts into that exact slot. A shared primitive
changed to serve one flow is the thing the root-cause rule exists to stop. Fully reverted (`git
diff` on `MpiBaseFlow` was empty before the rebuild).

The correct shape, which he then stated plainly: **every Flow has the same first stage and the
same last stage; only the middle varies.** So foley gets a MIDDLE step — `kind: 'preview'`, which
is exactly what `MpiStepPreview` was written for last session and never wired. `01 Inputs · 02
Describe · 03 Generate`, ticker derives itself. A FlowDef data change; the other two flows are
untouched.

Two pieces of plumbing were genuinely missing, both additive, both proven zero-blast-radius
(**no flow used step `fields` before this**):

1. **Step fields never reached the payload** — they sat nested in `stepValues`, where the op does
   not look. The prompt would have been silently dropped and the graph's baked default used.
2. **Field defaults were never seeded** — `_buildField` only writes on change, so an untouched
   field sends nothing. That is how a bench-proven negative goes missing on the one run nobody
   edited it.

### The empty prompt on Reuse — MY regression, fixed, NOT yet verified

Fabio hit `Reuse → Flow opens → positive prompt EMPTY`. Cause: reuse restores the sidecar's
`flowInputs`, and every foley card made **before** the step move stored `positive` at the TOP
LEVEL (it was a `control`). The new seeding read only `stepValues`, found nothing, and fell back
to a default the prompt does not have. Seeding now falls back to top-level, and to
`injectionParams` for an `Input_*` id.

**Verify with an OLD foley card.** A fresh card persists both shapes and would pass either way.

### Cards raised from his live use

- **MPI-570** — a hovered gallery video keeps looping *with sound* when an overlay opens over it.
  Root cause traced: playback stops only via `mouseleave`, and an overlay mounting under a
  stationary cursor never fires one. `_stopOtherGalleryMedia(null)` already exists and is correct;
  nothing calls it. Also carries his two other hover reports (hover doing nothing; audio late),
  which are probably *not* the same bug.
- **MPI-571** — the latent-preview consumers. **This had survived three handoffs uncarded**,
  which is why he has had to repeat it.
- **MPI-572** — first+last stage as a frame-owned template rather than restated per flow.

### Not verified

Step 2, its plumbing, and the reuse fix are **uncommitted and unseen on screen**. No generation
was run this entire session — the GPU was left free for his Cubric-Prompt agent.
