/**
 * shell.js — App Orchestrator.
 * Wires up sub-modules for window controls, projects, memory, and navigation.
 */

import { state } from './state.js';
import { APP_CONFIG } from '../dev_configs/app_config.js';
import { onNavigate, PAGE_LANDING } from './router.js';
import { syncModelInstalled } from './data/modelRegistry.js';
import { loadAll as loadAssets } from './services/assetService.js';
import { Events } from './events.js';
import { Storage, Session } from './core/storage.js';
import { clientLogger } from './services/clientLogger.js';
import { qs } from './utils/dom.js';

// Components
import { MpiMemoryMonitor } from './components/Compounds/MpiMemoryMonitor/MpiMemoryMonitor.js';
import { MpiProjectName } from './components/Compounds/MpiProjectName/MpiProjectName.js';
import { MpiErrorDialog } from './components/Compounds/MpiErrorDialog/MpiErrorDialog.js';
import { MpiStartingComfy } from './components/Compounds/MpiStartingComfy/MpiStartingComfy.js';
import { MpiEngineInstall } from './components/Compounds/MpiEngineInstall/MpiEngineInstall.js';
import { MpiChangelogDialog } from './components/Compounds/MpiChangelogDialog/MpiChangelogDialog.js';
import { MpiModelManager } from './components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js';
import { MpiOkCancel } from './components/Compounds/MpiOkCancel/MpiOkCancel.js';
import { getModelsByType } from './data/modelRegistry.js';
import { APP_VERSION } from './core/appVersion.js';
import { APP_STAGE_LABEL } from './core/appStage.js';
import { getReleaseNotes, hasReleaseContent } from './data/releaseNotes.js';

// Shell Sub-modules
import { preloadComponentStyles } from './shell/preloadStyles.js';
import { bindWindowControls } from './shell/windowControls.js';
import { initProjectUI, loadProjectGrid } from './shell/projectUI.js';
import { initHeroStats } from './shell/heroStats.js';
import { start as startProjectStats } from './services/projectStatsService.js';
import { triggerMemoryRelease, bindMemoryHotkeys } from './shell/memoryOps.js';
import { StatusBar } from './shell/statusBar.js';
import { initNavigation, handleNavigation, updateTitlebarProject } from './shell/navigation.js';
import { initNotificationService } from './shell/notificationService.js';
import { initFocusModeService } from './shell/focusModeService.js';
import { Hotkeys } from './managers/hotkeyManager.js';

// Internal references for communication
let _projectNameInstance = null;

// ── Remote engine transition phase (MPI-73) ────────────────────────────────────
// Shared between the boot auto-reconnect and the persistent connection feed so the
// feed's phase-less status emits don't clobber the boot/Settings "connecting" /
// "disconnecting" feedback (the hero card + status bar read this phase). Settings
// emits its own phase directly; boot + feed go through `_emitRemoteConnection`.
let _remotePhase = null; // 'connecting' | 'disconnecting' | null

// Mirror the transition phase into global `state` so consumers can read it at
// mount (race-free) — not only via the live event. Top-level assign fires
// state:changed; skip a no-op write so we don't churn the bus.
function _setRemotePhase(phase) {
  _remotePhase = phase || null;
  if (state.remoteEnginePhase !== _remotePhase) state.remoteEnginePhase = _remotePhase;
}

/**
 * Emit `remote:connection`, folding in the active transition phase. A non-phase
 * payload during a transition is suppressed for the `connected:false` case so a
 * feed tick that sees "not ready yet" mid-connect can't wipe the "connecting"
 * feedback. Passing an explicit `phase` (string or null) sets/clears the shared
 * phase and always emits.
 */
function _emitRemoteConnection(payload = {}) {
  const hasExplicitPhase = Object.prototype.hasOwnProperty.call(payload, 'phase');
  if (hasExplicitPhase) {
    _setRemotePhase(payload.phase || null);
    Events.emit('remote:connection', payload);
    return;
  }
  // No explicit phase (a feed status update). A genuine connected:true clears any
  // active phase; otherwise FOLD the current phase into the emit so a feed tick
  // never strips "connecting"/"disconnecting" — and so a late subscriber (e.g. a
  // PromptBox mounted mid-connect) receives the phase on the next tick.
  if (payload.connected === true) _setRemotePhase(null);
  Events.emit('remote:connection', { ...payload, phase: _remotePhase });
}

