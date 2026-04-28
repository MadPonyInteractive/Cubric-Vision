/**
 * js/core/appName.js — Frontend ESM source of truth for the application's display name.
 *
 * Used by UI components (settings overlay, about screen, etc.).
 *
 * IMPORTANT: main.js (CommonJS) cannot `import` this file. Keep `APP_NAME` in
 * `appName.cjs` (CommonJS twin) in sync with the value here.
 *
 * Note: this is the *display* name. The npm package name is in package.json.
 * BEM CSS prefix `mpi-` is the brand namespace and intentionally separate.
 */

export const APP_NAME = 'Cubric Studio';
