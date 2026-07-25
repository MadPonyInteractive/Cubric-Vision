/**
 * shellWindow.js — resolve the Electron window that actually holds the app.
 *
 * Since the family splash landed (main.js, MPI-10), the FIRST window is a frameless
 * `file://…/splash/splash.html` that is destroyed on the main window's ready-to-show.
 * So `app.firstWindow()` either hands back the splash (URL assertions fail) or a
 * window that closes underneath the test ("Target page, context or browser has been
 * closed"). Every desktop spec wants the shell — the window on 127.0.0.1:3000.
 *
 * @param {import('@playwright/test').ElectronApplication} app
 * @param {number} [timeoutMs]
 * @returns {Promise<import('@playwright/test').Page>}
 */
async function shellWindow(app, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const win = app.windows().find(w => w.url().includes('127.0.0.1:3000'));
    if (win) {
      await win.waitForLoadState('domcontentloaded');
      return win;
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`shellWindow: no 127.0.0.1:3000 window within ${timeoutMs}ms`);
}

module.exports = { shellWindow };
