// MPI-177: MpiRunpodSettings extraction — the RunPod section must render and
// initialise inside the Settings slide-over exactly as it did pre-extraction,
// and survive a close → re-open cycle (fresh instance each open).
const fs = require('fs');
const { test, expect, _electron: electron } = require('@playwright/test');

test('settings slide-over renders the extracted RunPod section', async ({}, testInfo) => {
  // Suite runs share the machine with other work; app boot under load can blow the 30s default.
  test.setTimeout(90000);
  const userDataDir = testInfo.outputPath('user-data');
  fs.mkdirSync(userDataDir, { recursive: true });

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  env.CUBRIC_E2E = '1';
  env.CUBRIC_E2E_USER_DATA = userDataDir;

  const app = await electron.launch({ args: ['.'], env });

  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window).toHaveURL(/127\.0\.0\.1:3000/);

    const pageErrors = [];
    window.on('pageerror', (err) => pageErrors.push(String(err)));

    const openSettings = () => window.evaluate(async () => {
      const [{ Events }, { MpiSettings }] = await Promise.all([
        import('/js/events.js'),
        import('/js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js'),
      ]);
      Events.emit('slide-over:open', { title: 'Settings', component: MpiSettings });
    });

    // ── open Settings ────────────────────────────────────────────────
    await openSettings();
    const panel = window.locator('.mpi-slide-over');
    await expect(panel).toBeVisible();

    // Extracted section mounted into its slot, with its own template intact.
    const mount = window.locator('#mpiSettingsRunpodMount');
    await expect(mount.locator('.mpi-settings__section-title')).toHaveText('RunPod Remote Engine');
    await expect(mount.locator('#mpiSettingsRunpodToggleSlot .mpi-checkbox, #mpiSettingsRunpodToggleSlot input[type="checkbox"]').first()).toBeAttached();

    // _initRunpodSection ran via the forwarded onOpen: the key-status hint is populated.
    await expect(window.locator('#mpiSettingsRunpodKeyStatus')).not.toHaveText('', { timeout: 10000 });

    // Non-RunPod half of MpiSettings still initialises (auto-start checkbox).
    await expect(window.locator('#mpiSettingsAutoStartSlot input[type="checkbox"]').first()).toBeAttached();

    // ── close → content destroyed with the panel ─────────────────────
    // Close via the panel's own API instead of clicking: under load the E2E
    // window throttles rendering, so the slide-in transform / engine-install
    // modal backdrop make pointer clicks flaky — neither is this test's subject.
    await window.evaluate(() => document.querySelector('.mpi-slide-over')?.close());
    await expect(panel).toHaveCount(0, { timeout: 5000 });

    // ── re-open: fresh instance renders + re-inits again ─────────────
    await openSettings();
    await expect(window.locator('#mpiSettingsRunpodMount .mpi-settings__section-title')).toHaveText('RunPod Remote Engine');
    await expect(window.locator('#mpiSettingsRunpodKeyStatus')).not.toHaveText('', { timeout: 10000 });

    expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  } finally {
    await app.close();
  }
});
