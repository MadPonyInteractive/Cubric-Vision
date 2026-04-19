---
planStatus:
  planId: plan-download-manager-refactor
  title: Download Manager & Engine Install Refactor
  status: ready-for-development
  planType: refactor
  priority: critical
  owner: fabio
  stakeholders: []
  tags: [download, engine, events, architecture]
  created: "2026-04-19"
  updated: "2026-04-19T11:00:00.000Z"
  progress: 0
---

# Download Manager & Engine Install Refactor

## Context

The download manager and engine install systems were implemented without following the project's
event, component, and state patterns. The result is a parallel SSE-based event system that bypasses
the canonical `Events` bus entirely, causing cascading failures:

- After engine upgrade, models show 0% installed even though files are on disk
- UW dependencies re-install on second app launch instead of during upgrade
- Model install state never updates after uninstall
- Multiple simultaneous SSE connections to the same endpoint with no coordination
- No other component can observe engine or download progress

This plan fixes all architectural violations across six files in a strict sequential order that
prevents broken intermediate states.

---

## Critical Files

| File | Role | Issues |
|---|---|---|
| `js/events.js` | Canonical event map | 20+ production events undocumented in MpiEventMap |
| `js/shell.js` | Boot sequence | Unsubscribed listeners, raw DOM, console.log, broken model-sync timing |
| `routes/downloadManager.js` | Backend SSE broadcast | Correct as-is — pure SSE bridge, no frontend rules apply |
| `js/services/downloadService.js` | SSE→Events bridge | Missing re-sync on uninstall, console.log, raw document.body |
| `js/components/Compounds/MpiEngineInstall/MpiEngineInstall.js` | Engine install UI | Own raw SSE connection, bypasses Events, raw DOM, console.log |
| `js/data/modelRegistry.js` | Model install state | console.log, MODELS[].installed mutated outside state proxy |
| `js/components/Blocks/MpiModelsModal/MpiModelsModal.js` | Download progress UI | state:changed polling instead of download:progress, double render race |
| `js/components/Compounds/MpiInstalledDisplay/MpiInstalledDisplay.js` | Per-model card | No destroy(), duplicated formatBytes, cancelled state not handled |

---

## Implementation Steps

Execute strictly in order. Each step must not break the app before the next step begins.

---

### Step 1 — Document all events in js/events.js

**File:** `js/events.js`

Add the full `download:*`, `engine:*`, and `models:*` event families to the `MpiEventMap` typedef.
This step is documentation only — no behaviour changes.

Events to add with their payloads:
```
download:started     { modelId: string, job: DownloadJob }
download:progress    { modelId: string, progress: number, speed: string, downloadedBytes: number, totalBytes: number }
download:complete    { modelId: string }
download:failed      { modelId: string, error: string }
download:paused      { modelId: string }
download:resumed     { modelId: string }
download:cancelled   { modelId: string }
download:uninstalled { modelId: string }
download:installing  { modelId: string }
comfy:needs-restart  { modelId: string }
engine:ready         (no payload)
models:open          (no payload)
models:closed        (no payload)
models:checked       { installedModelIds: string[] }
models:all-installed (no payload)
```

**Verify:** No runtime changes — the EventMap is a typedef comment only.

---

### Step 2 — Fix downloadService.js

**File:** `js/services/downloadService.js`

Two fixes:

**2a. Add reSyncInstalledModels() after uninstall**

In the `download:uninstalled` SSE handler (currently line ~197), after emitting the event, add:
```javascript
reSyncInstalledModels().catch(err => logger.error('[downloadService] re-sync after uninstall failed:', err));
```

**2b. Fix console.log and raw DOM**

- Line 163: replace `console.error` with `logger.error` (import `logger` from `../services/clientLogger.js`)
- Line 154: replace `document.body.appendChild(toastWrap)` with the dom.js pattern:
  ```javascript
  const toastWrap = ce('div');
  document.body.appendChild(toastWrap); // document.body is acceptable for toast portals — see note
  ```
  NOTE: `document.body` is acceptable for toast portals (this is the established shell-level pattern
  already used elsewhere). The only fix here is the `console.error` → `logger.error`.

