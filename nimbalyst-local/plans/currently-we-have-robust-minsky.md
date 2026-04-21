# Fix: Ratio Not Respected on Open-Project Generation + Final-Image Card Snaps to 1:1

## Context

Opening a project with a non-1:1 ratio and running text-to-image produces two visible bugs:

1. **Injection uses 1:1 (1024×1024) instead of the project's ratio.** PromptBox correctly *displays* the saved ratio. Generating *without touching the ratio selector* injects `{Width:1024, Height:1024}` into the ComfyUI workflow. Clicking the selector once fixes it — confirming display and injection read from different sources.
2. **Gallery card snaps from correct ratio to 1:1 when final image arrives.** Latent previews render with the correct aspect ratio. Once ComfyUI returns the final output, the card re-lays out at 1:1 and the image is letterboxed.

Recent project-service event work (commit 972c2be) synchronized `state.currentProject.modelSettings` but did not touch the two code paths that actually source ratio at injection time and at final-group construction time. Result: the bugs survived that refactor.

This plan fixes both at their root and restores symmetry — one source of truth (project state + request params) drives display, injection, placeholder, and final-group layout.

## Root Causes

### Bug 1 — Stale closure in `PromptBoxControls.ratio`
`js/components/Blocks/MpiPromptBox/PromptBoxControls.js:84`:
```js
this.value = { label: initialValue, w: 1024, h: 1024 };
```
`w` and `h` are hardcoded. The closure only gains real dimensions when the user fires the selector's `change` event (line 52). `getInjectionParams()` (line 89-91) returns these stale values. The *display* is correct because `MpiRatioSelector.mount` receives `value: initialValue` and resolves dimensions internally.

### Bug 2 — Final group drops width/height
`js/services/generationService.js:123` calls `createItemGroup(model.mediaType, { name: displayName })` — no `width`/`height`. The placeholder group (`MpiGalleryBlock.js:282-283`) carries them, so previews layout correctly. When `setGroups([group, ...])` runs on completion, `MpiGalleryGrid._getAspectRatio()` (line 338-350) finds no `group.width/height`, no loaded thumb yet (image URL just set), and falls back to `1.0`. Grid locks the row at 1:1 before the image loads; the image letterboxes into the square cell.

## Plan

### Fix 1 — Source injection from live state, not closure

**File:** `js/components/Blocks/MpiPromptBox/PromptBoxControls.js`

Change `getInjectionParams()` to read the *current* dimensions from the mounted `MpiRatioSelector` instance at call time, not from the stored closure. The selector already tracks live `{w, h, orientation, qualityTier}` — it computes them when rendering and in its change handlers (see `MpiRatioSelector.js:244-286`). Expose or read that value.

Steps:

1. Verify `MpiRatioSelector` exposes a public accessor for current dimensions. If not, add one (`getValue()` returning `{ value, w, h, orientation, qualityTier }`). The instance already maintains this internally — just surface it.
2. In `PromptBoxControls.ratio.getInjectionParams()` (line 89-91):
   - Read from `this._instance.getValue()` instead of `this.value`.
   - Fall back to resolving `initialValue` via `getModelRatios(modelType, orientation, qualityTier)` + `findClosestRatio` from `js/utils/ratios.js` if instance unavailable.
3. Keep `this.value` as an internal cache updated by the `change` handler — no longer the injection source of truth.
4. Also fix the init line 84: resolve initial `w/h` from `getModelRatios(...)` at mount using the saved `initialValue`/`initialOrientation`/`initialQualityTier`, so even if someone still reads `this.value` before any user interaction, it reflects reality.

**Why both (despite user picking option A):** the init fix is effectively free once ratio resolution helper is in scope, and it eliminates the stale-closure class-of-bug entirely. The live read remains the authoritative path.

**Reuse:** `getModelRatios`, `findClosestRatio` from `js/utils/ratios.js`. `getModelSettings` from `js/data/projectModel.js` (already imported).

### Fix 2 — Propagate dimensions into final group

**File:** `js/services/generationService.js`

