/**
 * router.js — Lightweight client-side page router.
 * Pages: 'landing' | 'workspace'
 */

import { state } from './state.js';

export const PAGE_LANDING   = 'landing';
export const PAGE_WORKSPACE = 'workspace'; // single workspace state — radial menu handles tool selection

let _onNavigateCallback = null;

/**
 * Register a callback that fires whenever navigation happens.
 * Called by shell.js so the shell can re-render.
 */
export function onNavigate(fn) {
  _onNavigateCallback = fn;
}

/**
 * Navigate to a page.
 * @param {string} page  - One of the PAGE_* constants above.
 * @param {Object} [params] - Optional extra data.
 */
export function navigate(page, params = {}) {
  state.previousPage  = state.currentPage;
  state.previousParams = state.currentParams;

  state.currentPage   = page;
  state.currentParams = params;

  if (_onNavigateCallback) _onNavigateCallback(page, params);
}
