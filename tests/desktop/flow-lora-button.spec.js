const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

/**
 * MPI-504 — the Flow's LoRA button asks the app to open its OWN Model Settings panel.
 *
 * Fabio's ask: "a button that opens up the LoRA panel, which is the same panel as the
 * models have, which is called the settings panel, which has everything already built
 * in." So the flow builds no LoRA UI at all — it names a model and emits. This spec
 * covers the flow's whole half of that: the declaration renders as a button, pressing
 * it takes the `settings` action branch, and the event carries the RIGHT model id.
 *
 * The model id is the part worth pinning. An event that fires with `undefined` opens
 * nothing and logs nothing — the button would look wired and do exactly as much as the
 * Enhance button did before this card fixed it.
 *
 * What this cannot reach: the Blocks that own the overlay are not mounted with no
 * project open, so the OPEN itself is covered by tests/flow-lora-rack.test.cjs, which
 * pins the listener in BOTH Blocks (each mounts its own overlay — one is not enough).
 */
// Electron boot (splash → local server → shell) plus the settle wait runs past the
// 30s default.
test.setTimeout(90000);

test('the LoRA button asks for the Model Settings panel on the flow\'s model', async ({}, testInfo) => {
  const { app, window } = await launchApp(testInfo);

  try {
    await window.waitForTimeout(6000);

    await window.evaluate(async () => {
      const { Events } = await import('/js/events.js');
      Events.emit('flow:open', { flowId: 'character-sheet' });
    });
    await expect(window.locator('.mpi-base-flow')).toHaveCount(1);

    // Walk to the run slide, where the controls live. Clicks go through the handler
    // in-page: with no project the overlay's main-area is hidden, so nothing inside it
    // is clickable to a synthetic gesture.
    await window.evaluate(() => {
      document.querySelector('#flow-next').click();
      document.querySelector('#flow-next').click();
    });

    const btn = window.locator(
      '.mpi-base-flow__field-button:has(.mpi-btn__text:text-is("LoRAs"))',
    );
    await expect(btn).toHaveCount(1);
    // An action button carries its own caption — no `field-label` above it, same as
    // Enhance.
    await expect(window.locator('.mpi-base-flow__field-label:text-is("LoRAs")')).toHaveCount(0);

    // Listen first, then press. The payload is the assertion: a bare emit would look
    // identical from the outside and open nothing.
    const asked = await window.evaluate(async () => {
      const { Events } = await import('/js/events.js');
      return await new Promise((resolve) => {
        const off = Events.on('ui:open-model-settings', (payload) => {
          off?.();
          resolve(payload ?? null);
        });
        setTimeout(() => { off?.(); resolve(null); }, 3000);
        [...document.querySelectorAll('.mpi-base-flow__field-button')]
          .find(b => b.querySelector('.mpi-btn__text')?.textContent === 'LoRAs')
          .click();
      });
    });

    expect(asked).toEqual({ modelId: 'krea2' });
  } finally {
    await closeApp(app);
  }
});
