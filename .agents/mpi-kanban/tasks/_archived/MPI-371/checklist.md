# MPI-371 Checklist

Compact plan — one implementation unit, verified in the app at the end.

- [x] Implementation
  - [x] `MpiMaskStrip` compound — brush + eraser pair behind a `brush` prop; invert, clear, opacity always present
  - [x] `MpiMaskDetectRow` compound — thumbs slot, Detect button, Add / Subtract, Cue queue gate
  - [x] `MpiToolOptionsMaskDetect` organism — model + box/segment radios, strip WITH brush
  - [x] `MpiToolOptionsMaskPoints` organism — Scope slider, info, Clear points, strip WITHOUT brush
  - [x] Delete `MpiToolOptionsMask`
  - [x] Rail: MASK group → `maskDetect` + `maskPoints` icons
  - [x] Block sweep: registry, `_handleApply`, TOOL_LABELS, both `_tool === 'mask'` re-arm sites
  - [x] Register: `preloadStyles.js` css, `types.js` props
- [x] Automated verification — eslint clean, all four modules + css load in the live app,
      14/14 contract checks pass (see validation.md)
- [ ] User verification in the app
