# Plan: Observer Lifecycle & Reactivity Cleanup

## Context

Started as: "an agent added `el.destroy` to the factory, is this right?"

Full audit of 57 components + all shell files revealed: the problem is much larger. The app has no systematic teardown contract. Components are destroyed by clearing `innerHTML` — no `instance.destroy()` is ever called by navigation or shell. This works for DOM-local listeners (GC cleans those up) but fails for anything external: `Events.on`, `window` listeners, `MutationObserver`, service-level handlers.

The original plan (`addCleanup` 4th factory arg, `onUpdate` hook) was solving the wrong problem. Real issues are:
1. Navigation never calls destroy on components it unmounts
2. Several Blocks have Events.on leaks because return values are discarded or cleanup is incomplete
3. PromptBox handlers registered by Blocks are never unsubscribed
4. Shell files (statusBar, memoryOps) have global listeners that live forever
5. Floating overlay components (projectUI, GalleryBlock) are created and never destroyed

Goal: establish a teardown contract, fix the real leaks, add two utilities that reduce future boilerplate.

---

## What NOT to do

- Do NOT add `addCleanup` as a 4th arg to `setup()` — touches locked factory, solves nothing the existing `el.destroy` pattern doesn't already handle
- Do NOT add `onUpdate` lifecycle hook — no component needs it yet
- Do NOT add `el.destroy` to all 35 older components — most only use DOM-local listeners that GC handles fine
- Do NOT touch `factory.js` at all

---

## Scope

### Phase 1: Fix Navigation Teardown Contract (`js/shell/navigation.js`)

**Root cause of most leaks:** Navigation clears `_toolContainer.innerHTML = ''` (line 170) without ever calling `instance.destroy()` on the Block it's removing. Same for radial menu at line 113.

**Fix:** Store the mounted Block instance. Before clearing innerHTML, call `instance.destroy()` if it exists.

```js
// Before: clears DOM, component's el.destroy never fires
_toolContainer.innerHTML = '';
_toolContainer.innerHTML = blockHtml;

// After: explicit teardown before DOM clear
if (_currentBlock) {
    _currentBlock.destroy?.();
    _currentBlock = null;
}
_toolContainer.innerHTML = '';
// mount new block, store as _currentBlock
```

Same for radial menu instance at line 113.

**Why this matters:** Once navigation calls `destroy()`, the factory's existing `destroy()` method (which calls `el.destroy()` if defined) fires automatically. This unlocks the `el.destroy` pattern for GalleryBlock and GroupHistoryBlock.

**Critical file:** `js/shell/navigation.js` — lines 113, 170, 198, 242–247

---

### Phase 2: Fix MpiGroupHistoryBlock (`js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`)

**Problems:**
1. **Lines 608, 627, 628:** `Events.on(...)` return values discarded — subscriptions never cleaned up
2. **Lines 637–638:** `Events.off(handler)` calls fail silently — handler references not stored, wrong API usage
3. **Cleanup uses MutationObserver** (line 634) watching `document.body` — but MutationObserver won't fire for `innerHTML = ''` on a grandchild (per existing comment) — so cleanup never actually runs for the Events subscriptions
4. **Lines 268, 272, 280, 284, 291:** Five `.on()` handlers registered on PromptBox instance — never unsubscribed
5. **Child components** (canvasViewer, historyList, historyTools, modelsModal) never explicitly destroyed

