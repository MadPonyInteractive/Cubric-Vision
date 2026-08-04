/**
 * launch.js — one Electron launch + error collectors for the smoke specs (MPI-443).
 *
 * The eight specs that predate this helper each inline the same launch block; they
 * are deliberately left alone. New specs use this so the console/pageerror
 * collectors are wired the same way every time — a smoke test whose only job is
 * "the surface still works" is worthless if a thrown renderer error goes unread.
 *
 * @param {import('@playwright/test').TestInfo} testInfo
 * @returns {Promise<{app: import('@playwright/test').ElectronApplication,
 *                    window: import('@playwright/test').Page,
 *                    consoleErrors: string[], pageErrors: string[]}>}
 */
const fs = require('fs');
const { _electron: electron } = require('@playwright/test');
const { shellWindow } = require('./shellWindow');

async function launchApp(testInfo) {
  const userDataDir = testInfo.outputPath('user-data');
  fs.mkdirSync(userDataDir, { recursive: true });

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  env.CUBRIC_E2E = '1';
  env.CUBRIC_E2E_USER_DATA = userDataDir;

  const app = await electron.launch({ args: ['.'], env });
  const window = await shellWindow(app);

  // Collectors attach once the shell window exists, so boot noise from before
  // the handshake is not attributed to whatever the spec does next.
  const consoleErrors = [];
  const pageErrors = [];
  window.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    // Chromium's network errors ("Failed to load resource: …500") carry no URL in
    // the text, which makes a failure unactionable — keep the location with it.
    const url = msg.location()?.url;
    consoleErrors.push(url ? `${msg.text()} @ ${url}` : msg.text());
  });
  window.on('pageerror', (err) => pageErrors.push(String(err)));

  return { app, window, consoleErrors, pageErrors };
}

/** Close the app; safe to call when a test already tore it down. */
async function closeApp(app) {
  await app.close().catch(() => {});
}

module.exports = { launchApp, closeApp };