// ── Global dialog singletons ──────────────────────────────────────────────────
const _errorDialog = MpiErrorDialog.mount(document.createElement('div'));
const _startingComfy = MpiStartingComfy.mount(document.createElement('div'));
const _engineInstall = MpiEngineInstall.mount(document.createElement('div'));
const _changelogDialog = MpiChangelogDialog.mount(document.createElement('div'));

/**
 * Show a user-facing error dialog with an optional log download button.
 * @param {string} title   - Short error title (e.g. "ComfyUI failed to start")
 * @param {string} message - Actionable detail shown to the user
 */
export function showError(title, message) {
  _errorDialog.el.setError(title, message);
  _errorDialog.el.show();
}


/**
 * Main initialization entry point called by init.js.
 */
export async function initShell() {
  // 0. Init hotkey manager (attaches window listeners, registers builtins)
  Hotkeys.init();

  // 0.1. Apply persisted pixel-mode preference to <html> for CSS-scoped image-rendering
  {
    const mode = (state.pixelMode === 'smooth' || state.pixelMode === 'pixel') ? state.pixelMode : 'auto';
    document.documentElement.classList.add(`pixel-mode-${mode}`);
  }

  // 1. Performance: Preload all styles to prevent FOUC
  preloadComponentStyles();

  // 2. DOM Selection
  const pageLanding = qs('#page-landing');
  const appShell = qs('#app-shell');
  const toolContainer = qs('#tool-container');
  const radialMount = qs('#radial-mount');
  const monitorMount = qs('#memory-monitor-mount');
  const projectNameMount = qs('#project-name-mount');

  // 3. Mount Global HUD Components
  _projectNameInstance = MpiProjectName.mount(projectNameMount, {
    projectName: state.currentProject?.name || '',
  });

  const memMonitor = MpiMemoryMonitor.mount(monitorMount);

  // 4. Bind Interactions
  initProjectUI();
  initHeroStats();
  startProjectStats();
  StatusBar.init();
  StatusBar.listen();
  bindWindowControls();
  bindMemoryHotkeys(memMonitor);

  // 5. Initialize Navigation Orchestrator
  initNavigation({
    pageLanding,
    appShell,
    toolContainer,
    radialMount,
    projectNameInstance: _projectNameInstance
  });

  // Wiring actions to logic
  // Note: 'back' and 'workspace' on _projectNameInstance are wired inside initNavigation()
  memMonitor.on('release', ({ deep }) => triggerMemoryRelease(deep, memMonitor.el));

  // 6. Router Integration
  onNavigate((page, params) => {
    // Dev Mode Persistence
    if (APP_CONFIG.test_styles) {
      Session.setDevPage(page);
      Session.setDevParams(params || {});
    }
    handleNavigation(page, params);
  });

  // 6.5. Shell-level services
  initNotificationService();
  initFocusModeService();
  _initRemoteConnectionFeed();
  _initEngineDropRecovery();

  // 7. Data Pre-fetching (Non-blocking)
  _initDataRegistries().catch(err => clientLogger.error('shell', 'registry failed:', err));

  // 8. Boot/Restore Logic
  _bootApp();
}

/**
 * Restores session state in dev_mode or defaults to landing.
 * Also checks engine provisioning status before allowing app to boot.
 */
