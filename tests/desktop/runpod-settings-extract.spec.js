// MPI-177: MpiRunpodSettings extraction — the RunPod section must render and
// initialise inside its host slide-over exactly as it did pre-extraction, and
// survive a close → re-open cycle (fresh instance each open).
//
// MPI-728 MOVED THAT HOST from Settings to the new "Remote" panel, and this spec
// is what proves the move was pure relocation: the same section, the same
// key-gated locking, the same re-init on re-open, one panel to the right. The
// section's own ids are unchanged — only the mount it lands in and the panel that
// opens it. The "the rest of the host still works" assertion moved with it: in
// Settings that was the auto-start checkbox, in Remote it is the Language Models
// section that now sits above RunPod.
const fs = require('fs');
const { test, expect, _electron: electron } = require('@playwright/test');
const { shellWindow, SHELL_URL_RE } = require('./shellWindow');

test('remote slide-over renders the extracted RunPod section', async ({}, testInfo) => {
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
    const window = await shellWindow(app);
    await expect(window).toHaveURL(SHELL_URL_RE);

    const pageErrors = [];
    window.on('pageerror', (err) => pageErrors.push(String(err)));

    const openRemote = () => window.evaluate(async () => {
      const [{ Events }, { MpiRemote }] = await Promise.all([
        import('/js/events.js'),
        import('/js/components/Compounds/LandingPages/MpiRemote/MpiRemote.js'),
      ]);
      Events.emit('slide-over:open', { title: 'Remote', component: MpiRemote });
    });

    // ── open Remote ──────────────────────────────────────────────────
    await openRemote();
    const panel = window.locator('.mpi-slide-over');
    await expect(panel).toBeVisible();

    // Extracted section mounted into its slot, with its own template intact.
    const mount = window.locator('#mpiRemoteRunpodMount');
    await expect(mount.locator('.mpi-settings__section-title')).toHaveText('RunPod Remote Engine');
    // Was #mpiSettingsRunpodToggleSlot — MPI-280's Settings redesign dropped the master
    // enable toggle (the section is key-gated now) and left this assertion pointing at an
    // id that no longer exists. Auto-connect is the section's own first checkbox today.
    await expect(mount.locator('#mpiSettingsRunpodAutoConnectSlot .mpi-checkbox, #mpiSettingsRunpodAutoConnectSlot input[type="checkbox"]').first()).toBeAttached();

    // _initRunpodSection ran via the forwarded onOpen: the key-status hint is populated.
    await expect(window.locator('#mpiSettingsRunpodKeyStatus')).not.toHaveText('', { timeout: 10000 });

    // MPI-404 (absorbed MPI-405): a fresh E2E user-data dir has no API key, and the
    // panel says the RunPod controls are locked until one is saved. Every Pod-behaviour
    // control must actually be locked — "Stage all models on connect" was live.
    // "Skip the local engine install" is exempt on purpose: it is a LOCAL-engine
    // control and the only way back out of the MPI-390 escape hatch.
    await expect(window.locator('#mpiSettingsRunpodKeyStatus')).toHaveText('No API key saved.');
    for (const id of ['AutoConnect', 'AutoRetry', 'StageOnConnect']) {
      await expect(window.locator(`#mpiSettingsRunpod${id}Group`)).not.toBeVisible();
    }
    await expect(window.locator('#mpiSettingsRunpodSkipEngineGroup')).toBeVisible();

    // Non-RunPod half of MpiRemote still initialises: the Language Models section
    // above it renders and its own key-status hint is populated (MPI-728).
    await expect(window.locator('#mpiRemoteLlmMount .mpi-settings__section-title')).toHaveText('Language Models');
    await expect(window.locator('#mpiSettingsLlmKeyStatus')).not.toHaveText('', { timeout: 10000 });

    // Three backends, no "Automatic", ComfyUI by default (Fabio, 2026-09-12: the
    // RunPod section has no automatic entry either). A fresh E2E profile has no
    // DeepInfra key, so that entry is LISTED but greyed, not missing. The option
    // list portals to <body> on first open, so it only exists once opened.
    const backendSlot = '#mpiSettingsLlmEnhanceBackendSlot';
    await expect(window.locator(`${backendSlot} .mpi-dropdown__label`)).toHaveText('ComfyUI (local)');
    const toggleBackend = () => window.evaluate((sel) => document.querySelector(sel).click(), `${backendSlot} .mpi-dropdown__trigger`);
    await toggleBackend();
    const backendOptions = window.locator('.mpi-dropdown__list.is-open .mpi-dropdown__option');
    await expect(backendOptions).toHaveText([/DeepInfra/, /Ollama/, /ComfyUI/]);
    await expect(window.locator('.mpi-dropdown__list.is-open .mpi-dropdown__option[data-value="deepinfra"]')).toHaveClass(/is-disabled/);
    await toggleBackend();

    // And the move was a MOVE: neither section is left behind in Settings.
    await window.evaluate(async () => {
      const [{ Events }, { MpiSettings }] = await Promise.all([
        import('/js/events.js'),
        import('/js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js'),
      ]);
      document.querySelector('.mpi-slide-over')?.close();
      Events.emit('slide-over:open', { title: 'Settings', component: MpiSettings });
    });
    await expect(window.locator('#mpiSettingsAutoStartSlot input[type="checkbox"]').first()).toBeAttached();
    await expect(window.locator('#mpiRemoteRunpodMount')).toHaveCount(0);
    await expect(window.locator('#mpiRemoteLlmMount')).toHaveCount(0);
    // NOT `.mpi-slide-over` alone: the Remote panel is still in the DOM sliding out
    // (it leaves up to 400ms after close), querySelector hands back that
    // already-closed node first, and close() on it is a no-op — Settings stayed
    // open and this spec failed on its first run. The live panel is aria-expanded.
    await window.evaluate(() => document.querySelector('.mpi-slide-over[aria-expanded="true"]')?.close());
    await expect(panel).toHaveCount(0, { timeout: 5000 });
    await openRemote();
    await expect(panel).toBeVisible();

    // ── close → content destroyed with the panel ─────────────────────
    // Close via the panel's own API instead of clicking: under load the E2E
    // window throttles rendering, so the slide-in transform / engine-install
    // modal backdrop make pointer clicks flaky — neither is this test's subject.
    await window.evaluate(() => document.querySelector('.mpi-slide-over')?.close());
    await expect(panel).toHaveCount(0, { timeout: 5000 });

    // ── re-open: fresh instance renders + re-inits again ─────────────
    await openRemote();
    await expect(window.locator('#mpiRemoteRunpodMount .mpi-settings__section-title')).toHaveText('RunPod Remote Engine');
    await expect(window.locator('#mpiSettingsRunpodKeyStatus')).not.toHaveText('', { timeout: 10000 });

    expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  } finally {
    await app.close();
  }
});
