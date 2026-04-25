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
import { MpiModelsModal } from './components/Blocks/MpiModelsModal/MpiModelsModal.js';
import { getModelsByType } from './data/modelRegistry.js';

// Shell Sub-modules
import { preloadComponentStyles } from './shell/preloadStyles.js';
import { bindWindowControls } from './shell/windowControls.js';
import { initProjectUI, loadProjectGrid } from './shell/projectUI.js';
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
const _modelsModal = MpiModelsModal.mount(document.createElement('div'), {
    icon: 'download',
    title: 'Model Manager',
    text: 'Select a model pack to install. Required files will be fetched automatically.',
    footer: 'Models are stored locally and never shared.',
    closable: true,
});

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

  // 2. Check engine version before anything else
  try {
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

  // Wire startup modal to comfy engine events.
  // comfyController emits these events; shell owns the component reference.
  Events.on('comfy:starting', () => _startingComfy.el.show());
  Events.on('comfy:ready',    () => { _startingComfy.el.hide(); loadAssets(); });
  Events.on('comfy:error',    ({ message }) => _startingComfy.el.setError(message));
  Events.on('ui:error',       ({ title, message }) => showError(title, message));

  // Show model manager when zero image models are installed
  Events.on('models:open', () => {
    _modelsModal.el.show();
  });
  Events.on('models:all-installed', () => _modelsModal.el.hide());
  Events.on('models:closed', () => {
      _modelsModal.el.hide();
  });

  // ComfyUI Auto-start (optional)
  if (Storage.getAutoStartComfy()) {
    const { ComfyUIController } = await import('./services/comfyController.js');
    ComfyUIController.ensureServerRunning();
  }
}

async function _initDataRegistries() {
  // Subscribe to models:checked event to update state
  Events.on('models:checked', ({ installedModelIds: ids }) => {
    state.s_installedModelIds = ids;
  });

  // Subscribe to engine:ready event — check models only after engine is set up
  // This ensures extra_model_paths.yaml exists before we try to read it
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
