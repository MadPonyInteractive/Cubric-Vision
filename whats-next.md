```xml
<work_completed>

## This Session — Auto-Mask Tool Implementation

- `MpiAutoMaskThumbs` Compound created: wrapping grid of selectable segment thumbnails,
  additive toggle (Set-based), `setImages()`, `clear()`, `getPicks()`, `clearPicks()`.
- `MpiToolActionBar` extended: new optional `topSlot` prop renders above the pill.
  Template restructured to `__top` + `__pill` column-flex; CSS updated accordingly.
- `runAutoMask(payload)` added to `commandExecutor.js`: loads `img_auto_mask.json`,
  injects `Input_Image`, `sams`, `Box`, `Selected_Masks_Input` (1-based picks string);
  fires `onDetected(urls[])` from `"Detected"` node and `onMask(url)` from `"Output"` node.
- `groupHistory.js` fully wired: auto-mask state machine (`_enterAutoMaskMode`,
  `_exitAutoMaskMode(apply)`), `_runAutoMaskWorkflow(populateThumbs)`, and
  `_maskUrlToTransparentDataUrl()` (converts ComfyUI white/black mask → white/transparent
  so black pixels don't tint the canvas). Bar has model dropdown (Face/Hand/Person),
  Box/Segment radio, and Detect/Apply/Cancel actions. Model or mode change clears thumbs+picks+mask.
- `types.js`, `preloadStyles.js`, `components.js` gallery updated for new component.
- **Bug fixed**: thumb clicks were resetting selection because `onDetected → setImages()`
  rebuilt the DOM on every run. Fixed via `populateThumbs` flag — only Detect button
  passes `true`; thumb-click runs pass `false` and skip `setImages`.

## Previous Sessions

### Event Bus Audit + Universal Tool Routing
- `showError` removed from services; all now emit `ui:error`
- `tool:running` / `tool:idle` / `media:updated` emitted from `groupHistory.js`
- Universal commands removed from PromptBox, routed to `MpiHistoryTools` toolbar
- `getToolCommands(mediaType)` added to `commandRegistry.js`

### modelRegistry.js + MpiStartingComfy
- `UNIVERSAL_WORKFLOWS` promoted to `{ workflow, dependencies[], installed }` objects
- `syncModelInstalled()` covers universal workflows; `getUniversalWorkflow(key)` helper added
- `MpiStartingComfy` wired to `comfy:starting/ready/error` events via bus

</work_completed>

<work_remaining>

## 🟡 DEFERRED — Event Bus P2
`groupHistory.js` still imports `StatusBar` directly. Unblock when something subscribes
to `tool:running`/`tool:idle`.

## 1. Model UI — installed state
- Filter model dropdown to `installed === true` only
- Zero-installed state: hide prompt box, show install prompt
- Gallery card badge if group's model is no longer installed
- Model installer UI (browse, download, progress)
- Model uninstall / GC route

## 4. Video Workflows (pending user)
- `interpolate` and `videoUpscale` activate handlers in groupHistory (stubs in place)
- Populate `dependencies[]` in `UNIVERSAL_WORKFLOWS` when workflow files are ready
- groupHistory video group support (swap canvas for video player)

## 5. Low priority
- `state.js` legacy flat properties — remove when confirmed unused
- `PAGE_WORKSPACE` alias in `router.js` — remove when confirmed unused
- `MpiSelectionBar` — not in components gallery yet

</work_remaining>

<critical_context>

## Event Bus Rules (MANDATORY)
Services NEVER import from shell. If a service needs UI, it emits an event.
Shell/workspaces listen. See `js/events.js` `MpiEventMap` for canonical event list.

## ComfyUI mapping — autoMask workflow titles
`Input_Image`, `sams` (detector filename), `Box` (boolean), `Selected_Masks_Input` (picks),
`Detected` (segment preview images), `Output` (combined mask image).
`Selected_Masks_Input.picks` expects **1-based** comma string — `runAutoMask` handles this.

## Canvas mask convention
- **Display on canvas**: white = masked (opaque), black pixels must be transparent.
  `_maskUrlToTransparentDataUrl()` handles the conversion from ComfyUI output.
- **Sending to ComfyUI for generation**: `canvas.getMaskDataURL('black', 'white')`
  (white = inpaint area, black = background).

## MpiToolActionBar — topSlot
Accepts any `{ el: HTMLElement }` instance. The auto-mask left slot is a plain div
pseudo-instance — valid and intentional.

## Tier hierarchy
Primitives → Compounds → Blocks. Workspaces can import anything.
`MpiAutoMaskThumbs` is Tier 2 (Compound) — imports only `ComponentFactory`.

## Key locations
- Auto-mask workflow: `comfy_workflows/img_auto_mask.json`
- MpiAutoMaskThumbs: `js/components/Compounds/MpiAutoMaskThumbs/`
- groupHistory: `js/workspaces/groupHistory/groupHistory.js`
- commandExecutor: `js/services/commandExecutor.js`
- #tool-container: ONLY use `classList.remove()` — never `element.className = ''`
- MpiCanvas: call `canvas.destroy()` on unmount (MutationObserver handles this in groupHistory)
- Off-screen canvases that call `getImageData`: always `{ willReadFrequently: true }`

</critical_context>

<current_state>

| Item | Status |
|---|---|
| MpiAutoMaskThumbs component | Complete |
| MpiToolActionBar topSlot | Complete |
| runAutoMask() | Complete |
| groupHistory auto-mask wiring | Complete |
| Live ComfyUI test | Complete |
| Universal workflow installed gating | Complete |
| interpolate / videoUpscale tools | Not started |
| Model UI (installer, gating, GC) | Not started |

No commits made this session.

</current_state>
```
