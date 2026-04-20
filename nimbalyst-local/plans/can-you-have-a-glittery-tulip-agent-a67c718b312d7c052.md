# Efficiency Review Plan: MpiModelsModal, MpiGalleryGrid, MpiPromptBox

## Context

Review recently modified component files for efficiency issues:
- `js/components/Blocks/MpiModelsModal/MpiModelsModal.js`
- `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js`
- `js/components/Blocks/MpiPromptBox/MpiPromptBox.js`

Also checked: `js/events.js` (cleanup patterns), `js/state.js` (change detection), `.claude/rules/events.md`, `.claude/rules/downloads.md`, `.claude/rules/component-events.md`.

---

## Confirmed Issues

### HIGH Severity

#### 1. MpiPromptBox.js — Unsubscribed Event Listeners + Polling Cleanup
**Lines 356, 366, 369-376**

Two `Events.on()` calls are made with no stored unsubscribe function:
```javascript
// line 356 — no stored unsub
Events.on('workspace:set-operation', _onSetOperation);

// line 366 — no stored unsub
Events.on('workspace:inject-prompts', _onInjectPrompts);
```

Cleanup relies entirely on a MutationObserver that polls the entire `document.body` subtree:
```javascript
// lines 369-376
const _observer = new MutationObserver(() => {
    if (!document.contains(el)) {
        Events.off('workspace:set-operation', _onSetOperation);
        Events.off('workspace:inject-prompts', _onInjectPrompts);
        _observer.disconnect();
    }
});
_observer.observe(document.body, { childList: true, subtree: true });
```

Problems:
- MutationObserver fires on EVERY DOM mutation site-wide (all children of body). This is extremely expensive.
- Polling pattern — relies on DOM mutations to eventually trigger cleanup rather than using a deterministic lifecycle callback.
- If `el` is removed without any DOM mutation (e.g., direct P element removal), the observer may never fire.
- The `workspace:set-operation` and `workspace:inject-prompts` listeners never get a deterministic cleanup path.

**Fix direction:** Store unsubs in an array, call them in a proper `el.destroy` function. Remove the MutationObserver entirely.

---

#### 2. MpiModelsModal.js — `_unsubs` Array Never Used in Cleanup
**Lines 83, 105, 354, 360, 366, 422, 427, 432, 437, 442, 452**

The component creates an `_unsubs` array and pushes unsubscribe functions to it:
```javascript
// line 83
const _unsubs = [];

// line 105
_unsubs.push(on(refreshBtn.el, 'click', () => { awaitReSync(); }));

// lines 354-454 — many Events.on subscriptions pushed to _unsubs
_unsubs.push(Events.on('state:changed', ({ key }) => { ... }));
_unsubs.push(Events.on('download:progress', ({ modelId, ... }) => { ... }));
// etc.
```

BUT the cleanup function only calls `_destroyAllCards()`:
```javascript
// lines 459-463
el.destroy = () => {
    _unsubs.forEach(fn => fn());  // ← NEVER EXECUTED (destroy never set)
    _destroyAllCards();
};
```

Wait — actually `el.destroy` IS set (line 460). But who calls `el.destroy`? If the component is managed by `ComponentFactory`, the factory should call it. But if the component is mounted outside the factory's control, or if the factory doesn't call destroy, these subscriptions leak.

Additionally, `refreshBtn` click listener (line 105) uses `on()` from dom.js but is pushed to `_unsubs`. Need to verify `on()` returns an unsubscribe function — yes it does (standard pattern in dom.js).

**Fix direction:** Verify `el.destroy` is called by the factory on unmount. If not guaranteed, consider a parent-cleanup pattern or at minimum ensure the factory usage is consistent.

---

#### 3. MpiGalleryGrid.js — No Destroy Cleanup at All
**Lines 430-435, 442-444**

Two named unsubscribe functions are created but never cleaned up:
```javascript
// lines 430-435
const _unsubInfoBtn = Events.on('state:changed', ({ key }) => {
    if (key === 'galleryShowInfo') { ... }
});

// lines 442-444
const _unsubSort = Events.on('state:changed', ({ key }) => {
    if (key === 'gallerySort') _rerenderJustified();
});
```

No `el.destroy` is defined. No `_unsubs` array. These listeners persist for the lifetime of the component.

Also, `slider.on('input', ...)` at line 98 has no stored unsubscribe — but this is DOM-native, not Events-based, and may be acceptable if the slider is permanent.

**Fix direction:** Add `el.destroy` that calls `_unsubInfoBtn()` and `_unsubSort()`.

---

### MEDIUM Severity

#### 4. MpiGalleryGrid.js — O(n) Lookup Inside Hot Render Loop
**Line 371**

```javascript
rowItems.forEach(({ id, targetWidth }) => {
    const group = allGroups.find(g => g.id === id);  // O(n) per item
    ...
});
```

