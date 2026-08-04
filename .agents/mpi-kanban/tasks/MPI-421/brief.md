# MPI-421 — Auto-mask run cost + feedback

Member 2 of the **MPI-440** umbrella, picked up straight after MPI-426 shipped, because both
rewrite the auto-mask result path (`exec.onMasks` in `MpiCanvasViewer.js`). Read
`tasks/MPI-440/brief.md` § Standing constraints before touching anything here.

Two halves, one call path:

- **the absorbed MPI-402** — every chip toggle re-dispatches the whole graph
- **MPI-421 proper** — the dispatches that survive have no progress, no Stop, no queue lane

---

## What the investigation found (2026-08-04)

**The picker is the only reason a toggle costs a run.** The graph is
`... -> Input_Text_Mode gate (1665) -> ImpactSEGSPicker (1593, "Input_Selected_Masks_Input")
-> ImpactSEGSToMaskList (1641) -> MaskToImage -> PreviewImage "Output_image"`. The picker
trims the SEGS list to the *currently selected* chips, so the mask images only exist for the
picks that were selected at dispatch time — change the selection, and the only way to get the
new mask is another run. The thumbs come off the SAME SEGS through a parallel branch
(`SEGSPreview (1571) -> MpiBlockIfEmptyList -> PreviewImage "Output_Detected"`), which is why
a detect already returns every object's thumbnail in one run.

**The canvas already supports the cache — nothing there needs building.**
`MaskManager` holds `autoPickMasks: Map<pickIndex, ImageBitmap>` and a separate
`selectedAutoPicks: Set<number>`, and every composite is
`[...selectedAutoPicks].map(i => autoPickMasks.get(i))` (`MaskManager.js:395`, `:489`). A chip
toggle is *already* a one-line client operation (`setSelectedAutoPicks`) against a full map.
The viewer just never has the full map, because the graph never sent it.

**No feedback exists at all.** `runAutoMask` (`commandExecutor.js:876`) has no `onProgress` —
the `Execution` typedef right below it does. `MpiMaskDetectRow` has no busy state: Detect stays
armed and unchanged while a run is in flight, and pressing it again silently cancels the
previous exec. The status bar reads `IDLE` for the whole run.

---

## DECISION 1 — utility lane, NOT a first-class queue job

The card asked to decide. **Utility lane.** A detect never enters `_cueQueue` and never
registers in `generationStore`.

Why the queue is the wrong answer, in order of severity:

1. **It would gate itself off.** A store job raises `state.generationQueueCount`, and
   `_isCueBusy()` (`MpiCanvasViewer.js:375`) + `MpiMaskDetectRow._syncGate` disable the whole
   detect row whenever that count is non-zero. A detect that occupies the queue disables Detect
   while it runs — including its own Stop.
2. **It cannot be stuck behind a generation anyway.** That same guard already makes detect and
   the cue queue *mutually exclusive*; the "stuck behind a long generation" risk the card
   worried about is structurally impossible today.
3. **The queue's completion machinery is built for media.** `generationService` treats a
   zero-media completion as a cancel (`if (!urls.length)`), and `notificationService` counts
   every `generation:complete` into the "N generations finished" coalesced flush. A mask
   detect returns no media and deserves no completion notification.

So the run gets the **status bar and a Stop**, not a queue slot.

**How it drives the bar, and why not via `tool:*` events.** The `tool:*` listeners all
hard-filter `tool === 'groupHistory'` and are latched per gen id (MPI-203/208), and
`statusBar._reconcileFromStore` force-idles the bar whenever the store has no running job **and**
`_activeGenId !== null`. A detect emitting id-tagged `tool:*` events would set `_activeGenId` to
an id the store can never confirm — the exact stuck/stomp class those guards exist to kill.
Calling `StatusBar.progress.*` directly leaves `_activeGenId` null, which the self-heal treats as
"not mine, don't touch". A real gen starting mid-detect re-latches the bar to itself and the
detect's later `complete()` is the only thing that could stomp it — guarded by a live-run check.

## DECISION 2 — delete the picker from the mask path

`ImpactSEGSToMaskList.segs` is rewired from the picker (`1593`) to the gate output (`1665`), and
the `ImpactSEGSPicker` node is removed along with the `Input_Selected_Masks_Input` param. One
detect then returns **every** object's mask, in ascending SEG order, index-aligned with the
thumbs (both branches iterate the same SEGS list). Chip toggling becomes
`setSelectedAutoPicks()` and never dispatches again.

This preserves the MPI-380 order contract (`docs/masking-sam3.md` § Mask ORDER) more strongly
than before: the mapping stops being `image[i] -> sortedPicks[i]` and becomes `image[i] -> i`.

**Costs, honestly:** the engine now encodes N mask PNGs per detect instead of `picks.size`.
The client stays lazy — it fetches and converts a mask URL only when that chip is first
selected, so no extra download and no extra `_maskUrlToTransparentDataUrl` full-image pixel
loop on the detect itself (that loop is the expensive part, ~1 pass per pixel per mask).

---

## Plan

1. **Graph** — `comfy_workflows/img_auto_mask.json` + `comfy_workflows/raw/img_auto_mask.json`:
   rewire `1641.segs <- 1665`, delete node `1593`. Both files, by hand, verified by parsing.
   → verify: `node --test "tests/auto-mask-inject-titles.test.cjs"` (it asserts every injected
   title exists, so the dead param is caught), plus a JSON round-trip of both files.
2. **Executor** — drop `Input_Selected_Masks_Input` from the `params` object in `runAutoMask`;
   stop suppressing the `Output_image` emit on empty picks (`onMasks` now always carries the
   full list). Keep the handle shape otherwise.
3. **Viewer** — `_runAutoMaskWorkflow` caches `allUrls` (RAM, per item) from `onMasks`; the
   thumbs `'change'` handler resolves picks against that cache (lazy bitmap build) and calls
   `setSelectedAutoPicks` + `evaluateMask()` instead of re-running the workflow. A pick with no
   cached url — only reachable on a cold rehydrate from `maskTempStore` — falls back to the
   old dispatch, so nothing regresses.
   → verify: real-pixel probe / in-app, chip toggling produces no new ComfyUI prompt.
4. **Feedback** — the detect run drives `StatusBar.progress` (`prepare('Detecting')` +
   `setIndeterminate(true)` + `startClock()`, `complete()`/`cancel()` on settle). Indeterminate
   is the honest bar: SAM3 detect emits no tqdm, so there is no % to show (same call as ESRGAN).
5. **Stop** — `MpiMaskDetectRow`'s Detect button becomes Stop while a run is in flight, wired to
   the exec's existing `cancel()`. This is also the missing busy state.
   → verify: press Stop mid-detect, the bar clears and no masks land.

## Not in scope

- Blocking **Cue** while a detect runs (the guard is one-directional today; ComfyUI serialises
  the prompts anyway and a detect is seconds).
- MPI-403 (engineAssets never staged to the Pod fast disk) — the reason the *first* detect is
  slow, and a download-subsystem card, deliberately not merged here.
