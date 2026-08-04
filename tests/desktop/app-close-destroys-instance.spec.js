const fs = require('fs');
const { test, expect, _electron: electron } = require('@playwright/test');
const { shellWindow } = require('./shellWindow');

/**
 * MPI-345 — closing an App must DESTROY its instance, not just hide the overlay.
 *
 * A hidden-but-alive app keeps every listener its setup registered, including the
 * global `generation.run` hotkey. That is what fired a phantom Head Swap alongside
 * a Qwen edit: one Ctrl+Enter reached BOTH the PromptBox and the closed app's Run.
 * The handler count on `down:control+enter` is the invariant — it must return to
 * its pre-open value once the app closes.
 */
// Electron boot (splash → local server → shell) plus the settle wait below runs
// past the 30s default.
test.setTimeout(90000);

test('closing an App releases its generation.run hotkey', async ({}, testInfo) => {
  // MPI-446: this spec needs a BOOTED shell, and shell.js parks boot behind the
  // first-run engine-install modal on any profile with no engine (js/shell.js:265).
  // Every CI profile is that profile, so .mpi-base-app never mounts. It is a fixture
  // gap, not an app bug — the app is correctly showing onboarding. Runs locally,
  // where an engine exists, so the release gate still covers it.
  test.fixme(!!process.env.CI, 'MPI-446: E2E profile is not seeded past the first-run engine install');

  const userDataDir = testInfo.outputPath('user-data');
  fs.mkdirSync(userDataDir, { recursive: true });

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  env.CUBRIC_E2E = '1';
  env.CUBRIC_E2E_USER_DATA = userDataDir;

  const app = await electron.launch({ args: ['.'], env });

  try {
    const window = await shellWindow(app);
    // The shell wires the app:open listener during boot; wait for it to settle.
    await window.waitForTimeout(6000);

    const runHandlers = () => window.evaluate(async () => {
      const { Hotkeys } = await import('/js/managers/hotkeyManager.js');
      return Hotkeys._handlers.get('down:control+enter')?.size ?? 0;
    });

    const before = await runHandlers();

    await window.evaluate(async () => {
      const { Events } = await import('/js/events.js');
      Events.emit('app:open', { appId: 'head-swap' });
    });
    await expect(window.locator('.mpi-base-app')).toHaveCount(1);
    expect(await runHandlers()).toBe(before + 1);

    // Close the way Escape does. The X button is not clickable here — with no project
    // open the overlay mounts into a main-area the landing page keeps hidden — and the
    // signal under test is the CLOSE, not which control emitted it.
    await window.evaluate(async () => {
      const { Events } = await import('/js/events.js');
      Events.emit('ui:close-all-popups');
    });
    await expect(window.locator('.mpi-base-app')).toHaveCount(0);
    // Destroy is deferred one tick past the overlay's own hide().
    await window.waitForTimeout(500);
    expect(await runHandlers()).toBe(before);
  } finally {
    await app.close();
  }
});