**Verify:** After uninstalling a model, re-open the models modal — the model should immediately show
as uninstalled (0 progress) without needing to refresh.

---

### Step 3 — Fix MpiEngineInstall.js — remove own SSE, use Events bus

**File:** `js/components/Compounds/MpiEngineInstall/MpiEngineInstall.js`

This is the core architectural fix. The component must stop opening its own `EventSource` and
instead receive engine progress via the `Events` bus, which `downloadService.js` is extended to
bridge (Step 3a).

**3a. Extend downloadService.js to bridge engine:* SSE events to Events bus**

In `downloadService._connectSSE()`, add listeners for all `engine:*` SSE events and re-emit them
on the Events bus:

```javascript
['engine:downloading', 'engine:extracting', 'engine:patching',
 'engine:upgrade-status', 'engine:uw-installing', 'engine:complete',
 'engine:error'].forEach(eventName => {
    this._eventSource.addEventListener(eventName, (e) => {
        const data = e.data ? JSON.parse(e.data) : {};
        Events.emit(eventName, data);
    });
});
```

This makes `downloadService` the single SSE connection for ALL backend events (both download and
engine). `MpiEngineInstall` no longer needs its own `EventSource`.

**3b. Replace _connectSSE() in MpiEngineInstall with Events.on() subscriptions**

Remove the `_connectSSE()` and `_disconnectSSE()` functions and the `_sseConnection` variable.
Replace with `Events.on()` subscriptions stored in an array for cleanup:

```javascript
const _unsubs = [];

function _subscribeEngineEvents() {
    _unsubs.push(Events.on('engine:downloading', (data) => { ... }));
    _unsubs.push(Events.on('engine:extracting',  (data) => { ... }));
    _unsubs.push(Events.on('engine:patching',    (data) => { ... }));
    _unsubs.push(Events.on('engine:upgrade-status', (data) => { ... }));
    _unsubs.push(Events.on('engine:uw-installing',  (data) => { ... }));
    _unsubs.push(Events.on('engine:complete',    ()     => { ... }));
    _unsubs.push(Events.on('engine:error',       (data) => { ... }));
    // Also listen for UW download progress on the universal workflow job
    _unsubs.push(Events.on('download:progress',  (data) => {
        if (data.modelId === '__universal_workflow__') { ... }
    }));
}

function _unsubscribeEngineEvents() {
    _unsubs.forEach(fn => fn());
    _unsubs.length = 0;
}
```

Call `_subscribeEngineEvents()` where `_connectSSE()` was called.
Call `_unsubscribeEngineEvents()` where `_disconnectSSE()` was called.
Update `el.destroy()` to call `_unsubscribeEngineEvents()`.

**3c. Fix raw DOM calls in MpiEngineInstall**

- Line 148: `_pathInputInst.el.querySelector('.mpi-input__field')` → `qs('.mpi-input__field', _pathInputInst.el)`
- Line 271: `el.querySelectorAll('[data-phase]')` → `qsa('[data-phase]', el)` (import `qsa` from dom.js)
- Lines 376, 379: `_progressBarInst.el.querySelector(...)` → `qs(...)` with the element as second arg

**3d. Fix console.log in MpiEngineInstall**

Import `logger` from `../../../services/clientLogger.js`.
Replace lines 176, 246, 265 `console.error(...)` with `logger.error(...)`.

**Verify:** Start app when engine is already installed — no second SSE connection should open for
engine events. Engine progress still displays correctly during upgrade.

---

### Step 4 — Fix shell.js

**File:** `js/shell.js`

Four fixes:

**4a. Fix raw DOM access (lines 65–71)**

Replace all `document.getElementById(...)` with `qs('#id')` from dom.js (already imported).

**4b. Fix unsubscribed Events.on() calls**

