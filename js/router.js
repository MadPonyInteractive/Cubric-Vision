/**
 * router.js — Lightweight client-side page router.
 * Pages: 'landing' | 'gallery' | 'group-history'
 *
 * Navigation is history-stack based. Each navigate() call pushes an entry.
 * back() pops the current entry and restores the previous one.
 */

import { state } from './state.js';

export const PAGE_LANDING       = 'landing';
export const PAGE_GALLERY       = 'gallery';        // Main project gallery (item groups grid)
export const PAGE_GROUP_HISTORY = 'group-history';  // Single item group history view

/** @deprecated use PAGE_GALLERY */
export const PAGE_WORKSPACE = 'gallery';

let _onNavigateCallback = null;

/** @type {Array<{page: string, params: Object}>} */
const _history = [];

/**
 * Register a callback that fires whenever navigation happens.
 * Called by shell.js so the shell can re-render.
 */
export function onNavigate(fn) {
  _onNavigateCallback = fn;
}

/**
 * Navigate to a page, pushing current location onto the history stack.
 * @param {string} page  - One of the PAGE_* constants above.
 * @param {Object} [params] - Optional extra data (e.g. { view: 'generator' }).
 */
export function navigate(page, params = {}) {
  // Push current location before moving
  if (state.currentPage) {
    _history.push({ page: state.currentPage, params: state.currentParams });
  }

  state.currentPage   = page;
  state.currentParams = params;

  if (_onNavigateCallback) _onNavigateCallback(page, params);
}

/**
 * Navigate back one step. If no history exists, does nothing.
 */
export function back() {
  if (_history.length === 0) return;
  const prev = _history.pop();
  state.currentPage   = prev.page;
  state.currentParams = prev.params;
  if (_onNavigateCallback) _onNavigateCallback(prev.page, prev.params);
}

/**
 * Returns true if there is a previous page to go back to.
 * @returns {boolean}
 */
export function canGoBack() {
  return _history.length > 0;
}

/**
 * Clears the history stack. Call when returning to landing so the
 * workspace history doesn't bleed into a new project session.
 */
export function clearHistory() {
  _history.length = 0;
}
