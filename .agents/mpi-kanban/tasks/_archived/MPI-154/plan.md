# MPI-154 — RAM/VRAM Release Button: Click vs Ctrl-Click

## Root cause

### Click handler chain

**Component** (`js/components/Compounds/MpiMemoryMonitor/MpiMemoryMonitor.js`, line 109):
```js
unloadBtn.on('click', () => emit('release', { deep: _ctrlHeld }));
```
`_ctrlHeld` is true only if the Control key is physically held at click time (tracked via `memoryMonitor.ctrl.down/up` hotkey bindings, lines 93–107).

**Shell wire-up** (`js/shell.js`, line 151):
```js
memMonitor.on('release', ({ deep }) => triggerMemoryRelease(deep, memMonitor.el));
```

**memoryOps** (`js/shell/memoryOps.js`, lines 13–38):
```js
export async function triggerMemoryRelease(isDeep = false, monitorEl) {
  // ...
  await fetch('/comfy/unload', { method: 'POST', body: JSON.stringify({ deep: isDeep }) });
}
```

**Backend route** (`routes/comfy.js`, lines 373–396):
```js
await ax.post(`http://127.0.0.1:${COMFYUI_PORT}/free`, {
    unload_models: true,
    free_memory: isDeep,   // ← the only flag that differs
}, ...);
// Manager endpoint only called when isDeep === true
if (isDeep) {
    await ax.post(`.../manager/unload_models`, ...);
}
```

### What each path actually sends to ComfyUI `/free`

| User action | `deep` flag | `unload_models` | `free_memory` | Manager endpoint |
|---|---|---|---|---|
| Normal click (no Ctrl) | `false` | `true` | **`false`** | no |
| Ctrl-click (Ctrl held at click) | `true` | `true` | **`true`** | yes |

### Does a normal click already free both VRAM and RAM?

**No.** The ComfyUI `/free` API distinguishes the two flags:
- `unload_models: true` — removes loaded models from VRAM (GPU memory).
- `free_memory: true` — additionally flushes PyTorch's CPU/RAM cache (torch GC, gc.collect).

A normal click sends `free_memory: false`, so RAM is NOT flushed. Ctrl-click sends `free_memory: true`, which flushes RAM as well as VRAM.

### The actual user-reported confusion

The tooltip/info text on the button reads:
```
Release VRAM — F5 standard · Ctrl+F5 deep clean
```
(set at `MpiMemoryMonitor.js` line 86).

The user believes "normal click releases both VRAM and RAM." This is incorrect per the code — normal click only sets `free_memory: false`. The confusion likely stems from one of two things:

1. **Perceived effect**: after model unload (`unload_models: true`), the OS may reclaim RAM pages lazily, making it _look_ like RAM was freed even without `free_memory: true`.
2. **Label ambiguity**: the tooltip says "Release VRAM" for the standard path and "deep clean" for Ctrl — but "deep clean" doesn't explicitly say "RAM." The Hotkeys reference panel (`mpi-hotkeys.js` lines 51–52) calls it "Release Memory + Cache" for Ctrl+F5, which is clearer but inconsistent with the button tooltip.

### Hotkey path: Ctrl+F5 is broken

`bindMemoryHotkeys` binds to `memory.refresh` which has `key: 'f5'` (bare, no ctrl prefix). When Ctrl is held, `hotkeyManager._normalizeKey` produces `'control+f5'`, which does not match the `'f5'` registry entry. The handler fires only on a bare F5 press, with `e.ctrlKey` always `false` in that case. So **Ctrl+F5 hotkey deep clean path is dead** — it never calls `triggerMemoryRelease(true, ...)`.

The button Ctrl-click path works correctly (because `_ctrlHeld` is tracked independently via a separate keydown/keyup listener).

---

## Decision

**Recommendation: (B) — Keep two behaviors but fix labels/tooltip AND fix the F5/Ctrl+F5 hotkey, so all three surfaces (button click, button ctrl-click, hotkey) correctly differ as documented.**

Reason: The backend correctly implements two distinct behaviors (`free_memory: false` vs `true`). The two-level design is intentional and valid — a light release (VRAM only) is safer during an active session; deep clean (RAM+VRAM+Manager) is a heavier operation. Collapsing to one action (Option A) would either always do the heavy clear (wasteful) or always do the light one (loses the deep clean path). Fix what's broken (the hotkey) and make the labels consistent and accurate.

---

## Fix

### 1. Fix the Ctrl+F5 hotkey (`js/managers/hotkeyRegistry.js`)

Add a second registry entry for `control+f5`:

```js
{
    id:               'memory.refresh.deep',
    key:              'control+f5',
    type:             KEY_TYPE.DOWN,
    category:         'memory',
    scopeLabel:       'Memory',
    description:      'Deep clean memory (RAM + VRAM)',
    allowWhileTyping: true,
},
```

Then in `js/shell/memoryOps.js` `bindMemoryHotkeys`, also bind the new id:

```js
export function bindMemoryHotkeys(monitorEl) {
    Hotkeys.bind('memory.refresh',      () => triggerMemoryRelease(false, monitorEl));
    Hotkeys.bind('memory.refresh.deep', () => triggerMemoryRelease(true,  monitorEl));
}
```

Remove the `e.ctrlKey` read from the F5 handler (it will always be `false` on a bare F5 hit anyway — this just makes intent explicit and future-proof).

### 2. Fix the button tooltip (`js/components/Compounds/MpiMemoryMonitor/MpiMemoryMonitor.js`, line 86)

Change info text from:
```
'Release VRAM — F5 standard · Ctrl+F5 deep clean'
```
to:
```
'Release VRAM — F5 · Ctrl+click or Ctrl+F5 for deep clean (VRAM + RAM)'
```

This accurately describes what each action does and covers both the button ctrl-click path and the hotkey.

### 3. Fix `memoryOps.js` status text (`js/shell/memoryOps.js`, line 14) — optional clarity

Current:
```js
const statusPrefix = isDeep ? 'Deep Cleaning...' : 'Releasing VRAM...';
```
`showStatus` text after:
```js
monitorEl.showStatus(isDeep ? 'Deep Clean ✓' : 'VRAM Released ✓');
```

These labels are already accurate. No change needed unless requested.

### 4. Update the hotkeys reference panel (`js/components/Compounds/LandingPages/mpi-hotkeys/mpi-hotkeys.js`, lines 51–52)

Existing entries are already accurate:
```html
<li><span>F5</span><span>Release Memory</span></li>
<li><span>CTRL+F5</span><span>Release Memory + Cache</span></li>
```
"Release Memory" is slightly ambiguous (which memory?) — optionally update to:
```html
<li><span>F5</span><span>Release VRAM</span></li>
<li><span>CTRL+F5</span><span>Deep Clean (VRAM + RAM)</span></li>
```

---

## Risk / Verify

### Local engine
1. Open the app, load a model, run a generation.
2. Note VRAM and RAM usage in the memory monitor.
3. Press F5 — status badge should show "Releasing VRAM..." then "VRAM Released ✓". VRAM should drop; RAM should be unchanged (or only OS-level lazy reclaim).
4. Press Ctrl+F5 — status badge should show "Deep Cleaning..." then "Deep Clean ✓". Both VRAM and RAM should drop more aggressively.
5. Ctrl-click the button without pressing any key — should trigger deep clean (status "Deep Cleaning...").
6. Normal click without Ctrl — should trigger VRAM-only release.

### Remote engine (RunPod)
- Note: `/comfy/unload` is handled by `routes/comfy.js` and always targets `127.0.0.1:${COMFYUI_PORT}` (local ComfyUI process). There is no remote-proxy path for this endpoint — it only applies when the local ComfyUI engine is running. When remote is connected, the button still works against the local engine if one is running; otherwise the route returns early (`Not running`). No remote-specific changes needed.
- Verify: connect a RunPod, confirm the release button shows the correct status and does not error out (expected: early return `{ success: true, message: 'Not running' }` since local ComfyUI is not started in remote mode).

### Regression
- Existing F5 hotkey (bare) must continue to work and fire light release only.
- The `memoryMonitor.ctrl.down/up` key tracking (`_ctrlHeld`) is unaffected by the registry change since it listens on `control` key, not `f5`.
