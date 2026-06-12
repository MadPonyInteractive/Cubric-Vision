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
  // Remote mode (MPI-64): RunPod-enabled boots take a parallel gate path that
  // skips the local engine version/install gate entirely — a local engine is
  // not required to run remotely. (`else try` keeps the local path untouched.)
  const runpodCfg = Storage.getRunpodConfig();
  if (runpodCfg.enabled) {
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

  // ComfyUI Auto-start (optional). Local mode only here — the remote Pod start is
  // gated behind the "RunPod Active" advisory dismiss (see _initRemoteBoot) so the
  // user acknowledges the credit cost before any GPU billing begins.
  if (Storage.getAutoStartComfy() && !runpodCfg.enabled) {
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
 * a fresh-image cold pull (~3 GB) vs a normal ~90-120s cold create.
 * @returns {Promise<boolean>} true once ready, false on timeout.
 */
async function _pollRemoteReady({ timeoutMs = 600000, intervalMs = 4000, slowAfterMs = 150000, onSlow } = {}) {
  const start = Date.now();
  let slowFired = false;
  while (Date.now() - start < timeoutMs) {
    if (!slowFired && onSlow && Date.now() - start >= slowAfterMs) {
      slowFired = true;
      try { onSlow(); } catch (_) { /* notify best-effort */ }
    }
    try {
      const res = await fetch('/remote/comfy/status');
      const s = res.ok ? await res.json() : null;
      if (s && s.ready) return true;
    } catch (_) { /* transient during cold pull / proxy 404 window */ }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function _initRemoteBoot(runpod) {
  // Flag remote mode active. A saved podId is passed so status polls + teardown
  // target it; the boot gate only needs `active` to skip the local install path.
  try {
    await fetch('/remote/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(runpod.podId ? { active: true, podId: runpod.podId } : { active: true }),
    });
  } catch (err) {
    clientLogger.error('shell', 'remote mode sync failed:', err);
  }

  const canAutoReconnect = !!(runpod.wasConnected && runpod.podId && runpod.gpuType);
  if (!canAutoReconnect) {
    // No prior connection to resume — nothing to do at boot. The persistent
    // remote-engine status feedback (Settings + status bars) tells the user it
    // is enabled; Connect in Settings starts the Pod and acknowledges the cost.
    return;
  }

  // Auto-reconnect in the background (UI stays usable during the resume/recreate).
  StatusBar.notify('Reconnecting to your Pod…', 'info', 6000);
  try {
    const res = await fetch('/remote/pod/reconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        podId: runpod.podId,
        gpuTypeId: runpod.gpuType,
        volumeId: runpod.volumeId || null,
        datacenter: runpod.datacenter || null,
      }),
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
        'First-time setup: downloading the engine (~3 GB, one time — faster next time)…',
        'info', 8000),
    });
    if (ready) {
      StatusBar.notify('Remote engine ready', 'success', 6000);
    } else {
      throw new Error('the Pod did not reach ready in time — open Settings → RunPod to retry');
    }
  } catch (err) {
    clientLogger.error('shell', 'remote auto-reconnect failed:', err);
    const retry = MpiOkCancel.mount(document.createElement('div'), {
      title: 'Could not reconnect to your Pod',
      text: (err && err.message) || 'The remote engine could not be reached. Open Settings → RunPod to reconnect manually.',
      okLabel: 'Open later',
      showCancel: false,
    });
    retry.el.show();
  }
}

/**
 * Persistent remote-connection feed (MPI-64 Step 4.4). Polls the backend
 * remote-engine status app-wide (not just while Settings is open) and broadcasts
 * `remote:connection` { connected, gpuName } ONLY when the connected state flips.
 * The landing hero footer + the gallery status bar subscribe so the user always
 * knows whether they are running locally or on a (billing) Pod. Cheap: one poll
 * every 5s, no-op'd entirely when RunPod is disabled.
 */
function _initRemoteConnectionFeed() {
  let _last = null; // last broadcast connected bool (null = nothing sent yet)

  const tick = async () => {
    const cfg = Storage.getRunpodConfig();
    if (!cfg.enabled) {
      if (_last !== false) {
        _last = false;
        Events.emit('remote:connection', { connected: false, gpuName: null });
      }
      return;
    }
    let connected = false;
    try {
      const res = await fetch('/remote/comfy/status');
      const s = res.ok ? await res.json() : null;
      connected = !!(s && s.ready);
    } catch (_) {
      connected = false;
    }
    if (connected !== _last) {
      _last = connected;
      if (!connected) {
        Events.emit('remote:connection', { connected: false, gpuName: null, vramGb: null, ramGb: null });
        return;
      }
      // Resolve GPU/VRAM/RAM for the badge (best-effort; falls back to the id).
      let specs = { gpuName: cfg.gpuType || null, vramGb: null, ramGb: null };
      try {
        const qp = cfg.gpuType ? `?gpuTypeId=${encodeURIComponent(cfg.gpuType)}` : '';
        const r = await fetch(`/remote/pod/specs${qp}`);
        if (r.ok) specs = await r.json();
      } catch (_) { /* keep the fallback */ }
      Events.emit('remote:connection', { connected: true, ...specs });
    }
  };

  tick();
  setInterval(tick, 5000);
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

  // Also do an initial check in case engine was already ready before this listener was registered
  // (e.g., fresh start with no engine install needed)
  try {
    await syncModelInstalled();
  } catch (err) {
    clientLogger.error('shell', 'background registry failed:', err);
  }
}
