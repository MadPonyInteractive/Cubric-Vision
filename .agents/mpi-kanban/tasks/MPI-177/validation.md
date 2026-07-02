# MPI-177 Validation

## Verified (automated, 2026-07-02)

- `npx eslint` clean on MpiRunpodSettings.js, MpiSettings.js, MpiSlideOver.js.
- New desktop spec `tests/desktop/runpod-settings-extract.spec.js` (6/6 solo runs +
  full `npm run test:desktop` 10/10):
  - Settings slide-over opens; extracted section mounts into `#mpiSettingsRunpodMount`
    with title "RunPod Remote Engine" and the enable-toggle rendered.
  - `_initRunpodSection` runs via the forwarded `el.onOpen()` (key-status hint populates).
  - Non-RunPod half of MpiSettings still initialises (auto-start checkbox).
  - Close → re-open renders a fresh instance and re-inits (destroy → remount cycle).
  - Zero page errors across the whole flow.
- Extraction is pure code motion (script-sliced by content anchors): DOM ids and
  `mpi-settings__runpod-*` class names unchanged; `.mpi-settings__section` chrome
  still styled by MpiSettings.css.

## Bonus fixes surfaced by the card

1. **MpiSlideOver never destroyed its content instance on close** — content
   `el.destroy()` was dead code; every Settings open leaked the 5s RunPod
   status-poll interval + Events subscriptions for the app lifetime. Fixed:
   `_doClose` now calls `_contentInstance?.destroy?.()` (all slide-over content
   components have safe/absent destroy hooks — checked MpiModelManager,
   mpi-hotkeys, MpiAbout, MpiQueuePanel).
2. **Close relied solely on `transitionend`** to remove the panel node — a
   throttled/background window can skip the transition entirely. Added a 400ms
   backstop (transition is `--t-base` 280ms).

## NOT verified (needs a live RunPod pass — bills a Pod)

- Connect → generate → disconnect cycle through the extracted component.
- Volume create/delete + disk-usage poll rendering.

Logic is verbatim-moved and the init/destroy seams are test-verified, so risk is
low, but the card should only close after one live connect/disconnect smoke.

## Live verification (user, 2026-07-02)
- Connected, generated, disconnected on a real Pod (RTX 2000 Ada, EU-RO-1) through the extracted component.
- Both disconnect paths verified: terminate (keep Pod) and delete Pod.
- MPI-180 dropdown fix confirmed working live.