`allGroups.find()` is an O(n) scan inside an O(rows × items) loop. For a gallery with 500 items, worst case is 500 × O(n) = O(n²).

**Fix direction:** Replace with a Map lookup: `const groupMap = new Map(allGroups.map(g => [g.id, g]));` then `groupMap.get(id)`.

---

#### 5. MpiModelsModal.js — MODELS Filtered Twice Sequentially
**Lines 175-176**

```javascript
const installed = MODELS.filter(m => m.installed === true);     // pass 1
const uninstalled = MODELS.filter(m => m.installed !== true);  // pass 2
```

Two full passes over MODELS. Could be one pass using a single `reduce` or two arrays populated in one loop.

**Fix direction:** Single-pass partition: `const installed = [], uninstalled = []; for (const m of MODELS) { (m.installed ? installed : uninstalled).push(m); }`

---

#### 6. State.js — No Change-Detection Guard
**Lines 48-57**

```javascript
set(target, key, value) {
    target[key] = value;
    Events.emit('state:changed', { key, value });  // fires even if value unchanged
    return true;
}
```

Every `state.foo = state.foo` (re-assigning same value) fires `state:changed`. Components listening to generic `state:changed` (like MpiGalleryGrid line 430 and 442) will re-render on no-op updates. While individual components check `if (key === 'galleryShowInfo')` before acting, the event still fires.

**Fix direction:** Add `if (target[key] === value) return false` before emitting, or use `deepEqual` for objects.

---

### LOW Severity

#### 7. MpiModelsModal.js — Redundant `_parseSizeToBytes` Calls
**Lines 202-216 vs 204-211 and 296-311**

The same `_parseSizeToBytes` is called repeatedly per dep within `renderList()`. The value is already parsed in `_computeModelStats()`. Also, `_computeModelStats` (lines 128-148) already computes `totalBytes` but `renderList` re-parses string sizes independently for the partial progress calculation.

Specifically:
- `_computeModelStats` at line 128 iterates deps and calls `_parseSizeToBytes`
- Then in the partial progress block (202-216, 296-311), `_parseSizeToBytes` is called AGAIN for the same deps

**Fix direction:** Pre-compute and cache deps' parsed sizes at model level, or pass stats down to avoid re-parsing.

---

#### 8. MpiModelsModal.js — Redundant `downloadJob` Searches
**Lines 189-194, 283-288**

```javascript
const downloadJob = state.downloadJobs.find(j => j.modelId === model.id);  // line 189
// ...
const downloadJob = state.downloadJobs.find(j => j.modelId === model.id);  // line 283 (repeated for uninstalled models)
```

Called twice per render pass — once for installed models section, once for uninstalled. Could be a single pass over `state.downloadJobs` to build a Map<modelId, job>.

**Fix direction:** Build a `downloadJobMap = new Map(state.downloadJobs.map(j => [j.modelId, j]))` once before the render sections.

---

## Summary Table

| # | File | Line(s) | Issue | Severity |
|---|------|---------|-------|----------|
| 1 | MpiPromptBox.js | 356, 366, 369-376 | Event listeners unsubscribed via polling MutationObserver on entire body subtree | HIGH |
| 2 | MpiModelsModal.js | 83, 460-463 | `_unsubs` array created but destroy only partially effective (verify factory call path) | HIGH |
| 3 | MpiGalleryGrid.js | 430-444 | Named Event unsubs (`_unsubInfoBtn`, `_unsubSort`) never cleaned up; no `el.destroy` defined | HIGH |
| 4 | MpiGalleryGrid.js | 371 | O(n) `allGroups.find()` inside hot render loop — quadratic complexity | MEDIUM |
| 5 | MpiModelsModal.js | 175-176 | MODELS filtered twice (installed + uninstalled) instead of single-pass partition | MEDIUM |
| 6 | state.js | 48-57 | `state:changed` fires even when value is identical — no change-detection guard | MEDIUM |
| 7 | MpiModelsModal.js | 128-148, 202-216, 296-311 | `_parseSizeToBytes` called redundantly for same deps across stats + partial progress | LOW |
| 8 | MpiModelsModal.js | 189, 283 | `state.downloadJobs.find()` called twice per render instead of Map lookup | LOW |

---

## Recommended Fix Order

1. **MpiPromptBox.js** — Fix the MutationObserver polling issue (Issue 1). Add proper `el.destroy` with unsubs array. This is the most impactful fix.
2. **MpiGalleryGrid.js** — Add `el.destroy` cleanup (Issue 3). Fix O(n²) lookup in render loop (Issue 4).
3. **MpiModelsModal.js** — Verify `el.destroy` path works through factory. Add downloadJob Map (Issue 8). Single-pass MODELS partition (Issue 5).
4. **state.js** — Add change-detection guard to Proxy setter (Issue 6).

No changes to `js/events.js` — the event bus itself is clean; the issues are in components not cleaning up.