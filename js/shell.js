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

// Components
import { MpiMemoryMonitor } from './components/Compounds/MpiMemoryMonitor/MpiMemoryMonitor.js';
import { MpiProjectName } from './components/Compounds/MpiProjectName/MpiProjectName.js';
import { MpiErrorDialog } from './components/Compounds/MpiErrorDialog/MpiErrorDialog.js';
import { MpiStartingComfy } from './components/Compounds/MpiStartingComfy/MpiStartingComfy.js';
import { MpiModelsModal } from './components/Blocks/MpiModelsModal/MpiModelsModal.js';
import { PromptBoxService } from './shell/promptBoxService.js';
import { getModelsByType } from './data/modelRegistry.js';

// Shell Sub-modules
import { preloadComponentStyles } from './shell/preloadStyles.js';
import { bindWindowControls } from './shell/windowControls.js';
import { initProjectUI, loadProjectGrid } from './shell/projectUI.js';
import { triggerMemoryRelease, bindMemoryHotkeys } from './shell/memoryOps.js';
import { StatusBar } from './shell/statusBar.js';
import { initNavigation, handleNavigation, updateTitlebarProject } from './shell/navigation.js';

// Internal references for communication
let _projectNameInstance = null;

// ── Global dialog singletons ──────────────────────────────────────────────────
const _errorDialog = MpiErrorDialog.mount(document.createElement('div'));
const _startingComfy = MpiStartingComfy.mount(document.createElement('div'));
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
  // 1. Performance: Preload all styles to prevent FOUC
  preloadComponentStyles();

  // 2. DOM Selection
  const pageLanding = document.getElementById('page-landing');
  const appShell = document.getElementById('app-shell');
  const toolContainer = document.getElementById('tool-container');
  const radialMount = document.getElementById('radial-mount');
  const monitorMount = document.getElementById('memory-monitor-mount');
  const projectNameMount = document.getElementById('project-name-mount');
  const promptBoxMount = document.getElementById('prompt-box-mount');
  PromptBoxService.init(promptBoxMount);

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
      sessionStorage.setItem('mpi_dev_page', page);
      sessionStorage.setItem('mpi_dev_params', JSON.stringify(params || {}));
    }
    handleNavigation(page, params);
  });

  // 7. Data Pre-fetching (Non-blocking)
  _initDataRegistries().catch(err => console.error('[shell] registry failed:', err));

  // 8. Boot/Restore Logic
  _bootApp();
}

/**
 * Restores session state in dev_mode or defaults to landing.
 */
async function _bootApp() {
  if (APP_CONFIG.test_styles) {
    const savedPage = sessionStorage.getItem('mpi_dev_page');
    const savedParams = JSON.parse(sessionStorage.getItem('mpi_dev_params') || '{}');
    handleNavigation(savedPage || PAGE_LANDING, savedParams);
  } else {
    handleNavigation(PAGE_LANDING);
  }

  // Wire startup modal to comfy engine events.
  // comfyController emits these events; shell owns the component reference.
  Events.on('comfy:starting', () => _startingComfy.el.show());
  Events.on('comfy:ready',    () => { _startingComfy.el.hide(); loadAssets(); });
  Events.on('comfy:error',    ({ message }) => _startingComfy.el.setError(message));
  Events.on('ui:error',       ({ title, message }) => showError(title, message));

  // Show model manager when zero image models are installed
  Events.on('models:open', () => _modelsModal.el.show());
  Events.on('models:all-installed', () => _modelsModal.el.hide());
  Events.on('models:closed', () => {
      _modelsModal.el.hide();
      // Defer show() to next tick so overlay removal + stash restore
      // settle first (avoids race where overlay is still in DOM when
      // show() runs and immediate hide() from MpiGalleryBlock overrides it)
      requestAnimationFrame(() => {
          if (PromptBoxService.component) PromptBoxService.show();
      });
  });
  Events.on('state:changed', ({ key }) => {
      if (key !== 's_installedModelIds') return;
      const hasImageModels = getModelsByType('image').some(m => m.installed === true);
      if (!hasImageModels) _modelsModal.el.show();
  });

  // ComfyUI Auto-start (optional)
  if (localStorage.getItem('mpi_auto_start_comfy') === 'true') {
    const { ComfyUIController } = await import('./services/comfyController.js');
    ComfyUIController.ensureServerRunning();
  }
}

async function _initDataRegistries() {
  // Subscribe BEFORE syncing so the first emission is never missed
  Events.on('models:checked', ({ installedModelIds: ids }) => {
    state.s_installedModelIds = ids;
  });

  try {
    await syncModelInstalled();
  } catch (err) {
    console.error('[shell] background registry failed:', err);
  }
}
