/**
 * shell.js — App Orchestrator.
 * Wires up sub-modules for window controls, projects, memory, and navigation.
 */

import { state } from './state.js';
import { APP_CONFIG } from '../dev_configs/app_config.js';
import { onNavigate, PAGE_LANDING } from './router.js';
import { syncModelInstalled, MODELS, installedForOtherArch, getDriftedModelIds } from './data/modelRegistry.js';
import { loadAll as loadAssets } from './services/assetService.js';
import { Events } from './events.js';
import { Storage, Session } from './core/storage.js';
import { clientLogger } from './services/clientLogger.js';
import { qs } from './utils/dom.js';
import { isStockRefusal } from './utils/runpodErrorClassify.js';

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
import { bindWindowControls, quitApp } from './shell/windowControls.js';
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

/**
 * One-time adult-content awareness overlay. Cubric's models are uncensored, so
 * this warns the app is 18+ and lets the user continue or quit. Shown once ever
 * (persisted in Storage); Continue records the acknowledgement, Quit closes the app.
 */
function _maybeShowMaturityWarning() {
  if (Storage.getMaturityAcknowledged()) return;

  const dlg = MpiOkCancel.mount(document.createElement('div'), {
    icon: 'warning',
    iconTone: 'warning',
    title: 'Adult content — 18+ only',
    text: 'Cubric Studio runs uncensored AI models. They have no built-in filters '
        + 'and can generate explicit sexual content and extreme violence. This app '
        + 'is intended for adults only — you must be 18 or older to use it, and it '
        + 'is not suitable for minors. By continuing you confirm you are over 18 '
        + 'and accept responsibility for the content you create.',
    okLabel: 'Continue',
    cancelLabel: 'Quit the app',
  });
  dlg.on('ok', () => Storage.setMaturityAcknowledged(true));
  dlg.on('cancel', () => quitApp());
  dlg.el.show();
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

  // Mirror the (dynamic) prompt-bar height into --promptbar-h so the queue
  // slide-over can dock above it instead of covering its controls.
  // App-lifetime observer; no teardown needed.
  {
    const promptMount = qs('#prompt-box-mount');
    if (promptMount) {
      const _sync = () => document.documentElement.style
        .setProperty('--promptbar-h', `${Math.round(promptMount.offsetHeight)}px`);
      new ResizeObserver(_sync).observe(promptMount);
      _sync();
    }
  }

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
  _initGpuWaitBridge();

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

  // 3.6. Adult-content / 18+ awareness — show once ever, after all boot
  // navigation has settled (navigation calls Overlays.reset(), which would wipe
  // an overlay shown earlier). Pushed LAST so it sits on TOP of the overlay
  // stack — the 18+ gate is the first thing the user sees / must dismiss.
  _maybeShowMaturityWarning();

  // Wire startup modal to comfy engine events (MPI-74 P6: engine-tagged + non-
  // blocking when the OTHER engine is mid-gen). comfyController emits these with
  // an `engine` tag; shell owns the component reference + the modal-owner gate.
  //
  // The blocking "Starting ComfyUI Engine…" overlay is the right UX for a cold
  // boot the user is waiting on, but it must NOT freeze a concurrent generation
  // on the other engine — a force-local gen's local cold-boot would otherwise pop
  // a global modal OVER a running cloud gen (the live-test freeze). Rule: show the
  // modal only when the OTHER engine is NOT currently running; record which engine
  // owns it so a later ready/error from the other engine doesn't dismiss it.
  const { localEngine, remoteEngine } = await import('./services/comfyController.js');
  const { remoteEngineClient } = await import('./services/remoteEngineClient.js');
  const _otherEngineRunning = (engine) =>
    engine === 'local' ? remoteEngine._isRunning === true : localEngine._isRunning === true;
  let _comfyModalEngine = null; // which engine the visible modal belongs to (or null)

  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('comfy:starting', ({ engine = 'remote' } = {}) => {
    // Suppress the blocking modal if the other engine is mid-gen — that engine's
    // UI (Cue card, previews) must stay live. The booting engine still comes up;
    // its own job tracks progress on its Cue card.
    if (_otherEngineRunning(engine)) return;
    if (_comfyModalEngine && _comfyModalEngine !== engine) return; // other engine owns the modal
    _comfyModalEngine = engine;
    _startingComfy.el.show();
  });
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('comfy:ready', ({ engine = 'remote' } = {}) => {
    if (_comfyModalEngine === engine) { _startingComfy.el.hide(); _comfyModalEngine = null; }
    // The asset list (models/workflows) reflects the app's PRIMARY engine — the
    // connection state. A force-local LOCAL ready while remote-connected is a side
    // gen; reloading assets there would swap the remote model list mid-cloud-gen.
    // Reload only when the readied engine matches the current app mode.
    const isRemoteMode = remoteEngineClient.isRemote();
    if ((engine === 'remote') === isRemoteMode) loadAssets();
  });
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('comfy:error', ({ engine = 'remote', message } = {}) => {
    // Only surface the error on the modal if THIS engine owns it; a background
    // side-engine error never hijacks a modal the other engine is showing.
    if (_comfyModalEngine === engine || _comfyModalEngine === null) _startingComfy.el.setError(message);
  });
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('ui:error',       ({ title, message }) => showError(title, message));

  // Model Library opens as a full-page overlay (MPI-215). MpiModelManager
  // self-hosts its own MpiOverlay(body); we mount it once (lazy singleton) and
  // call el.open() each time. The slide-over stays reserved for settings/hotkeys/
  // queue. eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  let _modelLibrary = null;
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('models:open', () => {
    if (!_modelLibrary) _modelLibrary = MpiModelManager.mount(document.createElement('div'));
    _modelLibrary.el.open();
  });

  // ComfyUI Auto-start (optional). Local boot only here — when auto-connecting to a
  // Pod at start the remote path owns engine bring-up, so skip the local auto-start.
  // (MPI-85: gate on autoConnectOnStart, not `enabled` — an enabled-but-not-auto
  // boot is a LOCAL boot and should honor the auto-start ComfyUI pref.)
  if (Storage.getAutoStartComfy() && !runpodCfg.autoConnectOnStart) {
    const { ComfyUIController } = await import('./services/comfyController.js');
    // background: bring the engine up SILENTLY at launch — no blocking "Starting
    // ComfyUI Engine…" overlay (auto-start is opt-in background prep; the overlay
    // is reserved for the engine spinning up in front of a manual generation).
    // Fire-and-forget: a connected download-mode (no-GPU) Pod makes _ensureRemoteReady
    // throw pod_no_gpu — EXPECTED background state, not a failure. Swallow it (and any
    // other background-prep error) so it doesn't surface as an uncaught promise
    // rejection on every launch/reload while remote-connected to a CPU Pod.
    ComfyUIController.ensureServerRunning({ background: true }).catch(() => {});
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

// MPI-96: RunPod can accept createPod (201) but never start the container on its
// host — the Pod sits EXITED while the wrapper /health stays silent, so this loop
// crawled to 99% on a Pod that isn't running. The status route now reports the
// Pod's runtime status; a terminal not-running status past a short grace = a dead
// host, not a slow boot, so bail. Returns true (ready), false (timeout), or the
// string 'not-running' (host failed to start the Pod). Mirrors the Settings path.
const _BOOT_NOT_RUNNING = new Set(['EXITED', 'TERMINATED', 'DEAD']);
async function _pollRemoteReady({ timeoutMs = 1200000, intervalMs = 4000, slowAfterMs = 150000, notRunningGraceMs = 30000, onSlow } = {}) {
  const start = Date.now();
  let slowFired = false;
  while (Date.now() - start < timeoutMs) {
    // MPI-87: surface an elapsed-based connect % (RunPod's API exposes no real
    // image-pull progress — see docs/runpod-remote-engine.md). An estimate, not a
    // layer count: climb 0→99 over the typical first-pull window, hold 99 until
    // /health flips ready (heroStats paints it in the GPU slot while connecting).
    Events.emit('remote:connect-progress', { pct: _connectPct(Date.now() - start) });
    let s = null;
    try {
      const res = await fetch('/remote/comfy/status');
      s = res.ok ? await res.json() : null;
      if (s && s.ready) { Events.emit('remote:connect-progress', { pct: 100 }); return true; }
      // MPI-96: Pod reports a terminal not-running status after the grace window (a
      // normal CREATED→RUNNING transition is never flagged) — the host failed.
      if (s && s.podStatus && _BOOT_NOT_RUNNING.has(String(s.podStatus).toUpperCase())
          && Date.now() - start >= notRunningGraceMs) {
        Events.emit('remote:connect-progress', { pct: 0 });
        return 'not-running';
      }
      // MPI-135 (C): RunPod placed the Pod on a host that's under / scheduled for
      // maintenance (draining) — it'll never come ready. Bail past the grace window
      // so the user gets nudged to Cancel & retry now instead of waiting the watchdog.
      if (s && s.maintenance && Date.now() - start >= notRunningGraceMs) {
        Events.emit('remote:connect-progress', { pct: 0 });
        return 'maintenance';
      }
      // The user cancelled from Settings (or remote mode was otherwise turned off)
      // mid-boot-connect: _cancelConnect → /remote/pod/delete-active flips _mode
      // OFF, so the status route early-returns { running:false, ready:false,
      // connecting:false } with NO podStatus. A healthy boot is never in this shape
      // (the create window reports connecting:true, then a live podStatus once the
      // Pod exists), so this uniquely means "deleted out from under us" — bail
      // quietly so the boot loop doesn't zombie to the 20-min timeout and then throw
      // a false "Could not create a Pod". Past the same grace window to skip the
      // brief startup gap before _connecting flips on.
      if (s && !s.running && !s.ready && !s.connecting && !s.podStatus
          && Date.now() - start >= notRunningGraceMs) {
        Events.emit('remote:connect-progress', { pct: 0 });
        return 'aborted';
      }
    } catch (_) { /* transient during cold pull / proxy 404 window */ }
    // MPI-110: fire the slow-wait notice on elapsed time, but ONLY while the connect
    // is genuinely still in flight. A Settings Cancel flips backend mode off; without
    // this gate the elapsed timer could fire "Setting up the engine…" a minute after
    // the user cancelled (the abort shape is only confirmed past notRunningGraceMs).
    // `s == null` is a transient fetch miss mid-pull — don't suppress on that.
    const stillConnecting = !s || s.connecting || s.running || !!s.podStatus;
    if (!slowFired && onSlow && stillConnecting && Date.now() - start >= slowAfterMs) {
      slowFired = true;
      try { onSlow(); } catch (_) { /* notify best-effort */ }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// MPI-110: boot-time auto-retry. When autoConnectOnStart AND autoRetry are both on
// and the saved GPU is out of stock at launch, wait in the BACKGROUND for it to
// free before kicking off the create — WITHOUT emitting phase:'connecting' (which
// would block local generation). The user can generate locally while it waits.
const _BOOT_RETRY_INTERVAL_MS = 15000;

// Is `gpuType` available right now in the live RunPod snapshot? Mirrors the
// Settings picker's availMap logic. `datacenter` may be '__any__' (any DC) or a
// real DC id. CPU download Pods are effectively always available.
async function _isGpuInStockBoot(gpuType, datacenter) {
  if (!gpuType) return false;
  if (gpuType === '__cpu__') return true;
  const url = (datacenter && datacenter !== '__any__')
    ? `/runpod/gpu-availability?dataCenterId=${encodeURIComponent(datacenter)}`
    : '/runpod/gpu-availability';
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const data = await res.json();
    const dcs = data?.dataCenters || [];
    if (!datacenter || datacenter === '__any__') {
      return dcs.some(d => (d.gpuAvailability || []).some(g => g.gpuTypeId === gpuType && g.available));
    }
    const dc = dcs.find(d => d.id === datacenter);
    return !!dc && (dc.gpuAvailability || []).some(g => g.gpuTypeId === gpuType && g.available);
  } catch (_) {
    return false; // transient — caller retries next tick
  }
}

// MPI-135 (A): for an any-region create that RunPod auto-placement keeps refusing
// (it lands on full hosts), pick the DC with the best live stock for the card and
// pin the next retry there instead of re-gambling on dc=null. Returns a DC id or
// null (no DC reports the card available → stay any-region, keep retrying). An
// ephemeral no-volume Pod CAN be pinned to a DC (remoteProxy create only requires a
// DC when a volume is attached), so this needs no volume. The `available` flag is
// optimistic (a 'Low' DC can still refuse), so this only RANKS retry targets — the
// create attempt stays the ground truth, exactly as MPI-134 relies on.
const _DC_STOCK_RANK = { High: 3, Medium: 2, Low: 1 };
async function _bestStockDcForGpu(gpuType) {
  if (!gpuType || gpuType === '__cpu__') return null;
  try {
    const res = await fetch('/runpod/gpu-availability');
    if (!res.ok) return null;
    const dcs = (await res.json())?.dataCenters || [];
    let best = null;
    let bestRank = 0;
    for (const d of dcs) {
      const g = (d.gpuAvailability || []).find(x => x.gpuTypeId === gpuType && x.available);
      if (!g) continue;
      const rank = _DC_STOCK_RANK[g.stockStatus] || 0;
      if (rank > bestRank) { bestRank = rank; best = d.id; }
    }
    return best;
  } catch (_) {
    return null; // transient — caller stays any-region this tick
  }
}

// ── App-wide auto-retry wait (MPI-110) ─────────────────────────────────────
// The wait loop lives HERE (shell), not in the Settings panel, so it survives the
// user navigating away from Settings. `state.remoteWaitGpu` mirrors the GPU being
// waited for, so a (re)mounted Settings panel can reflect a wait it didn't start.
// The whole wait stays on local · offline (no 'connecting' phase) so local
// generation is never blocked; the connecting phase begins only once a real create
// kicks off (surfaced app-wide by the connection feed's `connecting` flag).
let _gpuWaitActive = false;
let _gpuWaitAbort = false;
// MPI-138: which GPU the live wait is retrying. Lets a SECOND retry driver for the
// SAME GPU recognise the wait is already covered and no-op, instead of stop+restart.
// Two independent drivers exist — a manual Settings Connect AND the boot
// auto-connect-on-start loop (_initRemoteBoot) — and before retry actually worked
// (MPI-134) they never collided because neither looped past the first refusal. Now
// both loop, so without this key they ping-ponged: each stopped the other's wait
// (clearing remoteWaitGpu → panel flips waiting→Connect = "cancels by itself") then
// re-armed. One owner per GPU now.
let _gpuWaitFor = null;

function _stopGpuWait() {
  if (!_gpuWaitActive) return;
  _gpuWaitAbort = true;
  _gpuWaitFor = null;
  if (state.remoteWaitGpu !== null) state.remoteWaitGpu = null;
}

// MPI-134: paint the steady "waiting…" state (panel: Cancel + hint via the
// remoteWaitGpu onState handler; phase stays null so local generation is not blocked).
// Idempotent — re-entered on every refused retry without re-toasting.
function _enterWaitState(gpuType) {
  if (state.remoteWaitGpu !== gpuType) {
    state.remoteWaitGpu = gpuType;
    StatusBar.notify(`Waiting for ${gpuType} — we'll connect the moment it frees. Keep generating locally; cancel in Settings → RunPod.`, 'info', 8000);
  }
}

// MPI-134: the auto-retry wait is no longer a separate availability-poll loop. The
// `available` flag is unreliable (low/medium-stock cards still refuse the create), so
// the create attempt itself is the probe — the retry loop lives inside _initRemoteBoot,
// which paints the steady "waiting…" state between refusals. _startGpuWait is gone.

// Bridge: the Settings panel asks the shell to start/stop the connect (the loop must
// outlive the panel). On free, run the FULL connect flow (_initRemoteBoot) — the GPU
// is in stock now so it skips its own wait and runs create → _pollRemoteReady (drives
// the % + connected edge + WS handshake), exactly like a boot auto-connect. Reusing
// it avoids a thin create-only path that left the hero stuck at "connecting 0%".
function _initGpuWaitBridge() {
  // MPI-134: the Settings panel asks the shell to start/stop the auto-retry connect
  // (the loop must outlive the panel). _initRemoteBoot IS that loop — it owns the
  // create-retry, the wait-state paint, and the single-flight guard (one owner per
  // GPU; a duplicate for the same card no-ops, a different card aborts+takes over).
  // So the bridge is now a thin pass-through, NOT a second wait driver.
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('remote:wait-start', ({ gpuType, datacenter } = {}) => {
    if (!gpuType) return;
    // Fire-and-forget: _initRemoteBoot self-guards against a duplicate same-GPU call.
    // Pass the current config (the saved GPU is the source of truth), overriding the
    // datacenter from the event so a fresh pick is honoured immediately.
    const cfg = Storage.getRunpodConfig();
    _initRemoteBoot({ ...cfg, gpuType, datacenter: datacenter ?? cfg.datacenter });
  });
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('remote:wait-cancel', () => _stopGpuWait());
}

async function _initRemoteBoot(runpod) {
  // MPI-134: _initRemoteBoot is now the SINGLE owner of the connect+auto-retry loop
  // (boot auto-connect AND the Settings handoff both call it). Two drivers chasing the
  // same GPU used to race — each clearing the other's remoteWaitGpu → the panel
  // "cancelled by itself". Single-flight guard: a second call for the SAME GPU while
  // one is already running just no-ops (the running one already covers it). A DIFFERENT
  // GPU (real switch) aborts the running loop first, then takes over.
  if (_gpuWaitActive) {
    if (_gpuWaitFor === (runpod.gpuType || null)) {
      clientLogger.info('shell', `[RunPod] connect already in progress for ${runpod.gpuType} — ignoring duplicate`);
      return;
    }
    _stopGpuWait();
    // Let the running loop observe the abort and exit before we re-arm (its abort
    // checks are at most one tick apart; poll briefly so the guard below doesn't drop us).
    for (let i = 0; i < 50 && _gpuWaitActive; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  _gpuWaitActive = true;
  _gpuWaitAbort = false;
  _gpuWaitFor = runpod.gpuType || null;
  try {
    return await _runRemoteBoot(runpod);
  } finally {
    _gpuWaitActive = false;
    _gpuWaitFor = null;
    if (state.remoteWaitGpu !== null) state.remoteWaitGpu = null;
  }
}

async function _runRemoteBoot(runpod) {
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
  // MPI-110: a FRESH create (not a warm resume) with auto-retry on, when the saved
  // GPU is out of stock at launch — wait in the background for it to free FIRST.
  // This stays on local · offline (no 'connecting' phase) so local generation is
  // not blocked. A warm Pod resumes regardless (its GPU is already provisioned).
  // Boot intent check: bail the wait ONLY if the user changed the saved GPU or turned
  // the flags off (re-read fresh each tick). Do NOT bail on `wasConnected && podId` —
  // those are STALE prior-session storage flags (a successful connect last session
  // leaves wasConnected:true + a podId), and tripping on them made the boot wait give
  // up immediately instead of waiting for the GPU. A real live connection is detected
  // by the create path / connection feed, not by stale saved flags. (MPI-110)
  // Intent check, re-read each tick: bail the auto-retry only if the user turned the
  // flags off or switched the saved GPU (NOT on stale wasConnected/podId — those are
  // last-session storage flags, MPI-110). Settings-driven retries pass autoConnectOnStart
  // off, so gate on autoRetry + matching GPU; the boot launch also has autoConnectOnStart.
  const _retryContinues = () => {
    if (_gpuWaitAbort) return false;
    const c = Storage.getRunpodConfig();
    return c.autoRetry === true && c.gpuType === runpod.gpuType;
  };
  // MPI-134: the auto-retry WAIT is just the create-loop below in its "still refusing"
  // state. The RunPod `available` flag is unreliable — a card reading low/medium (or even
  // available) can still refuse the create ("does not have the resources"). So the only
  // honest probe is the create attempt itself; we present a steady "waiting…" (Cancel +
  // hint, phase:null so local generation is never blocked) and the create-loop retries
  // every 15s until it wins or the user cancels. No separate availability poll, no second
  // wait driver. A warm resume skips all this (its GPU is already provisioned).
  const autoRetry = !warm && runpod.autoRetry === true;
  if (autoRetry && !(await _isGpuInStockBoot(runpod.gpuType, runpod.datacenter))) {
    clientLogger.info('shell', `[RunPod] ${runpod.gpuType} out of stock — entering background auto-retry`);
    _enterWaitState(runpod.gpuType);
    if (!_retryContinues()) return;
  }
  // MPI-134 Defect 5: announce the connecting phase only ONCE a Pod actually
  // exists, not before the create attempt. A scarce card's create can refuse and
  // re-wait; announcing 'connecting'/'Creating a Pod…' up front made the panel
  // flicker waiting→Creating→stopped→waiting every retry tick. A warm resume always
  // has a Pod (its podId), so announce it immediately; a fresh create defers the
  // announce until the create loop below returns a real podId (see _announceConnecting).
  let _announced = false;
  const _announceConnecting = () => {
    if (_announced) return;
    _announced = true;
    // The Pod is real now → leave the wait state and surface the connecting phase.
    if (state.remoteWaitGpu !== null) state.remoteWaitGpu = null;
    StatusBar.notify(warm ? 'Reconnecting to your Pod…' : 'Creating a Pod…', 'info', 6000);
    _emitRemoteConnection({ connected: false, gpuName: null, vramGb: null, ramGb: null, phase: 'connecting' });
  };
  if (warm) _announceConnecting();
  let _bootConnected = false; // MPI-73: resolves the 'connecting' phase
  try {
    const endpoint = warm ? '/remote/pod/reconnect' : '/remote/pod/create';
    // MPI-78: "__any__" is the UI sentinel for the no-volume "Any region" ephemeral
    // mode — translate it to a null datacenter (backend auto-places) and carry the
    // saved container-disk size. A real DC sends its id; containerDiskGb is ignored.
    const anyRegion = runpod.datacenter === '__any__';
    const datacenter = anyRegion ? null : (runpod.datacenter || null);
    const volumeId = anyRegion ? null : (runpod.volumeId || null);
    const containerDiskGb = anyRegion ? (runpod.containerDiskGb || 100) : undefined;
    const body = warm
      ? { podId: runpod.podId, gpuTypeId: runpod.gpuType, volumeId, datacenter, containerDiskGb }
      : { gpuTypeId: runpod.gpuType, volumeId, datacenter, containerDiskGb };
    clientLogger.info('shell', `[RunPod] auto-connect-on-start: ${warm ? 'reconnect' : 'create'} gpu=${runpod.gpuType} dc=${datacenter || 'any'} vol=${volumeId || 'none'} podId=${runpod.podId || 'none'}`);
    // MPI-110: with auto-retry on, a fresh create can still be sniped between the
    // availability poll and the create. Retry the create, re-waiting for the GPU
    // each time, until it wins or the user changes intent. A warm reconnect never
    // loops here (it resumes a provisioned Pod). The non-retry path runs once.
    let data;
    let resOk = false; // hoisted: the post-loop ready check reads it (the create
                       // response status of the attempt we actually broke out on)
    while (true) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      resOk = res.ok;
      data = await res.json().catch(() => ({}));
      // MPI-135: a card RunPod's REST create enum doesn't recognise can NEVER deploy —
      // never retry it (auto-retry would loop forever on a doomed card). Break out and
      // fall through to the error handling so the user is told to pick another.
      if (data.gpuUnsupported) break;
      const refusedOutOfStock = !res.ok && isStockRefusal(data.message || data.error || '');
      const sniped = data.unavailable || refusedOutOfStock;
      if (sniped && autoRetry) {
        // MPI-134: the create refused and no Pod exists. This IS the wait — the
        // `available` flag lies for low/medium-stock cards, so the create attempt is
        // the only honest probe. Hold the steady "waiting…" state (silent: no phase
        // emit, no toast spam — _enterWaitState is idempotent), back off 15s, and
        // retry. remoteWaitGpu stays pinned, so the panel never flickers to
        // Creating/stopped. A user Cancel (_stopGpuWait) or GPU switch flips
        // _retryContinues() false and we bail to local.
        // MPI-135 (A): when this is an any-region create (no DC, no volume), the
        // refusal means RunPod auto-placement keeps landing on full hosts. Steer the
        // next retry to the best-stock DC for the card if the snapshot names one;
        // a null result leaves body.datacenter unset → stays any-region.
        if (!warm && anyRegion && !body.volumeId) {
          const steerDc = await _bestStockDcForGpu(runpod.gpuType);
          if (steerDc && steerDc !== body.datacenter) {
            body.datacenter = steerDc;
            clientLogger.info('shell', `[RunPod] steering any-region retry to best-stock DC ${steerDc} for ${runpod.gpuType}`);
          }
        }
        clientLogger.info('shell', `[RunPod] ${runpod.gpuType} refused (low stock) — retrying in ${_BOOT_RETRY_INTERVAL_MS / 1000}s`);
        _enterWaitState(runpod.gpuType);
        for (let w = 0; w < _BOOT_RETRY_INTERVAL_MS; w += 500) {
          await new Promise((r) => setTimeout(r, 500));
          if (!_retryContinues()) return; // cancelled / intent changed — leave local
        }
        if (!_retryContinues()) return;
        continue;
      }
      // Got a real response. Announce 'connecting' only when a Pod actually exists or
      // is starting (a hard refusal with no Pod — auto-retry off — falls through to the
      // error/unavailable handling below WITHOUT a misleading connecting flash).
      if (data.podId || data.starting || data.ready) _announceConnecting();
      break;
    }

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

    // MPI-120: host offline at boot — backend pre-flight blocked the auto-connect.
    // Stay local, tell the user once via the status bar (no modal on startup).
    if (data.offline) {
      clientLogger.info('shell', '[RunPod] auto-connect-on-start: offline — staying local');
      _emitRemoteConnection({ connected: false, gpuName: null, vramGb: null, ramGb: null, phase: null });
      StatusBar.notify("You're offline — staying local. Reconnect to your Pod from Settings when back online.", 'warning', 6000);
      return;
    }
    if (data.podId) {
      const cfg = Storage.getRunpodConfig();
      Storage.setRunpodConfig({ ...cfg, podId: data.podId });
    }
    if (!resOk || (!data.ready && !data.starting)) {
      throw new Error(data.message || 'reconnect did not start');
    }
    // The backend now returns `starting` immediately (no 504 on a long first-image
    // pull); poll /remote/comfy/status until ready. A fresh image tag can take a
    // few minutes the first time it is pulled onto a host.
    // MPI-94 L3 — the slow-wait copy must match what's actually happening: a fresh
    // CREATE pays the one-time image pull + sage compile ("First-time setup…"); a
    // warm RECONNECT just wakes an already-provisioned Pod (engine on its volume,
    // no download), so the create copy was misleading there. Mirrors the manual
    // Connect path's resume-vs-create copy (MpiSettings).
    const ready = await _pollRemoteReady({
      onSlow: () => StatusBar.notify(
        warm
          ? 'Resuming your Pod — waking it up, this is usually quick…'
          : 'First-time setup: downloading the engine and optimising it for your GPU (one time, a few minutes — much faster next time)…',
        'info', 8000),
    });
    // MPI-96: RunPod accepted the Pod but its host never started it (EXITED). Delete
    // the dead Pod (an EXITED Pod still bills container disk), clear the saved podId
    // so the next boot creates fresh, and tell the user it's a bad host — not a
    // generic "could not reach" failure.
    if (ready === 'not-running') {
      clientLogger.warn('shell', '[RunPod] auto-connect: Pod not running on host (EXITED) — aborting');
      fetch('/remote/pod/delete-active', { method: 'POST' }).catch(() => {});
      const cfg = Storage.getRunpodConfig();
      Storage.setRunpodConfig({ ...cfg, podId: null, wasConnected: false });
      const dlg = MpiOkCancel.mount(document.createElement('div'), {
        title: 'Pod failed to start on host',
        text: 'The Pod was created but its RunPod host never started it (a bad or busy host — not a problem with your setup). Open Settings → RunPod, pick another GPU, and Connect.',
        okLabel: 'Got it',
        showCancel: false,
      });
      dlg.el.show();
      return;
    }
    // MPI-135 (C): the host RunPod placed the Pod on is under maintenance (draining) —
    // it won't come ready. Same teardown as a dead host: delete it (a stuck Pod still
    // bills), clear the saved podId so the next Connect creates fresh elsewhere, and
    // tell the user it's a bad host. With auto-retry on they can just Connect again to
    // land a fresh one.
    if (ready === 'maintenance') {
      clientLogger.warn('shell', '[RunPod] auto-connect: host under maintenance — aborting');
      fetch('/remote/pod/delete-active', { method: 'POST' }).catch(() => {});
      const cfg = Storage.getRunpodConfig();
      Storage.setRunpodConfig({ ...cfg, podId: null, wasConnected: false });
      const dlg = MpiOkCancel.mount(document.createElement('div'), {
        title: 'Host going down for maintenance',
        text: 'RunPod placed your Pod on a host that is being taken down for maintenance, so it will not come ready. We deleted it — open Settings → RunPod and Connect again to land on a fresh host.',
        okLabel: 'Got it',
        showCancel: false,
      });
      dlg.el.show();
      return;
    }
    // The user pressed Cancel in Settings mid-boot-connect — _cancelConnect already
    // deleted the Pod, cleared the saved ids, and emitted local · offline + a
    // "Connection cancelled" toast. Bail silently: no error dialog (this was
    // deliberate), and `_bootConnected` stays false so the finally just confirms the
    // already-resolved local · offline state.
    if (ready === 'aborted') {
      clientLogger.info('shell', '[RunPod] auto-connect: cancelled by user mid-boot — stopping the boot poll');
      return;
    }
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
    let connecting = false; // MPI-110: backend reports a create/resume in flight
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
      // MPI-110: the backend tracks an in-flight connect (_connecting/_starting) and
      // exposes it as `connecting`. Surface it app-wide so the hero/status bar show
      // "connecting" even when Settings is closed — the connect/wait used to live only
      // in the Settings panel, so navigating away mid-connect dropped the signal and
      // the UI fell back to local · offline while the Pod was still booting.
      connecting = !!(s && s.connecting);
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
      // Wrapper is up (`ready`) but ComfyUI isn't serving yet (`comfyReady:false`) —
      // the window where a per-model custom_node is installing on the volume and
      // ComfyUI is reloading. The backend's `_starting`/`connecting` flag already
      // cleared on wrapper-ready, so without this the tick sees connected:false +
      // connecting:false and paints plain local · offline for the whole ~1min
      // comfy-reload — no "connecting" stage, then a sudden snap to remote. Treat
      // it as still connecting so the hero shows the transition. (noGpu Pods have no
      // ComfyUI, so this never applies to them.)
      if (!connected && !connecting && s && s.ready && !s.noGpu && s.comfyReady === false) {
        connecting = true;
      }
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
      // MPI-134: during an auto-retry WAIT (remoteWaitGpu set) no Pod exists — each
      // 15s retry calls /remote/pod/create, and the backend reports connecting:true
      // for the ~1.5s that REST call is in flight. A feed poll landing in that window
      // used to flash the hero to "CONNECTING 0%" then back to local. While waiting,
      // that transient is NOT a real connect — stay local · offline (phase:null), and
      // clear any stale 'connecting' the fold-in might hold. The real connect announces
      // its own phase via _announceConnecting once a Pod actually exists.
      if (state.remoteWaitGpu) {
        // Force phase:null + local · offline (explicit phase always emits, clearing any
        // stale 'connecting' the fold-in held). Only emit on a real change to avoid spam.
        if (_remotePhase === 'connecting' || _last !== false) {
          _last = false;
          _emitRemoteConnection({ connected: false, gpuName: null, vramGb: null, ramGb: null, phase: null });
        }
        return;
      }
      // MPI-110: a create/resume is in flight backend-side → keep the hero/status
      // bar on "connecting" (not local · offline) regardless of whether Settings is
      // open. _emitRemoteConnection with an explicit phase always emits and sets the
      // shared _remotePhase, so a late-mounted PromptBox also picks it up.
      if (connecting) {
        _emitRemoteConnection({ connected: false, gpuName: null, vramGb: null, ramGb: null, phase: 'connecting' });
        _last = false;
        return;
      }
      // MPI-110: connect ended without connecting (aborted/failed) — clear a stale
      // 'connecting' phase so the fold-in below doesn't leave the hero stuck on it.
      if (_remotePhase === 'connecting') {
        _emitRemoteConnection({ connected: false, gpuName: null, vramGb: null, ramGb: null, phase: null });
        _last = false;
        return;
      }
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

// MPI-207: fire a ONE-SHOT "GPU Changed" info toast when the current engine's GPU
// arch has changed since last seen AND at least one arch-variant model is now
// installed-for-the-other-arch (its weight for THIS GPU is missing). Covers both a
// remote Pod swap (4090 → 5090) and a LOCAL GPU upgrade — the caller runs it after
// every syncModelInstalled (connect / disconnect / boot), which is when the arch and
// dep-status cache are both fresh. De-duped per engine via localStorage so the toast
// fires once per real arch change, not on every re-sync. Must run AFTER the sync so
// the dep-status cache installedForOtherArch reads is populated.
async function _maybeNotifyArchChange() {
  const { remoteEngineClient } = await import('./services/remoteEngineClient.js');
  const engine = remoteEngineClient.isRemote() ? 'remote' : 'local';
  const arch = await remoteEngineClient.arch(engine);
  if (!arch) return; // unknown arch → nothing to compare
  const key = `mpi.lastSeenArch.${engine}`;
  const prev = localStorage.getItem(key);
  localStorage.setItem(key, arch); // always record the current arch
  if (!prev || prev === arch) return; // first run or no change → no toast
  const affected = MODELS.some(m => installedForOtherArch(m));
  if (!affected) return; // arch changed but no model needs a different weight
  Events.emit('ui:info', {
    message: 'GPU Changed — you may need to reinstall some models for this GPU.',
  });
}

// MPI-230: on the first remote connect, a custom node on the Pod volume may sit at
// an out-of-date commit (a node_lock bump since it was installed). The LOCAL engine
// already auto-heals node drift silently via the boot-repair modal; this brings the
// REMOTE engine to parity — no manual Install click, no confirm, no toast (a node
// re-clone is KB-scale, not the multi-GB weight fetch). Reuses the manual install
// path (downloadService.start → server re-checks drift per dep → force re-clone of
// the drifted node; already-complete weights dedupe out). First-connect-gated by the
// caller so a transient reconnect never re-fires it.
async function _healRemoteNodeDrift() {
  const ids = getDriftedModelIds();
  if (!ids.length) return;
  const models = ids.map(id => MODELS.find(m => m.id === id)).filter(Boolean);
  if (!models.length) return;

  const { downloadService } = await import('./services/downloadService.js');
  const { resolveFullUniverse } = await import('./data/modelConstants/resolveModelDeps.js');
  const { DEPS } = await import('./data/modelConstants/dependencies.js');
  const { remoteEngineClient } = await import('./services/remoteEngineClient.js');
  const engine = remoteEngineClient.effectiveEngine();
  for (const model of models) {
    // Same resolution the manual Install path uses (engine-scoped full universe);
    // the server re-checks drift per dep and re-clones only the stale node with force.
    const deps = resolveFullUniverse(model, null, engine)
      .map(id => DEPS[id]).filter(Boolean);
    if (deps.length) await downloadService.start(model.id, deps);
  }
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
      await _maybeNotifyArchChange(); // MPI-207: local GPU upgrade shows on boot
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
  // MPI-230: offer to auto-heal remote node-drift ONCE per session, on the genuine
  // first resolved connect — never on later reconnect flaps (a multi-GB re-fetch is
  // too heavy to fire on transient edges). Latches true after the check runs.
  let _didFirstConnectDriftCheck = false;
  // eslint-disable-next-line mpi/require-destroy-on-events -- app-lifetime listener
  Events.on('remote:connection', async ({ connected, phase = null } = {}) => {
    if (phase) return; // mid-transition, not a resolved state
    if (connected) {
      // MPI-200: re-sync on EVERY resolved connect, not just the first. A new
      // Pod is a new machine with a potentially different GPU arch (4090 modern
      // → 5090 blackwell), and arch-variant models (LTX balanced: mxfp8 vs
      // fp8_scaled) require the arch-specific weight. Re-checking only on the
      // first connect left the previous Pod's arch cache in place after a
      // same-session Pod swap, so the panel showed a tier "installed" whose
      // weight isn't on the new volume. A resolved connected:true IS a real
      // (re)connection edge, so re-checking each time is correct, not redundant.
      _wasRemoteConnected = true;
      try {
        await syncModelInstalled();
        await _maybeNotifyArchChange(); // MPI-207: Pod swap to a new arch
        // MPI-230: syncModelInstalled just tagged any volume node at the wrong commit
        // as drifted. On the genuine first connect only, silently auto-heal it (local
        // parity — no prompt, no toast).
        if (!_didFirstConnectDriftCheck) {
          _didFirstConnectDriftCheck = true;
          await _healRemoteNodeDrift();
        }
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
        await _maybeNotifyArchChange(); // MPI-207: back to local arch may differ from Pod
      } catch (err) {
        clientLogger.error('shell', 'model registry sync on remote disconnect failed:', err);
      }
    }
  });

  // R31 (MPI-208): the "Run locally" toggle flips state.engineOverride while the
  // app stays remote-connected. Install-state is engine-scoped, so re-sync against
  // the new EFFECTIVE engine — syncModelInstalled() now routes to /check-local when
  // override forces local (modelRegistry.js), then emits models:checked → the model
  // pickers rebuild their list (MpiGalleryBlock's s_installedModelIds watcher).
  Events.onState('engineOverride', async () => {
    try {
      await syncModelInstalled();
    } catch (err) {
      clientLogger.error('shell', 'model registry sync on engineOverride change failed:', err);
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
