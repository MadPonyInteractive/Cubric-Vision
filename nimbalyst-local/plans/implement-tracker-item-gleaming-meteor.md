# Plan: Status Bar Badge Variant + Model Loading Label + Generation Timing

## Context

Status bar currently shows "Generating..." during entire generation lifecycle. Task: show "Loading model..." during model-load phase, switch to "Generating..." once KSampler begins, save elapsed time to item sidecar.

Badge (dot + label) needs new color variant — blue. Label needs three dots: "Generating..." (covers image + video).

---

## Approach

### 1. Badge Color Variant (no overwrite)

Create new `.shell-info__dot--primary` + `.shell-info__process-label--primary` CSS classes in `styles/shell/components.css`. Use `--primary` color variable.

StatusBar needs method to apply variant. Add `setVariant(variant)` to `progress` object:
```js
StatusBar.progress.setVariant('primary');  // applies --primary class
```

Both blocks call `setVariant('primary')` when `StatusBar.progress.start()` runs.

### 2. "Loading model..." → "Generating..." Label Switch

Timing signal exists: first `exec.onProgress` callback = model loaded, KSampler steps starting.

Both `MpiGalleryBlock` + `MpiGroupHistoryBlock` have `exec.onProgress` handler. Add flag in generation scope:

```js
let modelLoaded = false;
// ...
exec.onProgress = (value) => {
    if (!modelLoaded) {
        modelLoaded = true;
        StatusBar.progress.updateLabel('Generating...');
    }
    StatusBar.progress.update(value);
};
```

Add `updateLabel(label)` method to `statusBar.js` `progress` object — swaps label text without resetting fill.

### 3. Timing → Sidecar

`generationStartTime = Date.now()` at run trigger (before `StatusBar.progress.start()`).

On `exec.onComplete`: compute `elapsedMs`, include in `/project/save-generation` POST body:
```js
const elapsedMs = Date.now() - generationStartTime;
// in fetch body:
{ ..., generationMs: elapsedMs }
```

Backend (`routes/projects.js` `save-generation` handler ~line 572): write `generationMs` to sidecar `metaContent`.

---

## Critical Files

| File | Change |
|---|---|
| `styles/shell/components.css` | Add `.shell-info__dot--primary` + `.shell-info__process-label--primary` variant classes |
| `js/shell/statusBar.js` | Add `setVariant(variant)` and `updateLabel(label)` to `progress` API |
| `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` lines ~505, ~520 | `setVariant('primary')` on start, add `modelLoaded` flag in `onProgress`, add `elapsedMs` to POST (x2 paths) |
| `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` lines ~309, ~345 | Same pattern |
| `routes/projects.js` ~line 572 | Add `generationMs` field to sidecar write |

---

## Implementation Steps

- [ ] `styles/shell/components.css`: Add blue variant classes for dot + label
- [ ] `js/shell/statusBar.js`: Add `setVariant()` + `updateLabel()` to `progress`
- [ ] `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js`: Timing + variant + label swap (2 paths)
- [ ] `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`: Timing + variant + label swap
- [ ] `routes/projects.js`: Write `generationMs` to sidecar

---

## Verification

1. Run generation — status bar shows "Loading model..." with blue dot/label
2. Once KSampler steps start — label switches to "Generating..."
3. On completion — check sidecar `.meta/<uuid>.json` — has `generationMs` field with elapsed ms
4. Test cancel during load — bar resets; during generation — bar resets; error — bar resets
5. Both gallery blocks work

