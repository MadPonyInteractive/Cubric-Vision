/**
 * shellWindow.js — resolve the Electron window that actually holds the app.
 *
 * Since the family splash landed (main.js, MPI-10), the FIRST window is a frameless
 * `file://…/splash/splash.html` that is destroyed on the main window's ready-to-show.
 * So `app.firstWindow()` either hands back the splash (URL assertions fail) or a
 * window that closes underneath the test ("Target page, context or browser has been
 * closed"). Every desktop spec wants the shell — the window on the app's own host.
 *
 * That host is NOT 127.0.0.1:3000 any more: globalSetup.js gives each run a free
 * `CUBRIC_PORT` so the suite never fights the dev app (MPI-448). Match on the port
 * this process was handed, and export it so specs assert the same thing.
 *
 * It also waits for that window's shell to have BOOTED, not merely parsed — see the
 * comment on the wait below. A spec can assume hotkeys and IPC listeners are live.
 */

/** Host:port the shell is served from — the run's CUBRIC_PORT, else the 3000 default. */
const SHELL_HOST = `127.0.0.1:${Number(process.env.CUBRIC_PORT) || 3000}`;

/** Regex form for `expect(window).toHaveURL(...)`. */
const SHELL_URL_RE = new RegExp(SHELL_HOST.replace(/\./g, '\\.'));

/**
 * @param {import('@playwright/test').ElectronApplication} app
 * @param {number} [timeoutMs]
 * @returns {Promise<import('@playwright/test').Page>}
 */
async function shellWindow(app, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const win = app.windows().find(w => w.url().includes(SHELL_HOST));
    if (win) {
      await win.waitForLoadState('domcontentloaded');
      // `domcontentloaded` is NOT booted. `init.js` awaits `initPaths()` and only then
      // `initShell()`, whose step 0 is `Hotkeys.init()` — the F11 binding. Handing the
      // window back here gives a spec a renderer with no hotkeys and no IPC listeners.
      // Most specs never notice: their first move is a locator, which auto-waits. A
      // `keyboard.press` does not, so fullscreen-titlebar.spec.js dropped its F11 into
      // the gap and the class never arrived (CI 33373667728; 1 launch in 6 locally).
      // `focusModeService` puts the `page-*` class on `body` from `_bootApp()` — the
      // last thing `initShell` does — so it marks the whole shell live, hotkeys included.
      await win.waitForFunction(
        () => /\bpage-/.test(document.body.className),
        null,
        { timeout: Math.max(1, deadline - Date.now()) }
      );
      return win;
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`shellWindow: no ${SHELL_HOST} window within ${timeoutMs}ms`);
}

module.exports = { shellWindow, SHELL_HOST, SHELL_URL_RE };
