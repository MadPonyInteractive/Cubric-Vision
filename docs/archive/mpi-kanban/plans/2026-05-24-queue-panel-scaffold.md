# Queue Panel Scaffold

## Current State

Project mode: scalable-foundation.

Cue is an in-app single-dispatch queue owned by `js/services/generationService.js`; `state.generationQueueCount` is only a depth signal. Pending jobs can be inspected with `peekCueQueue()` and removed with `removeCueJob(predicate)`, while the running job lives in `activeGenerations`.

The visible queue panel will be designed separately. This plan only creates the non-visual contract, event flow, hotkey entry, and a bare slide-over content scaffold that the design pass can style.

Relevant contracts:
- Use `ComponentFactory.create()` for new UI surfaces.
- Register new component CSS in `js/shell/preloadStyles.js` and props/API in `js/components/types.js`.
- Use `Events.on()` / `Events.emit()` for cross-component updates and `Hotkeys.bind()` with an id from `hotkeyRegistry.js`.
- Update `MpiHelp.js` whenever a hotkey is added.

## Implementation

- [x] Add queue metadata plumbing in `generationService`: stable queue job ids, display metadata, loop tagging, running/pending snapshot, queue-change events, cancel pending by id. **Verify:** queue snapshot includes running and pending jobs with stable ids and expected metadata.
- [x] Add a bare `MpiQueuePanel` slide-over content component: render empty/running/pending rows from the snapshot, expose cancel/stop actions through service APIs/events, and avoid final visual styling beyond structural classes. **Verify:** panel updates when jobs enqueue/start/complete/cancel.
- [x] Wire Gallery access: add a `Q` hotkey, Help row, and Gallery-scope open event using the existing slide-over pattern. **Verify:** pressing `Q` in Gallery opens the panel, does not fire while typing, and cleanup avoids duplicate listeners after navigation.
- [x] Run focused static/runtime checks. **Verify:** lint passes and a lightweight browser/Electron smoke confirms enqueue/cancel/open behavior where practical.
- [x] Apply the selected queue list mockup to the scaffold: self-owned queue chrome, trash clears pending Cue jobs, X closes the slide-over, multi-image card deck thumbnails, ratio placeholders, and loop rows highlighted without loop progress text. **Verify:** browser smoke confirms stacked thumbnails, loop status without "of", clear action, and close action.
- [x] Polish queue panel shell behavior: `Q` toggles the Cue panel, Escape closes Cue and project-page slide-overs, and slide-overs stop above the status footer. **Verify:** browser smoke confirms toggle close, Escape close, and a 32px footer gap.
- [x] Polish queue thumbnails for real queue jobs: animated running fallback before latent previews arrive, non-cropped landscape thumbnails, and batch-size `xN` badges from `Batch_Size`. **Verify:** browser smoke confirms loading fallback, batch badges, landscape fit variables, and `object-fit: contain`.
- [x] Polish empty-thumb and stage-two labels: darken placeholder ratio text and show `Stage two` after pending/running status for second-phase jobs. **Verify:** browser smoke confirms `Pending · Stage two` and the placeholder label uses `--surface-bar` at weight 700.
- [x] Reconcile gallery preview cards from Cue state: queue-panel cancellation now clears queued/running preview overlays and stage-two badges by deriving state from `peekCueQueue()` plus `activeGenerations`. **Verify:** syntax and lint pass.
- [x] Polish Cue ratio metadata: carry the selected ratio label from the PromptBox ratio control, persist it to generation metadata, improve placeholder and gallery top-badge contrast, and split model/operation from ratio/dimensions onto separate card lines. **Verify:** syntax and lint pass.

## Completed

- [x] Queue scaffold implemented 2026-05-24: service snapshot/cancel contract, queue slide-over panel, Gallery `Q` hotkey, Help row, lint and smoke check.
- [x] Mockup integration implemented 2026-05-24: queue owns its header/footer, trash clears pending jobs, close button emits `close-request`, loop entries are normal queue cards with warning tint only.
- [x] Interaction polish implemented 2026-05-24: `slide-over:toggle` added, Gallery `Q` now toggles Cue, Escape closes non-modal slide-overs through the overlay close bus, and slide-overs no longer cover the status footer.
- [x] Thumbnail/batch polish implemented 2026-05-25: running queue entries show an animated fallback until latent previews load, broken preview images remain hidden behind the fallback, thumbnails fit rather than crop, and queued batches expose `batchCount` as `xN`.
- [x] Label polish implemented 2026-05-25: empty thumbnail ratio labels are darker, and `previewKind: 'final'` queue items render as stage-two status labels.
- [x] Preview cancel reconciliation implemented 2026-05-25: Gallery preview cards now resync queued/continuing overlays from the real Cue queue and active-generation registry, so cancelling from the queue panel updates the gallery card.
- [x] Ratio metadata polish implemented 2026-05-25: Cue uses the selected `Ratio_Label` instead of deriving ratios from output dimensions, placeholder ratio labels and gallery top badges are backed for contrast, and ratio/dimensions render on their own metadata line.

## Remaining Work

- Continue visual refinement only if the design session returns further adjustments.

## Plan Drift

- 2026-05-24: Visual polish initially deferred to the separate mockup/design session; the selected queue-list mockup has now been wired into the scaffold.

## Verification

- `npm run lint` passed with 0 errors and 26 pre-existing warnings.
- `node --check` passed for `MpiQueuePanel.js` and `MpiSlideOver.js`.
- Browser smoke passed: mock snapshot rendered 4 jobs, stacked multi-image thumbs appeared, loop status did not include "of", trash cleared pending rows, and X closed the queue slide-over.
- Browser smoke passed for interaction polish: Cue toggle event opened/closed, Escape closed Cue, Escape closed a generic slide-over, registry maps `Q` to `gallery.queue.toggle`, and the panel bottom gap is 32px.
- Browser smoke passed for thumbnail/batch polish: running fallback has loading class, batch badges rendered as `x2` and `x3`, landscape frame fit resolved to `100% x 57.7%`, and pending thumbnails compute `object-fit: contain`.
- Browser smoke passed for label polish: status text rendered `Pending · Stage two`, placeholder ratio rendered `7:4`, computed label color was `oklch(0.34 0.022 350)`, and font weight was 700.
- `node --check js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` passed.
- `npm run lint` passed with 0 errors and 26 pre-existing warnings.
- `node --check` passed for `MpiQueuePanel.js`, `PromptBoxControls.js`, `generationService.js`, and `routes/projects.js`.
- `npm run lint` passed with 0 errors and 26 pre-existing warnings after ratio metadata polish.

## Preservation Notes

After code lands, ask whether `.claude/rules/` should be updated for the new queue snapshot/panel contracts. Do not update architectural rule files without explicit user approval.
