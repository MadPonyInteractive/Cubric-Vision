# MPI-363 — Validation

**USER-VERIFIED LIVE 2026-07-27.** Alt+dragged a gallery card straight into Discord;
the image uploaded. Reported verbatim: "works lovely... Discord already has the image."

## What that proves

- `startDrag` hands the drop target a real `CF_HDROP` path — the thing `DownloadURL`
  never could. Discord accepting the drop is the exact failure case that opened this
  card.
- The Alt gate fires: the drag reached `_tryNativeDragOut` → `drag-out-files` IPC →
  `main.js` `startDrag`, with the icon path (`nativeImage` of the source PNG) not
  throwing.

## Not exercised by this run

- Multi-select Alt+drag (several selected cards → several files in one drag).
- Video/webp cards, where `nativeImage.createFromPath` returns empty and the drag
  icon falls back to `favicon.png`.
- Plain-drag regression (PromptBox chip + drag-to-folder). Untouched by the diff —
  the native path returns early only when `e.altKey` is set — but not re-run.
- macOS/Linux. `startDrag` is cross-platform, but only Windows was tested.

Automation is not available for any of these: a real OS drag crosses the process
boundary and cannot be driven from Playwright.