async function _bootApp() {
  // 1. Navigate to landing immediately (will be blocked if engine install needed)
  handleNavigation(PAGE_LANDING);

  // 2. Check engine version before anything else.
  // Remote mode (MPI-64/MPI-85): only an AUTO-CONNECT-ON-START boot takes the
  // parallel remote gate path that skips the local engine version/install gate —
  // a local engine is not required when we are auto-spinning a Pod at launch.
  // With auto-connect OFF (the default), boot runs LOCAL even when RunPod is
  // `enabled` (enabled = "remote available / show panel"), so the local engine
  // gate MUST run. (`else try` keeps the local path untouched.)
  const runpodCfg = Storage.getRunpodConfig();
  if (runpodCfg.autoConnectOnStart) {
    await _initRemoteBoot(runpodCfg);
  } else try {
    const versionRes = await fetch('/engine/version-check');
    const versionData = await versionRes.json();

    if (versionData.needsInstall) {
      // Block app — show install UI
      // Component will trigger download when user clicks Install button
      _engineInstall.el.show('installing');
    } else if (versionData.needsUpgrade) {
      // Block app — show upgrade UI
      // Component will trigger upgrade when shown
      _engineInstall.el.show('upgrading');
    }

    // Wire engine:ready to hide install modal and continue boot
    await new Promise((resolve) => {
      let unsub;
      unsub = Events.on('engine:ready', () => {
        _engineInstall.el.hide();
        unsub();
        resolve();
      });

      // If engine already current, check if UW deps need installing
      if (!versionData.needsInstall && !versionData.needsUpgrade) {
        // Engine is current — check if universal workflow deps are missing
        fetch('/engine/deps-status').then(res => res.json()).then(depsData => {
          if (depsData.needsDepsInstall) {
            // Show repairing modal and let SSE drive completion
            _engineInstall.el.show('repairing');
          } else {
            // Engine current and deps installed — boot immediately
            resolve();
          }
        }).catch(() => {
          // Deps check failed — proceed anyway
          resolve();
        });
      }
    });
  } catch (err) {
    clientLogger.error('shell', 'Engine version check failed:', err);
    // Proceed anyway — if engine is truly missing, comfy startup will fail
  }

  // 3. Restore dev state if applicable (after engine check is done)
  if (APP_CONFIG.test_styles) {
    const savedPage = Session.getDevPage();
    const savedParams = Session.getDevParams() || {};
    handleNavigation(savedPage || PAGE_LANDING, savedParams);
  }

  // 3.5. Changelog overlay — show once per APP_VERSION, after engine/deps gates
  // and dev-state restore, but BEFORE optional Comfy auto-start so it never
  // competes with mandatory engine provisioning. Not an updater (MPI-46).
  _maybeShowChangelog();

  // Wire startup modal to comfy engine events.
  // comfyController emits these events; shell owns the component reference.
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('comfy:starting', () => _startingComfy.el.show());
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('comfy:ready',    () => { _startingComfy.el.hide(); loadAssets(); });
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('comfy:error',    ({ message }) => _startingComfy.el.setError(message));
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('ui:error',       ({ title, message }) => showError(title, message));

  // Model manager opens in the right slide-over (user-initiated or zero-install gate).
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('models:open', () => {
    Events.emit('slide-over:open', { title: 'Models', component: MpiModelManager });
  });

  // ComfyUI Auto-start (optional). Local boot only here — when auto-connecting to a
  // Pod at start the remote path owns engine bring-up, so skip the local auto-start.
  // (MPI-85: gate on autoConnectOnStart, not `enabled` — an enabled-but-not-auto
  // boot is a LOCAL boot and should honor the auto-start ComfyUI pref.)
  if (Storage.getAutoStartComfy() && !runpodCfg.autoConnectOnStart) {
    const { ComfyUIController } = await import('./services/comfyController.js');
    ComfyUIController.ensureServerRunning();
  }
}

/**
 * Remote-mode boot path (MPI-64 Step 4.3). Marks the backend in remote mode. If
 * the app was left CONNECTED (wasConnected + a saved podId + gpuType), it
 * AUTO-RECONNECTS in the background — warm-resuming the stopped Pod, or, if its
 * host is full / the GPU is gone, deleting + recreating fresh on the same GPU
 * (the reconnect endpoint owns that fallback). If the saved GPU is unavailable,
 * it pops a "pick another GPU" dialog and creates nothing. Otherwise (enabled but
 * never connected / explicitly disconnected) it just shows the advisory.
 */
/**
 * Poll /remote/comfy/status until the wrapper reports ready, or until timeout.
 * Replaces the backend's old inline long-poll (which 504'd on a long first-image
 * pull). Fires `onSlow` once when the wait crosses `slowAfterMs` — the signal of
 * a fresh-image cold pull (~3 GB) vs a normal ~90-120s cold create. Readiness is
 * gated on ComfyUI being up only; the first boot on a fresh volume/GPU arch also
 * pays a one-time sageattention compile (~5-15 min) that does NOT block readiness
 * (SDPA fallback) but does extend the wait — hence the 20-min timeout.
 * @returns {Promise<boolean>} true once ready, false on timeout.
 */
// MPI-87: elapsed→% estimate for the connect window. RunPod's public API carries
// no real image-pull/layer progress, so this maps elapsed time onto a typical
// first-pull duration and clamps to 99 until /health reports ready (then 100).
// Honest approximation, not a layer count. ~4 min covers a fresh ~3 GB image pull.
const _CONNECT_EST_MS = 240000;
function _connectPct(elapsedMs) {
  return Math.max(0, Math.min(99, Math.round((elapsedMs / _CONNECT_EST_MS) * 100)));
}

