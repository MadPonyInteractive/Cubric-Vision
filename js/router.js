/**
 * router.js — Lightweight client-side page router.
 * Pages: 'landing' | 'project' | 'media' | 'tool' | 'settings' | 'about'
 * Tool names: promptEnhancer | descriptor | translator | jsonFormatter |
 *             upscaler | videoGenerator | videoMotionControl | audioGenerator
 */

import { state } from './state.js';

const PAGE_LANDING  = 'landing';
const PAGE_PROJECT  = 'project';
const PAGE_MEDIA    = 'media';
const PAGE_TOOL     = 'tool';
const PAGE_SETTINGS = 'settings';
const PAGE_ABOUT    = 'about';
const PAGE_HELP     = 'help';
const PAGE_COMPONENTS = 'components';

let _onNavigateCallback = null;

/**
 * Register a callback that fires whenever navigation happens.
 * Called by init.js so the shell can re-render.
 */
export function onNavigate(fn) {
  _onNavigateCallback = fn;
}

/**
 * Navigate to a page.
 * @param {string} page  - One of the PAGE_* constants above.
 * @param {Object} params - Optional extra data (e.g. { name: 'generator' } for PAGE_TOOL).
 */
export function navigate(page, params = {}) {
  // Store previous page for "Back" buttons in modal/provisioning views
  if (state.currentPage !== 'provisioning') { // Provisioning screen itself is not a "destination" we want to return to if redirected from it? 
    // Wait, the router doesn't have a 'provisioning' page, it has 'PAGE_TOOL'.
    // The provisioning is an overlay *status* of a tool.
    // So if you navigate to Translator, and it's missing, you stay on PAGE_TOOL {name: 'translator'}
    // BUT you see a different UI.
    // So 'Back' should take you to where you were *before* you clicked the sidebar item.
    state.previousPage = state.currentPage;
    state.previousParams = state.currentParams;
  }
  
  state.currentPage = page;
  state.currentParams = params;

  if (page === PAGE_TOOL && params.name) {
    state.currentTool = params.name;
    // Persist the active tool in the current project
    if (state.currentProject) {
      fetch('/update-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderPath: state.currentProject.folderPath,
          updates: { selectedTool: params.name },
        }),
      }).catch(() => {});
    }
  }

  if (_onNavigateCallback) _onNavigateCallback(page, params);
}

export { PAGE_LANDING, PAGE_PROJECT, PAGE_MEDIA, PAGE_TOOL, PAGE_SETTINGS, PAGE_ABOUT, PAGE_HELP, PAGE_COMPONENTS };
