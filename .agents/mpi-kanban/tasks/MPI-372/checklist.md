# MPI-372 Checklist

Approach chosen by the user 2026-07-28: **Option 1 — mask family only.**
The canvas/preview swap is a VRAM optimisation (`swapToPreview` destroys
MpiCanvas to release GPU texture backing), not a display requirement. A mask
tool already keeps the canvas mounted and already renders the mask, so the
resolution is to **not swap at all** while a mask tool is active. The preview
surface keeps its one real job: the cheap surface for prompt-only mode.

- [x] Implementation — `mountOptions()` keeps the canvas AND shows the PromptBox
      for every `_isMaskTool(mode)`, without touching the prompt / crop / other
      tool paths. 13 lines, one file. eslint clean.
- [x] Automated verify — 13/13 against the running dev app, negative control on
      `HEAD` fails exactly the 3 visibility checks. See `validation.md`.
- [x] Round 2 — five defects found on first use, all fixed to root (A op-strip rail
      yank, B mask published only on tool exit, C sameEntry paint wipe, D mode cleared
      before loadEntry, E strip overlap). 21/21 live; negative control 12/21.
- [x] USER-VERIFIED LIVE 2026-07-28.
- [x] Verify — desktop smoke in image history: Detect + Points each show the
      PromptBox with the mask panel still in `#right-top-slot`; op/model/prompt
      edits land without leaving the tool; Run picks up the live mask; crop,
      resize, upscale, remove-background, interpolate, export-GIF unchanged.