In both Gallery and GroupHistory branches of `exec.onComplete` (lines 116-127), pass `width`/`height` onto the group object. The placeholder shape (`MpiGalleryBlock.js:276-285`) is the contract — mirror it.

Steps:

1. Before line 123, compute dimensions from `injectionParams`:
   ```js
   const width  = injectionParams.Width  || 0;
   const height = injectionParams.Height || 0;
   ```
2. Gallery branch (line 123): pass `width`, `height` into overrides:
   ```js
   const group = createItemGroup(model.mediaType, { name: displayName, width, height });
   ```
3. GroupHistory branch (line 118): `appendToHistory` returns the existing group shape. Existing groups should already carry `width`/`height` once new generations start saving them. For back-compat with legacy groups missing the fields, write them through on append:
   ```js
   const updatedGroup = { ...appendToHistory(opts.existingGroup, item), width: opts.existingGroup.width || width, height: opts.existingGroup.height || height };
   ```
   Use existing values when present; backfill only when missing.
4. No schema bump required — adding fields to a plain group object is backward-compatible. Loaders ignore unknown fields; `_getAspectRatio` gracefully falls through to its thumb-based check when fields are absent. If the user considers this a schema change, add a `SCHEMA_VERSION` bump per `docs/versioning.md` — **flag to user before implementing**.

**Reuse:** `createItemGroup` / `appendToHistory` from `js/data/projectModel.js`. No new helpers needed.

## Critical Files

| Purpose | Path |
| --- | --- |
| Bug 1 — injection source | `js/components/Blocks/MpiPromptBox/PromptBoxControls.js` (lines 52, 84, 89-91) |
| Bug 1 — live ratio accessor | `js/components/Compounds/MpiRatioSelector/MpiRatioSelector.js` (may need `getValue`) |
| Bug 1 — ratio resolution helper | `js/utils/ratios.js` (reuse `getModelRatios`, `findClosestRatio`) |
| Bug 2 — final group construction | `js/services/generationService.js` (lines 116-127, and line 95-97 already reads injectionParams for pixelDimensions — same pattern) |
| Bug 2 — group factory | `js/data/projectModel.js` (`createItemGroup`, line 126) |
| Bug 2 — consumer | `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js` (`_getAspectRatio`, line 338-350 — no change, already reads `group.width/height`) |
| Placeholder reference shape | `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` (lines 276-285) |

## Verification

End-to-end, run the Electron app (dev server on http://127.0.0.1:3000):

1. **Bug 1 — open-project injection:**
   - Create a new project, pick a non-1:1 ratio (e.g. 3:4 portrait), run one generation. Close the project.
   - Reopen the project. Without clicking the ratio selector, run a text-to-image generation.
   - **Expected:** Latent previews and final image both at 3:4 dimensions. ComfyUI workflow log shows `Width`/`Height` matching the ratio's actual pixels (not 1024×1024).
   - Verify in `logs/app.log` / browser devtools network that the workflow POST carries correct `Width`/`Height`.

2. **Bug 2 — final card ratio:**
   - Run any non-1:1 generation.
   - **Expected:** Card remains the same aspect ratio through latent previews → final image. No "snap to square" transition. No letterbox/pixel edges.
   - Inspect the group object in `state.currentProject.itemGroups[0]` — must contain `width` and `height`.

3. **Regression:**
   - Switch models via the model dropdown mid-session (the 972c2be fix area). Generate. Ratio still correct.
   - Change ratio via the selector. Generate. Ratio matches selector (existing working path must not break).
   - GroupHistory re-generation on an existing group: card ratio preserved; legacy groups without `width/height` still layout (fall back to thumb `naturalWidth/Height` once image loads).

4. **Unit-level sanity:**
   - Log `injectionParams` at `commandExecutor.js:117` before/after fix to confirm values.
   - Log `group` at `generationService.js:126` to confirm `width/height` present.

## Out of Scope

- Schema version bump for adding `width/height` to groups (flag to user if desired per `docs/versioning.md`).
- Migrating legacy groups missing `width/height` (grid already falls back gracefully via loaded thumb).
- Refactoring `PROMPT_BOX_CONTROLS` registry to remove closure state entirely (larger change; current fix keeps closure as cache).