**Fix:**
- Collect all `Events.on` return values into `_unsubs` array
- Store PromptBox `on()` handlers in `_unsubs` via a pattern that calls the factory `instance.off()` (or accept that PromptBox `.on()` handlers are internal-only and GC'd with the instance)
- Define `el.destroy = () => { _unsubs.forEach(fn => fn()); }` — navigation teardown (Phase 1) will call this
- Remove the MutationObserver-based cleanup (it doesn't work and is now redundant)
- Call `destroy()` on child components that have it (canvasViewer, historyList, modelsModal)

**Critical file:** `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`

---

### Phase 3: Fix MpiGalleryBlock (`js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js`)

**Problems:**
1. **No `el.destroy`** — cleanup relies on two implicit state-watcher subscriptions (`_unsubPageChange`, `_unsubPageChange2`) that fire when `currentPage` changes
2. This pattern works when navigating away, but NOT when the block is destroyed for any other reason
3. **Line 285:** Direct array mutation `state.currentProject.itemGroups[idx] = pruned` — bypasses Proxy, `state:changed` never fires for this mutation
4. **Floating overlays** (compareOverlay line 132, deleteDialog line 319, settingsOverlay line 395): created with `document.createElement`, never appended to DOM and never destroyed — orphaned memory on every block mount
5. **Child components** (grid, selectionBar) never explicitly destroyed

**Fix:**
- Collect all `Events.on` return values into `_unsubs` array (already stored as named vars — just put them in an array)
- Define `el.destroy = () => { _unsubs.forEach(fn => fn()); grid.destroy?.(); }` — navigation teardown (Phase 1) calls this
- Remove the fragile `_unsubPageChange2` implicit cleanup block (lines 809–820) — no longer needed once `el.destroy` exists
- Fix line 285: use `state.currentProject = { ...state.currentProject, itemGroups: [...] }` pattern instead of direct array mutation
- Fix floating overlays: create them lazily (first use) or store and reuse across mounts, not re-created on every mount

**Critical file:** `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js`

---

### Phase 4: Fix PromptBoxService teardown (`js/shell/promptBoxService.js`)

**Problem:** `_mountEl.innerHTML = ''` (line 55) clears PromptBox DOM without calling `destroy()`. The component's `el.destroy()` — which unsubscribes from `workspace:set-operation` and `workspace:inject-prompts` — never fires.

**Fix:** One line before line 55:
```js
_instance?.el?.destroy?.();
```

**Critical file:** `js/shell/promptBoxService.js` — line 55

---

### Phase 5: Fix projectUI orphaned overlays (`js/shell/projectUI.js`)

**Problems:**
1. **Lines 45, 49, 53:** Settings, Help, About overlays mounted to detached `document.createElement('div')` elements — never appended to DOM, never destroyed. Accumulate in memory.
2. **Line 84:** `_newProjectDialog.on('create', handler)` re-registered every button click — duplicate listeners accumulate
3. **Line 116:** Project card grid reloaded without destroying old card instances

**Fix:**
- Overlays: These are singleton shell-level overlays. Move them to module-level singletons (created once on init, never recreated). They're meant to be persistent — the bug is they're being recreated on each init call.
- Dialog re-registration: store and call the unsubscribe before re-registering
- Cards: call `card.destroy()` before clearing the grid container

**Critical file:** `js/shell/projectUI.js`

---

### Phase 6: Add `Events.onState(key, handler)` — `js/events.js`

**Problem:** Every state subscriber writes manual key-filter boilerplate. Pattern repeated across ~10 components.

**Fix:** Add to the `Events` object:
```js
onState(key, handler) {
    return this.on('state:changed', ({ key: k, value }) => {
        if (k === key) handler(value);
    });
}
```
Returns unsubscribe function. Fully backwards compatible.

**Critical file:** `js/events.js`

---

### Phase 7: Add `batchState(fn)` — `js/state.js`

**Problem:** Each `state.x = y` fires `state:changed` immediately. Project load mutates 5–10 keys = 5–10 render passes through all subscribers.

**Fix:**
```js
let _batching = false;
const _batchQueue = new Map(); // key → last value (deduped)

// In Proxy set():
if (_batching) {
    _batchQueue.set(key, value);
} else {
    Events.emit('state:changed', { key, value });
}

export function batchState(fn) {
    _batching = true;
    fn();
    _batching = false;
    _batchQueue.forEach((value, key) => Events.emit('state:changed', { key, value }));
    _batchQueue.clear();
}
```

**Critical file:** `js/state.js`

---

### Phase 8: Documentation (`CLAUDE.md` + `.claude/rules/components.md`)

Add rules:
1. **Navigation contract:** Navigation MUST call `instance.destroy()` before clearing a mounted Block. Never use `innerHTML = ''` alone.
2. **Cleanup rule:** If `setup` calls `Events.on(...)`, `window.addEventListener(...)`, or creates any Observer — MUST define `el.destroy` that cleans them up. Collect unsubscribes in `const _unsubs = []`.
3. **New utilities:** `Events.onState(key, handler)` — prefer over manual `state:changed` filtering. `batchState(fn)` from `js/state.js` — use when mutating multiple state keys in sequence.
4. **State mutation:** Never mutate `state` sub-objects directly (e.g., `state.currentProject.itemGroups[i] = x`). Always replace the top-level key.
5. **Overlay pattern:** Shell-level overlays (settings, help, about) are singletons — create once in module scope, never recreate.

---

## Execution Order

1. `js/shell/promptBoxService.js` — 1-line fix (lowest risk, standalone)
2. `js/shell/navigation.js` — teardown contract (unlocks Phases 3 & 4)
3. `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` — fix leaks
4. `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` — fix leaks + state mutation bug
5. `js/shell/projectUI.js` — fix orphaned overlays + duplicate listeners
6. `js/events.js` — add `Events.onState`
7. `js/state.js` — add `batchState`
8. `CLAUDE.md` + `.claude/rules/components.md` — doc update

## Critical Files

- `js/shell/navigation.js`
- `js/shell/promptBoxService.js`
- `js/shell/projectUI.js`
- `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js`
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`
- `js/events.js`
- `js/state.js`
- `.claude/rules/components.md`
- `CLAUDE.md`

## Verification

- Navigate landing → gallery → group-history → gallery → group-history × 5
- Open browser devtools, check `Events._listeners` map after each navigation — subscriber count on `state:changed` must not grow
- Check `MutationObserver` count in memory profiler — should not grow
- Load a project — confirm single render pass (no repeated gallery refreshes)
- Remount PromptBox by switching workspaces — verify old subscriptions (`workspace:set-operation`) are gone
- Confirm `batchState` works: wrap a project load, verify single `state:changed` emission per key

## Out of Scope (acknowledged but deferred)

- `statusBar.js` global hover/tool listeners — these are app-lifetime singletons, not a real leak in practice
- `memoryOps.js` hotkey registration — same, app-lifetime
- `windowControls.js` button listeners — app-lifetime, intentional
- Older primitive components with DOM-only listeners (MpiButton, MpiInput, etc.) — DOM-local, GC handles them correctly