async function _pollRemoteReady({ timeoutMs = 1200000, intervalMs = 4000, slowAfterMs = 150000, onSlow } = {}) {
  const start = Date.now();
  let slowFired = false;
  while (Date.now() - start < timeoutMs) {
    if (!slowFired && onSlow && Date.now() - start >= slowAfterMs) {
      slowFired = true;
      try { onSlow(); } catch (_) { /* notify best-effort */ }
    }
    // MPI-87: surface an elapsed-based connect % (RunPod's API exposes no real
    // image-pull progress — see docs/runpod-remote-engine.md). An estimate, not a
    // layer count: climb 0→99 over the typical first-pull window, hold 99 until
    // /health flips ready (heroStats paints it in the GPU slot while connecting).
    Events.emit('remote:connect-progress', { pct: _connectPct(Date.now() - start) });
    try {
      const res = await fetch('/remote/comfy/status');
      const s = res.ok ? await res.json() : null;
      if (s && s.ready) { Events.emit('remote:connect-progress', { pct: 100 }); return true; }
    } catch (_) { /* transient during cold pull / proxy 404 window */ }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function _initRemoteBoot(runpod) {
  // Reached only when `autoConnectOnStart` is ON (MPI-85) — the caller gates on it.
  // Flag remote mode active so status polls + teardown target the saved podId; the
  // boot gate only needs `active` to skip the local install path. deleteOnQuit is
  // synced here so quit-teardown honors the pref even if the user never opens
  // Settings this session.
  try {
    const body = runpod.podId ? { active: true, podId: runpod.podId } : { active: true };
    body.deleteOnQuit = runpod.deleteOnQuit === true;
    await fetch('/remote/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    clientLogger.error('shell', 'remote mode sync failed:', err);
  }

  // With delete-on-quit the previous Pod was DELETED at quit, so its saved podId
  // is dead — auto-resuming it just fails ("pod not found"), recreates fresh, and
  // shows a misleading "resuming…" label. Skip auto-reconnect entirely; the user
  // Connects fresh (correct "creating…" copy) from Settings.
  const canAutoReconnect = !!(
    runpod.wasConnected && runpod.podId && runpod.gpuType && !runpod.deleteOnQuit
  );
  // delete-on-quit deleted the Pod at quit, so any saved podId is now dead. Clear
  // it (via the state proxy so the in-memory copy Settings reads also updates, not
  // just localStorage) so the create path runs with correct "creating…" copy
  // instead of a doomed "resuming…" resume of a nonexistent Pod.
  if (!canAutoReconnect && runpod.deleteOnQuit && runpod.podId) {
    state.runpodConfig = { ...runpod, podId: null, wasConnected: false };
  }
  // MPI-85 fix: when there is no warm Pod to resume, auto-connect-on-start CREATES
  // a fresh Pod (the checkbox means "connect at launch", which on a first/no-Pod
  // boot must spin one up — not silently no-op). Only when there is no GPU saved is
  // there nothing to connect with; bail then and let the user Connect from Settings.
  if (!canAutoReconnect && !runpod.gpuType) {
    return;
  }

  // Auto-connect in the background (UI stays usable during the resume/create).
  // MPI-73: surface the transition — hero "connecting · offline" (no card), status
  // bar "IDLE · Connecting". Resolved on ready (connected:true) or failure below.
  // A warm Pod warm-resumes (reconnect); otherwise create fresh (MPI-85).
  const warm = canAutoReconnect;
  StatusBar.notify(warm ? 'Reconnecting to your Pod…' : 'Creating a Pod…', 'info', 6000);
  _emitRemoteConnection({ connected: false, gpuName: null, vramGb: null, ramGb: null, phase: 'connecting' });
  let _bootConnected = false; // MPI-73: resolves the 'connecting' phase
  try {
    const endpoint = warm ? '/remote/pod/reconnect' : '/remote/pod/create';
    const body = warm
      ? { podId: runpod.podId, gpuTypeId: runpod.gpuType, volumeId: runpod.volumeId || null, datacenter: runpod.datacenter || null }
      : { gpuTypeId: runpod.gpuType, volumeId: runpod.volumeId || null, datacenter: runpod.datacenter || null };
    clientLogger.info('shell', `[RunPod] auto-connect-on-start: ${warm ? 'reconnect' : 'create'} gpu=${runpod.gpuType} dc=${runpod.datacenter || 'none'} vol=${runpod.volumeId || 'none'} podId=${runpod.podId || 'none'}`);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));

    if (data.unavailable) {
      // Saved GPU gone — the stuck Pod was deleted server-side; clear the saved
      // intent so the next boot does not retry, and tell the user to pick another.
      const cfg = Storage.getRunpodConfig();
      Storage.setRunpodConfig({ ...cfg, podId: null, wasConnected: false });
      const dlg = MpiOkCancel.mount(document.createElement('div'), {
        title: 'Selected GPU unavailable',
        text: 'The GPU your Pod was using is unavailable right now. Open Settings → RunPod and pick a different GPU to connect.',
        okLabel: 'Got it',
        showCancel: false,
      });
      dlg.el.show();
      return;
    }

    if (data.podId) {
      const cfg = Storage.getRunpodConfig();
      Storage.setRunpodConfig({ ...cfg, podId: data.podId });
    }
    if (!res.ok || (!data.ready && !data.starting)) {
      throw new Error(data.message || 'reconnect did not start');
    }
    // The backend now returns `starting` immediately (no 504 on a long first-image
    // pull); poll /remote/comfy/status until ready. A fresh image tag can take a
    // few minutes the first time it is pulled onto a host.
    const ready = await _pollRemoteReady({
      onSlow: () => StatusBar.notify(
        'First-time setup: downloading the engine and optimising it for your GPU (one time, a few minutes — much faster next time)…',
        'info', 8000),
    });
    if (ready) {
      // MPI-88: a no-GPU "download mode" Pod has no ComfyUI / no preview WS — skip
      // the WS gate (wrapper-ready IS connected). Otherwise the boot auto-reconnect
      // hangs at "Almost ready" and the hero never flips to remote.
      const downloadMode = runpod.gpuType === '__cpu__';
      // Wrapper health is ready (ComfyUI up), but the binary-preview WS is opened
      // lazily at generation time — so "ready" alone lets a user queue a job
      // before the WS handshake, hanging it in STARTING (MPI-73 Bug 1). Open the
      // WS now and only claim "ready" once it actually connects.
      let wsOk = downloadMode;
      if (!downloadMode) {
        try {
          const { ComfyUIController } = await import('./services/comfyController.js');
          wsOk = await ComfyUIController.ensureWsConnected();
        } catch (_) { /* fall through to the not-ready notice */ }
      }
      if (wsOk) {
        // MPI-73: resolve the 'connecting' phase → flip the hero to the Pod card +
        // status bar to "IDLE · Remote". Specs best-effort for the card.
        let specs = { gpuName: runpod.gpuType || null, vramGb: null, ramGb: null };
        try {
          const qp = runpod.gpuType ? `?gpuTypeId=${encodeURIComponent(runpod.gpuType)}` : '';
          const sr = await fetch(`/remote/pod/specs${qp}`);
          if (sr.ok) specs = await sr.json();
        } catch (_) { /* keep the fallback */ }
        _emitRemoteConnection({ connected: true, ...specs, phase: null });
        _bootConnected = true;
        // Remember the connection so the NEXT boot warm-resumes this Pod instead of
        // creating another (mirrors manual Connect). A create yields a new podId,
        // already persisted above (data.podId branch).
        {
          const cfg = Storage.getRunpodConfig();
          Storage.setRunpodConfig({ ...cfg, wasConnected: true });
        }
        StatusBar.notify('Remote engine ready', 'success', 6000);
      } else {
        StatusBar.notify('Almost ready — finishing the connection. Try generating in a moment.', 'info', 8000);
      }
    } else {
      throw new Error('the Pod did not reach ready in time — open Settings → RunPod to retry');
    }
  } catch (err) {
    clientLogger.error('shell', `remote auto-${warm ? 'reconnect' : 'create'} failed:`, err);
    const retry = MpiOkCancel.mount(document.createElement('div'), {
      title: warm ? 'Could not reconnect to your Pod' : 'Could not create a Pod',
      text: (err && err.message) || 'The remote engine could not be reached. Open Settings → RunPod to connect manually.',
      okLabel: 'Open later',
      showCancel: false,
    });
    retry.el.show();
  } finally {
    // MPI-73: clear the transient 'connecting' phase if the (re)connect did not
    // fully connect (unavailable GPU, timeout, WS never handshook, threw) so the
    // hero/status bar fall back to local · offline instead of staying stuck.
    if (!_bootConnected) {
      _emitRemoteConnection({ connected: false, gpuName: null, vramGb: null, ramGb: null, phase: null });
      // Billing guardrail (mirrors the manual Connect path): a boot create that
      // didn't finish may have left a STRAY Pod. Reap non-keeper 'cubric-vision'
      // Pods now; the still-preparing tracked Pod is spared server-side.
      fetch('/remote/pod/cleanup-orphans', { method: 'POST' }).catch(() => {});
    }
  }
}

/**
 * Persistent remote-connection feed (MPI-64 Step 4.4). Polls the backend
 * remote-engine status app-wide (not just while Settings is open) and broadcasts
 * `remote:connection` { connected, gpuName } ONLY when the connected state flips.
 * The landing hero footer + the gallery status bar subscribe so the user always
 * knows whether they are running locally or on a (billing) Pod. Cheap: one poll
 * every 5s when healthy, no-op'd entirely when RunPod is disabled.
 *
 * Backoff (B4): when the engine is down/unreachable the status fetch can hang
 * slowly against a dead/restarting proxy. A fixed 5s interval then overlaps slow
 * requests and piles up thousands of in-flight fetches (observed 6000+), making
 * the whole app lag. So each tick is (a) abortable with a hard timeout so a hung
 * request can't outlive its slot, and (b) self-scheduled with an exponential
 * backoff (5s → 30s cap) while disconnected, snapping back to 5s on recovery.
 */
function _initRemoteConnectionFeed() {
  let _last = null; // last broadcast connected bool (null = nothing sent yet)

  // Track the transition phase from ANY `remote:connection` emit carrying an
  // explicit phase — including Settings Connect/Disconnect (a different module) —
  // so this feed's phase-less status ticks don't clobber a transition the user
  // started from the UI (MPI-73). `_emitRemoteConnection` keeps `_remotePhase` in
  // sync for boot + feed; this covers the Settings-initiated case.
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('remote:connection', (p) => {
    if (p && Object.prototype.hasOwnProperty.call(p, 'phase')) _setRemotePhase(p.phase || null);
  });

  const HEALTHY_MS = 5000;
  const MAX_BACKOFF_MS = 30000;
  const FETCH_TIMEOUT_MS = 4000;
  let _delay = HEALTHY_MS;

  // MPI-94 L5 — debounce the offline flip. A single failed/timed-out
  // `/remote/comfy/status` poll (common under download load, when the wrapper is
  // busy serving aria2c) used to flip the hero/status bar to `local · offline`
  // for one tick before the next poll recovered. Require N CONSECUTIVE misses
  // before broadcasting disconnected; the connected edge still repaints
  // immediately (only the bad edge is debounced). The genuine engine-drop path
  // (`_initEngineDropRecovery`, sticky `phase:'disconnected'`) is separate and
  // unaffected. Stakes raised by MPI-85 local-fallback — a false offline now
  // silently swaps to the local engine.
  const MISS_THRESHOLD = 3;
  let _misses = 0;

  // Treat a known-active remote download as keep-alive: while the wrapper is
  // downloading models it can be too busy to answer the status poll in 4s, but
  // it is plainly still connected. Arm on `download:started`/`:progress`,
  // disarm on the terminal edges.
  const _activeDownloads = new Set();
  const _armDl = ({ modelId }) => { if (modelId != null) _activeDownloads.add(modelId); };
  const _disarmDl = ({ modelId }) => { if (modelId != null) _activeDownloads.delete(modelId); };
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('download:started', _armDl);
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('download:progress', _armDl);
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('download:complete', _disarmDl);
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('download:failed', _disarmDl);
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('download:cancelled', _disarmDl);

  const tick = async () => {
    const cfg = Storage.getRunpodConfig();
    if (!cfg.enabled) {
      _misses = 0;
      if (_last !== false) {
        _last = false;
        _emitRemoteConnection({ connected: false, gpuName: null });
      }
      _delay = HEALTHY_MS; // disabled is a steady state, not an error
      return;
    }
    let connected = false;
    try {
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
      let s = null;
      try {
        const res = await fetch('/remote/comfy/status', { signal: ac.signal });
        s = res.ok ? await res.json() : null;
      } finally {
        clearTimeout(to);
      }
      // Gate "connected" on BOTH the wrapper being up (`ready`) AND ComfyUI
      // actually serving (`comfyReady`) — after an OOM container self-restart the
      // wrapper reports ready while ComfyUI is still re-initialising (A3); reading
      // only `ready` left the status bar painting a false ONLINE / never repainting
      // on recovery. `comfyReady` is undefined on older status payloads, so only
      // apply the extra gate when the field is actually present (no regression for
      // a wrapper that doesn't report it).
      // MPI-88: a no-GPU "download mode" Pod has NO ComfyUI by design, so
      // `comfyReady` is always false — skip the comfyReady gate for it; the
      // wrapper being `ready` is the real connected signal. Without this the hero
      // painted "LOCAL · OFFLINE" while Settings showed "ready" (the feed and the
      // panel disagreed) even though the volume models were live.
      connected = !!(s && s.ready && (s.noGpu || s.comfyReady === undefined || s.comfyReady));
    } catch (_) {
      connected = false;
    }
    // Healthy → poll at the base cadence; down/unreachable → back off so slow
    // requests against a dead proxy can't pile up.
    _delay = connected ? HEALTHY_MS : Math.min(_delay * 2, MAX_BACKOFF_MS);

    // MPI-94 L5 — debounce the offline flip. Count consecutive misses; suppress
    // the flip while a download is active (keep-alive) or until MISS_THRESHOLD
    // consecutive misses. A connected tick resets the counter immediately.
    if (connected) {
      _misses = 0;
    } else {
      _misses += 1;
      const suppress = _activeDownloads.size > 0 || _misses < MISS_THRESHOLD;
      if (suppress && _last) return; // stay shown-connected; keep backing off
    }
    if (!connected) {
      if (connected !== _last) {
        _last = connected;
        _emitRemoteConnection({ connected: false, gpuName: null, vramGb: null, ramGb: null });
      }
      return;
    }
    _last = connected;
    // Resolve GPU/VRAM/RAM + the live session figures (uptime/cost — MPI-80) for
    // the badge (best-effort; falls back to the id). Re-fetched EVERY connected
    // tick (not just on the connect edge) so the session-cost badge climbs live;
    // GPU/VRAM/RAM are static so re-emitting them is an idempotent repaint.
    let specs = { gpuName: cfg.gpuType || null, vramGb: null, ramGb: null };
    try {
      const qp = cfg.gpuType ? `?gpuTypeId=${encodeURIComponent(cfg.gpuType)}` : '';
      const r = await fetch(`/remote/pod/specs${qp}`);
      if (r.ok) specs = await r.json();
    } catch (_) { /* keep the fallback */ }
    _emitRemoteConnection({ connected: true, ...specs });
  };

  // Self-scheduling loop (not setInterval): each run waits for the previous to
  // finish, then re-arms after `_delay`, so a slow/hung tick can never overlap
  // and pile up requests. `_delay` is updated inside tick (HEALTHY ↔ backoff).
  const run = async () => {
    try {
      await tick();
    } finally {
      setTimeout(run, _delay);
    }
  };
  run();
}

/**
 * Engine-drop recovery (MPI-64 A1 / B4 part 2/4). `comfyController._onWsDropped`
 * emits `remote:engine-dropped` when the remote preview WS dies mid-generation
 * with no clean close — the classic case is a container OOM (exit 137) that
 * RunPod auto-restarts out-of-band, so the renderer is left holding a dead WS.
 *
 * Before this, the connection feed independently saw `/remote/comfy/status` go
 * not-ready and painted plain `local · offline` + the local GPU card — i.e. the
 * app masqueraded as if the user chose to go offline, with no toast, no recovery,
 * and empty project/model panels, requiring an app relaunch.
 *
 * This makes the drop a DISTINCT, recoverable signal:
 *  - a sticky `phase:'disconnected'` (folded into every subsequent feed tick by
 *    `_emitRemoteConnection`) so the hero shows `remote · disconnected` and the
 *    status bar `IDLE · Disconnected`, NOT plain local;
 *  - an actionable info toast (NOT the bug-reporter modal) telling the user to
 *    reconnect — reconnection is MANUAL (Settings → RunPod → Connect) by design,
 *    so we never surprise-rebill a Pod the user may have wanted stopped;
 *  - automatic recovery on the connected edge: `_emitRemoteConnection` clears the
 *    phase on `connected:true`, and the existing connect-edge `syncModelInstalled`
 *    (see `_initDataRegistries`) re-hydrates the model panel — no app relaunch.
 *
 * The stuck in-flight generation is already ended by `_onWsDropped` (it rejects
 * every pending prompt → the commandExecutor→generationService onError chain →
 * spinner ends), and the feed poll backoff (B4 part 1+3) already prevents the
 * dead-proxy request pile-up; this function is the missing user-facing half.
 */
function _initEngineDropRecovery() {
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('remote:engine-dropped', () => {
    // Only meaningful in remote mode; ignore a spurious emit when RunPod is off.
    if (!Storage.getRunpodConfig().enabled) return;
    // Sticky disconnected state + immediate repaint (don't wait for the next 5s
    // feed tick). The explicit phase sets `_remotePhase` so later phase-less feed
    // ticks fold it in instead of painting plain local.
    _emitRemoteConnection({ connected: false, gpuName: null, vramGb: null, ramGb: null, phase: 'disconnected' });
    Events.emit('ui:warning', {
      message: 'Remote engine disconnected — the Pod may have run out of memory and restarted. '
        + 'Reconnect from Settings → RunPod to continue.',
    });
  });
}

/**
 * Show the changelog overlay once per APP_VERSION.
 *
 * Skips when the user has already seen this version's changelog, or when there
 * are no release notes for the current version. Persists the seen-version only
 * when the user explicitly dismisses (Done) — not when the modal merely opens —
 * so an Escape/backdrop close still re-shows on next launch.
 */
function _maybeShowChangelog() {
  const notes = getReleaseNotes(APP_VERSION);
  if (!hasReleaseContent(notes)) return; // nothing to show for this version
  if (Storage.getLastSeenChangelogVersion() === APP_VERSION) return; // already seen

  _changelogDialog.on('dismiss', ({ version }) => {
    Storage.setLastSeenChangelogVersion(version || APP_VERSION);
  });

  _changelogDialog.el.open({ version: APP_VERSION, stage: APP_STAGE_LABEL, notes });
  _changelogDialog.el.show();
}

async function _initDataRegistries() {
  // Subscribe to models:checked event to update state
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('models:checked', ({ installedModelIds: ids }) => {
    state.s_installedModelIds = ids;
  });

  // Subscribe to engine:ready event — check models only after engine is set up
  // This ensures extra_model_paths.yaml exists before we try to read it
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('engine:ready', async () => {
    try {
      await syncModelInstalled();
    } catch (err) {
      clientLogger.error('shell', 'model registry sync failed:', err);
    }
  });

  // MPI-73: the boot model check (below) runs before the remote engine finishes
  // connecting, so it reads the not-yet-connected backend → stale counts (the
  // hero "N / N" showed local/empty until a navigation forced a re-check). Re-run
  // the model check when the remote engine reaches CONNECTED so the volume's real
  // installed set is read. Only on the connected edge; ignore transition phases.
  let _wasRemoteConnected = false;
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('remote:connection', async ({ connected, phase = null } = {}) => {
    if (phase) return; // mid-transition, not a resolved state
    if (connected && !_wasRemoteConnected) {
      _wasRemoteConnected = true;
      try {
        await syncModelInstalled();
      } catch (err) {
        clientLogger.error('shell', 'model registry sync on remote connect failed:', err);
      }
    } else if (!connected && _wasRemoteConnected) {
      // MPI-85: re-check on the DISCONNECT edge too. The remote model set was the
      // Pod volume's; going local must re-resolve installed-state against the local
      // filesystem (/comfy/models/check is engine-scoped) so the model menu drops to
      // local-only and MpiPromptBox.setModelList swaps any stale remote-only selection.
      _wasRemoteConnected = false;
      try {
        await syncModelInstalled();
      } catch (err) {
        clientLogger.error('shell', 'model registry sync on remote disconnect failed:', err);
      }
    }
  });

  // Also do an initial check in case engine was already ready before this listener was registered
  // (e.g., fresh start with no engine install needed)
  try {
    await syncModelInstalled();
  } catch (err) {
    clientLogger.error('shell', 'background registry failed:', err);
  }
}
