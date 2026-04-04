/**
 * navigation.js — Routing logic and Workspace-specific UI mounting.
 */

import { state } from '../state.js';
import { APP_CONFIG } from '../../dev_configs/app_config.js';
import { navigate, PAGE_LANDING, PAGE_WORKSPACE } from '../router.js';
import { initShaderBackground, stopShaderBackground } from '../components/shaderBackground.js';
import { MpiRadialMenu } from '../components/Primitives/MpiRadialMenu/MpiRadialMenu.js';
import { loadProjectGrid } from './projectUI.js';

// Modular scope instances
let _radialInstance = null;
let _projectNameInstance = null;
let _toolContainer = null;
let _appShell = null;
let _pageLanding = null;

/**
 * Initializes navigation refs and hooks into the router.
 * @param {Object} refs - DOM references from shell.js
 */
export function initNavigation(refs) {
  _toolContainer = refs.toolContainer;
  _appShell = refs.appShell;
  _pageLanding = refs.pageLanding;
  _projectNameInstance = refs.projectNameInstance;
}

/**
 * Core navigation router logic.
 * @param {string} page 
 * @param {Object} params 
 */
export function handleNavigation(page, params) {
  if (page === PAGE_LANDING) {
    state.activeSubPage = null;
    _showLanding();
    loadProjectGrid();
    updateTitlebarProject();
    initShaderBackground();
  } else if (page === PAGE_WORKSPACE) {
    _showShell();
    updateTitlebarProject();
    stopShaderBackground();
    _toolContainer.innerHTML = '';
    _mountWorkspace();
  }
}

/**
 * Forces a titlebar sync with current state.
 */
export function updateTitlebarProject() {
  if (_projectNameInstance) {
    _projectNameInstance.el.setProjectName(state.currentProject?.name || '');
  }
}

function _showLanding() {
  _pageLanding?.classList.remove('hide');
  _appShell?.classList.add('hide');
}

function _showShell() {
  _pageLanding?.classList.add('hide');
  _appShell?.classList.remove('hide');
}

/**
 * Internal Workspace assembler. 
 * Mounts the canvas, radial menu, and registers selection handlers.
 */
function _mountWorkspace() {
  if (_radialInstance) {
    _radialInstance.destroy();
    _radialInstance = null;
  }

  if (_projectNameInstance) {
    _projectNameInstance.el.setPageName('Main Menu');
  }

  _toolContainer.style.position = 'relative';

  const extraItems = APP_CONFIG.dev_mode ? [
    { action: 'components', label: 'Components', icon: 'grid' }
  ] : [];

  _radialInstance = MpiRadialMenu.mount(_toolContainer, { context: 'root', open: true, extraItems });

  const ACTION_LABELS = {
    root: 'Main Menu',
    image: 'Image',
    video: 'Video',
    audio: 'Audio',
    gallery: 'Gallery',
    components: 'Components',
  };

  _radialInstance.on('select', ({ action }) => {
    if (action === 'components') {
      if (_projectNameInstance) _projectNameInstance.el.setPageName('Components');
      _loadComponentsGallery();
      return;
    }

    if (_projectNameInstance && ACTION_LABELS[action]) {
      _projectNameInstance.el.setPageName(ACTION_LABELS[action]);
    }
  });
}

async function _loadComponentsGallery() {
  const { ensureTemplate } = await import('../templateLoader.js');
  const { initComponentsPage } = await import('../pages/components.js');

  _toolContainer.innerHTML = '';
  _toolContainer.style.position = '';

  await ensureTemplate('tpl-components');
  const tpl = document.getElementById('tpl-components');
  _toolContainer.appendChild(tpl.content.cloneNode(true));

  await initComponentsPage();
}