All `Events.on()` calls in shell.js must store their unsubscribe functions. Since `shell.js` is a
module-level singleton (never destroyed), the cleanup is less critical than in components, but the
pattern must be consistent. Use an array:

```javascript
const _shellUnsubs = [];
// Then: _shellUnsubs.push(Events.on('comfy:starting', ...));
```

For the `engine:ready` one-shot pattern (currently uses manual `Events.off`), replace with the
canonical pattern:
```javascript
let _engineReadyUnsub;
_engineReadyUnsub = Events.on('engine:ready', () => {
    _engineReadyUnsub(); // self-unsubscribe
    resolve();
});
```

**4c. Fix console.log (lines 112, 168, 188, 220, 230)**

Import `logger` from `./services/clientLogger.js` and replace all `console.error`/`console.log`
with `logger.error`/`logger.info`.

**4d. Fix model-sync timing after boot**

Currently, the non-install boot path (engine already installed, no upgrade needed) calls
`_bootApp()` which resolves immediately — model sync only happens when `_initDataRegistries()`
fires its parallel `syncModelInstalled()`. This is a race.

Make the sync explicit in `_bootApp()` after the promise resolves:
- After `_engineInstall.el.hide()` in the `engine:ready` handler and in the direct-resolve paths,
  ensure `syncModelInstalled()` is called (or already reliably scheduled by `_initDataRegistries`).
- Specifically: the `engine:ready` listener in `_initDataRegistries()` should be the authoritative
  trigger — document this clearly with a comment, and ensure it fires before any workspace renders.

**Verify:** On cold boot with engine installed, models show as installed immediately on first
workspace load.

---

### Step 5 — Fix modelRegistry.js

**File:** `js/data/modelRegistry.js`

Two fixes:

**5a. Fix console.log (lines 53, 124)**

Import `logger` from `../services/clientLogger.js`.
Replace `console.warn` and `console.error` with `logger.warn` / `logger.error`.

**5b. Document that MODELS[].installed is module-level state**

Add a comment in `syncModelInstalled()` explaining that `MODELS[].installed` is intentionally
module-level (not in state proxy) because it is always read from the MODELS reference directly
by components, and the authoritative reactive signal is `models:checked` on the Events bus.

NOTE: Do NOT move MODELS[].installed into the state proxy — this would require all model data
to flow through state, which is a larger architectural change. The current pattern is acceptable;
it just needs to be documented.

**Verify:** No behaviour change — this step is logging + documentation.

---

### Step 6 — Fix MpiModelsModal.js — use download:progress instead of state polling

**File:** `js/components/Blocks/MpiModelsModal/MpiModelsModal.js`

Two fixes:

**6a. Replace state:changed progress polling with download:progress event**

Per `downloads.md` Rule 4: components must subscribe to `download:progress` via Events.on(),
not poll `state.downloadJobs`.

Currently MpiModelsModal re-renders the entire card list on every `state:changed` for
`downloadJobs`. Replace with:

- Keep `state:changed` listener for `s_installedModelIds` only (install status changes)
- Add `Events.on('download:progress', ({ modelId, progress, speed, downloadedBytes, totalBytes }) => { ... })`
  that updates only the affected card in-place by calling `MpiInstalledDisplay.el.setProgress(...)`
  rather than re-rendering the full list.

For the in-place update to work, the card render must store a reference to each mounted
`MpiInstalledDisplay` instance keyed by `modelId`, rather than discarding them on each render.

Implementation approach:
```javascript
// Store card instances: Map<modelId, { wrapper, display }>
const _cardInstances = new Map();

_unsubs.push(Events.on('download:progress', ({ modelId, progress, speed }) => {
    const card = _cardInstances.get(modelId);
    if (card) card.display.el.setProgress({ progress, speed });
}));
```

**6b. Fix double render on download:complete**

Remove the synchronous `renderList()` call at line 329 — `awaitReSync()` already calls
`renderList()` after the async wait. Keeping the synchronous call renders stale data.

**6c. Add missing download event handlers**

