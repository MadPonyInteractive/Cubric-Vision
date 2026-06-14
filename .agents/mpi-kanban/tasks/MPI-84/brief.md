# MPI-84 — Toast messages truncate instead of growing

## Problem
Status-bar toasts cut off long messages mid-sentence. Observed with the
missing-LoRA warning ("…was not found in your LoRA/upscale folders. Add it i…").
Recurring across other long toasts too.

## Cause
`js/components/Primitives/MpiToast/MpiToast.css` line ~99 clamps the message body:
```css
-webkit-line-clamp: 2;
```
(with the usual `display:-webkit-box; -webkit-box-orient:vertical; overflow:hidden`).
So anything past 2 lines is ellipsized.

## Desired behavior
Toast grows in HEIGHT to show the full message. Keep the existing `max-width`
(`MpiToast.css:12` `min(520px, …)`). Add a sane `max-height` with `overflow-y:auto`
only for extreme lengths so a runaway message can't fill the screen.

## Fix sketch (for the pickup agent — confirm before coding)
- Remove the `-webkit-line-clamp: 2` clamp (and the `-webkit-box` overflow:hidden
  that enables it) on the toast message element.
- Let the message wrap naturally (`white-space: normal; overflow-wrap:anywhere`).
- Add `max-height` (e.g. ~40vh) + `overflow-y:auto` as a safety cap.
- Verify short toasts look unchanged and the stack still lays out correctly
  (`StatusBar.notify` stacks multiple toasts — check spacing when one is tall).

## Surface
- Component: `js/components/Primitives/MpiToast/MpiToast.css` (+ .js if the clamp
  is also set inline).
- Entry point: `StatusBar.notify(message, variant, duration)` in
  `js/shell/statusBar.js` (fed by `ui:info` / `ui:warning` / `ui:success`).

## Scope
Standalone UI fix. Independent of MPI-82. No logic change to what triggers toasts.
