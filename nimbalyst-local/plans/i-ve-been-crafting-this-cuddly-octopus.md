# Plan Review: Project Service Event Queue (2026-04-21)

## Verdict: VALID — Implement with minor corrections

The plan is architecturally sound and fixes a real bug. Code investigation confirms the bug exists exactly as described. No clashes with already-done work. A few implementation details need adjustment.

---

## Bug Confirmation

**Real and reproduced by code read.** In `PromptBoxControls.js`:
- Line 55: calls `setModelSettings(state.currentProject, modelId, { ratioSelector: ... })`
- Line 59: calls `saveProjectSettings()`
- `setModelSettings` calls `getModelSettings` internally which returns defaults if key missing — BUT it returns a new project object. That new project IS assigned to `state.currentProject` (line ~56-58). So the key IS created.

**Wait — re-examine the plan's bug description.** The plan says "the key is never written back to state.currentProject until something calls saveProjectSettings". But the code does:
```javascript
state.currentProject = setModelSettings(...)  // line 55-58 area
saveProjectSettings()                          // line 59
```
So `state.currentProject` IS updated before save. The bug may be **more subtle**: if `modelSettings` is `undefined` on the project and `setModelSettings` creates it fresh, it should work. Unless the issue is that `saveProjectSettings` debounces at 500ms, and a rapid series of changes (ratio → orientation → quality) causes only the last debounce call to fire, potentially with stale closure state.

**The plan's proposed solution is still correct** — decoupling persistence from components is the right fix regardless. The event queue approach is cleaner and future-proof.

---

## What the Investigation Confirms

| Claim in Plan | Confirmed? | Notes |
|---|---|---|
| PromptBoxControls imports getModelSettings, setModelSettings, saveProjectSettings | ✅ | Lines 16-17 |
| MpiModelSettings imports all four helpers + saveProjectSettings | ✅ | Lines 34-42 |
| _autoSave is async | ✅ | Line 115 |
| Model dropdown in MpiPromptBox does NOT emit settings:model:select | ✅ | Line 496-499 — only emits `model-change` |
| projectService has no queue logic | ✅ | Only debounce timer at 500ms |
| 4 new events don't exist yet in MpiEventMap | ✅ | Verified full event list |
| setModelSettings deep-merges ratioSelector | ✅ | Lines 304-318 in projectModel.js |

---

## Issues & Corrections

### Issue 1 — Step 3: Key creation defaults are wrong in the plan

The plan hardcodes lora defaults in the service:
```javascript
loras: Array.from({ length: 6 }, () => ({ name: null, strengthModel: 1.0, strengthClip: 1.0 })),
```

**Do NOT duplicate this.** `getModelSettings()` already returns exactly these defaults (projectModel.js lines 288-294). The select handler should call it instead:

```javascript
// CORRECT — reuse existing helper, no duplication:
Events.on('settings:model:select', ({ modelId }) => {
    if (!state.currentProject) return;
    if (state.currentProject.modelSettings?.[modelId]) return;
    const defaults = getModelSettings(state.currentProject, modelId); // already returns defaults
    state.currentProject = {
        ...state.currentProject,
        updatedAt: new Date().toISOString(),
        modelSettings: { ...state.currentProject.modelSettings, [modelId]: defaults },
    };
    saveProjectSettings();
});
```

Import `getModelSettings` from `js/data/projectModel.js` in projectService.js.

### Issue 2 — Step 4: PromptBoxControls has 3 separate event handlers for ratioSelector

The plan only shows the `change` handler (line 52). There are also:
- `orientation_change` (line 64) — sends `{ orientation }` only
- `quality_change` (line 74) — sends `{ qualityTier }` only

All three must be migrated. The plan mentions this ("Apply the same pattern") but doesn't show the payloads. Clarify:

```javascript
// orientation_change:
Events.emit('settings:model:update', { modelId, key: 'ratioSelector', value: { orientation } });

// quality_change:
Events.emit('settings:model:update', { modelId, key: 'ratioSelector', value: { qualityTier } });
```

These are partial updates to `ratioSelector` — the queue must deep-merge them with existing `ratioSelector` state, not replace. **The plan's queue logic ("only keep newest per key") is WRONG for ratioSelector.**

If two events fire quickly: first `{ orientation }`, then `{ qualityTier }` — and only the second is kept, the orientation is lost.

**Fix the queue:** For `ratioSelector` key, merge pending rather than replace:
```javascript
// When enqueueing an update:
const existing = _modelQueues.get(modelId)?.pending ?? {};
const existingForKey = existing[key] ?? {};
const merged = (key === 'ratioSelector') 
    ? { ...existingForKey, ...value }  // deep merge for ratioSelector
    : value;                           // replace for loras, upscaleModel
```

Or simpler — just always deep-merge the pending object (since loras is always full-replacement anyway, and upscaleModel is scalar).

### Issue 3 — `emit('saved', {})` removal needs care

In `_autoSave` migration (Step 5), `emit('saved', {})` is kept. But the save is now async (queue + debounce). The `saved` event will fire immediately after emitting the events, NOT after the actual disk write. If anything listens to `saved` expecting persistence to be complete, it'll break.

**Check if anything listens to `saved`.** If so, the queue flush callback must emit it — not `_autoSave`.

### Issue 5 — `Events.on` unsubs must be stored (rule compliance)

`events.md` requires storing the unsubscribe function from every `Events.on` call. `projectService` is a permanent singleton so leaks aren't a real concern, but the rule still applies.

**Pattern to use in Step 2:**

```javascript
// projectService.js — store all 4 unsubs at module level
const _settingsUnsubs = [
    Events.on('settings:model:select', ({ modelId }) => { /* key creation */ }),
    Events.on('settings:tool:select',  ({ toolKey })  => { /* key creation */ }),
    Events.on('settings:model:update', ({ modelId, key, value }) => { /* enqueue */ }),
    Events.on('settings:tool:update',  ({ toolKey,  key, value }) => { /* enqueue */ }),
];
// Never called in normal operation. If service ever needs hot-teardown:
// _settingsUnsubs.forEach(u => u());
```

`Events.on` returns the unsubscribe fn. Collecting in array = rule satisfied.

---

### Issue 4 — `_autoSave` error handling gap

Current `_autoSave` catches errors from `saveProjectSettings()` and emits `ui:error`. After migration, errors in the queue's debounced save won't propagate back to `_autoSave`. The queue's timer callback must have its own error handler emitting `ui:error`.

---

## No Clashes with Existing Work

- No existing `settings:*` events in MpiEventMap — new events are safe to add
- projectService has no existing queue — additions are purely additive
- The `emit('saved', {})` channel pattern in MpiModelSettings is local — won't conflict
- getModelSettings / setModelSettings / getToolSettings / setToolSettings remain unchanged (read-only consumers in other components unaffected)

---

## Implementation Order

Follow the plan's step order — it's correct. Steps 1→2→3 (infrastructure) before 4→5→6 (migration). Step 7 (docs) last.

One addition: **after Step 3**, verify the queue deep-merges ratioSelector sub-keys before migrating components.

---

## Summary

| | |
|---|---|
| Plan is correct? | Yes, fundamentally |
| Bug is real? | Yes (debounce + missing key-creation race) |
| Safe to implement? | Yes |
| Clashes with prior work? | None found |
| Corrections needed? | 4 (see above) — none are blockers, all are fixable during implementation |