Add `Events.on` for: `download:paused`, `download:resumed`, `download:installing`,
`download:started` — each should update the affected card's state display.

**Verify:** During an active download, open the models modal — the progress bar should update
smoothly without the entire list flickering. After download completes, the card should
immediately show "Installed".

---

### Step 7 — Fix MpiInstalledDisplay.js

**File:** `js/components/Compounds/MpiInstalledDisplay/MpiInstalledDisplay.js`

Three fixes:

**7a. Add el.setProgress() and el.setDownloadState() public APIs**

So that MpiModelsModal can update cards in-place (Step 6a) without full re-render:

```javascript
el.setProgress = ({ progress, speed, downloadedBytes, totalBytes }) => {
    // Update progress bar value and info text in-place
};

el.setDownloadState = (downloadState) => {
    // Show/hide buttons and update variant
};
```

**7b. Add el.destroy()**

Define `el.destroy()` that calls `.destroy()` on all mounted child instances
(MpiIcon, MpiBadge, MpiButton instances, MpiProgressBar).

**7c. Handle downloadState: 'cancelled'**

Add a `cancelled` branch in the button logic that shows a "Reinstall" or neutral idle state,
so the card never renders with no buttons.

**7d. Remove duplicated _formatBytes**

Move `_formatBytes` to `js/utils/formatBytes.js` (new small utility file) and import it
in both MpiInstalledDisplay and MpiModelsModal. If a shared utility file already exists,
add it there instead.

**Verify:** During a download, progress bar updates in-place. After cancel, card shows
correct state. No console errors about missing buttons.

---

### Step 8 — Update architectural documentation

**Files:** `.claude/rules/downloads.md`, `.claude/rules/component-events.md`

**8a. Update downloads.md**

- Document the single-SSE-connection architecture: `downloadService` is the ONLY component
  that opens an SSE connection. All other frontend code uses `Events.on()`.
- Add `engine:*` event family to the documented event list.
- Add rule: "Never open a second EventSource from a component — subscribe via Events.on() instead."

**8b. Update component-events.md**

Add entries for:
- `MpiEngineInstall` — EMITS: `engine:ready` (via Events bus) | LISTENS: `engine:*` events via Events.on()
- `MpiModelsModal` — LISTENS: `download:progress`, `download:complete`, `download:failed`,
  `download:paused`, `download:resumed`, `download:cancelled`, `download:started`, `models:checked`

---

## End-to-End Verification

After all steps are complete, verify these scenarios:

1. **Fresh install:** First-time app launch → install screen → engine downloads → UW deps install →
   app loads → models modal shows all models as uninstalled (correct)

2. **Engine upgrade:** Bump version in `system_dependencies.json` → restart app → upgrade screen
   appears → engine downloads → app loads → models modal shows all previously installed models
   as installed (files on disk, no re-download needed)

3. **Model download:** Click install on a model → progress bar updates smoothly in modal →
   on complete, card flips to "Installed" immediately, no manual refresh needed

4. **Model uninstall:** Click uninstall → card immediately shows as uninstalled → re-open modal
   confirms uninstalled state (no stale data)

5. **UW deps:** Fresh engine install → UW deps install during engine install, not on second launch

6. **Second SSE connection audit:** In DevTools Network tab, confirm only ONE connection to
   `/comfy/downloads/stream` exists at any time (not two)

---

## Notes

- `routes/downloadManager.js` and `routes/engine.js` are backend files — the frontend rules
  (Events bus, dom.js, clientLogger, BEM) do not apply. Do not touch them in this refactor.
- The `_broadcast` / `broadcastEngineEvent` SSE system in the backend is correct and intentional.
  The refactor is purely frontend-side: consolidate to one SSE connection in `downloadService`,
  bridge all events to the Events bus there, remove all other direct SSE connections.
- Step order matters: Step 3a (extending downloadService to bridge engine:* events) MUST be done
  before Step 3b (removing MpiEngineInstall's own EventSource), or engine events will be lost.
