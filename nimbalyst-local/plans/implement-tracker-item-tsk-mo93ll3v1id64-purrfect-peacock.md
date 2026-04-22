---
planStatus:
  planId: plan-gallery-slider-persist
  title: Gallery Size Slider Session Persistency
  status: draft
  planType: feature
  priority: medium
  owner: fabio
  stakeholders: []
  tags: [gallery, ui, state]
  created: "2026-04-21"
  updated: "2026-04-21T00:00:00.000Z"
  progress: 0
---

## Context

The gallery size slider (levels 1–5) resets to level 3 whenever the user navigates away from the gallery and returns. The value lives only in a local closure variable inside MpiGalleryGrid — it is not shared with global state, so it is lost on unmount.

The fix: store the current level in `state.gallerySizeLevel` so it survives navigation. No localStorage needed — app-restart reset is expected behavior.

---

## Approach

Add `gallerySizeLevel` to the existing `state` object. MpiGalleryGrid reads from it on mount (restoring previous level) and writes to it on slider input (keeping state current). No other files need changes.

---

## Steps

### 1. Add state key — `js/state.js`

In `_state`, under Gallery organization (~line 40), add:
```js
gallerySizeLevel: 3,  // 1–5; survives gallery navigation within session
```

### 2. Update MpiGalleryGrid — `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js`

**a) Mount slider from state instead of hardcoded 3 (line 96):**
```js
const slider = MpiProgressBar.mount(sliderWrap, {
    min: 1, max: 5, step: 1, value: state.gallerySizeLevel,
    ...
});
```

**b) Initialize `_cardWidth` from state (lines 104 and 134):**
```js
let _cardWidth = SIZE_MAP[state.gallerySizeLevel] || 288;
// Remove/update the `_cardWidth = SIZE_MAP[3]` on line 134 to use state too
```

**c) Write state on slider input (line 106–109):**
```js
slider.on('input', ({ value }) => {
    state.gallerySizeLevel = value;
    _cardWidth = SIZE_MAP[value] || 288;
    _rerenderJustified();
});
```

No Storage import needed. No localStorage changes.

---

## Critical Files

| File | Change |
|------|--------|
| `js/state.js` | Add `gallerySizeLevel: 3` to `_state` |
| `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js` | Read state on mount; write state on input |

---

## Verification

1. Open gallery → slider at 3 (default)
2. Change slider to level 5
3. Navigate away (e.g. back to landing or another workspace)
4. Return to gallery → slider still at 5, cards at 512px
5. Restart app → slider resets to 3 (expected)
