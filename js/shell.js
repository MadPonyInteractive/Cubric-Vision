/**
 * shell.js — App Orchestrator.
 * Wires up sub-modules for window controls, projects, memory, and navigation.
 */

import { state } from './state.js';
import { APP_CONFIG } from '../dev_configs/app_config.js';
import { onNavigate, PAGE_LANDING } from './router.js';
import { refreshModelRegistry } from './managers/modelManager.js';
import { refreshComfyWorkflowRegistry } from './comfyWorkflowManager.js';

// Components
import { MpiMemoryMonitor } from './components/Compounds/MpiMemoryMonitor/MpiMemoryMonitor.js';
import { MpiProjectName } from './components/Compounds/MpiProjectName/MpiProjectName.js';
import { MpiErrorDialog } from './components/Compounds/MpiErrorDialog/MpiErrorDialog.js';

// Shell Sub-modules
import { preloadComponentStyles } from './shell/preloadStyles.js';
import { bindWindowControls } from './shell/windowControls.js';
import { initProjectUI, loadProjectGrid } from './shell/projectUI.js';
import { triggerMemoryRelease, bindMemoryHotkeys } from './shell/memoryOps.js';
import { StatusBar } from './shell/statusBar.js';
import { initNavigation, handleNavigation, updateTitlebarProject } from './shell/navigation.js';

// Internal references for communication
let _projectNameInstance = null;

// ── Global Error Dialog singleton ─────────────────────────────────────────────
const _errorDialog = MpiErrorDialog.mount(document.createElement('div'));

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
  // 1. Performance: Preload all styles to prevent FOUC
  preloadComponentStyles();

  // 2. DOM Selection
  const pageLanding = document.getElementById('page-landing');
  const appShell = document.getElementById('app-shell');
  const toolContainer = document.getElementById('tool-container');
  const radialMount = document.getElementById('radial-mount');
  const monitorMount = document.getElementById('memory-monitor-mount');
  const projectNameMount = document.getElementById('project-name-mount');

  // 3. Mount Global HUD Components
  _projectNameInstance = MpiProjectName.mount(projectNameMount, {
    projectName: state.currentProject?.name || '',
  });

  const memMonitor = MpiMemoryMonitor.mount(monitorMount);

  // 4. Bind Interactions
  initProjectUI();
  StatusBar.init();
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
      sessionStorage.setItem('mpi_dev_page', page);
      sessionStorage.setItem('mpi_dev_params', JSON.stringify(params || {}));
    }
    handleNavigation(page, params);
  });

  // 7. Data Pre-fetching (Non-blocking)
  _initDataRegistries();

  // 8. Boot/Restore Logic
  _bootApp();
}

/**
 * Restores session state in dev_mode or defaults to landing.
 */
function _bootApp() {
  if (APP_CONFIG.test_styles) {
    const savedPage = sessionStorage.getItem('mpi_dev_page');
    const savedParams = JSON.parse(sessionStorage.getItem('mpi_dev_params') || '{}');
    handleNavigation(savedPage || PAGE_LANDING, savedParams);
  } else {
    handleNavigation(PAGE_LANDING);
  }

  // ComfyUI Auto-start
  if (localStorage.getItem('mpi_auto_start_comfy') === 'true') {
    const { ComfyUIController } = import('./services/comfyController.js');
    ComfyUIController.then(c => c.ComfyUIController.ensureServerRunning());
  }
}

async function _initDataRegistries() {
  try {
    await Promise.all([
      refreshModelRegistry(),
      refreshComfyWorkflowRegistry()
    ]);
  } catch (err) {
    console.error('[shell] background registry failed:', err);
  }
}
