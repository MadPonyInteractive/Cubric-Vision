const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

/**
 * MPI-504 → MPI-608 → MPI-610 — a Flow's LoRA rack is opened by the app's OWN Model
 * Settings panel, and a flow with a model PER PHASE gets one opener per phase.
 *
 * Fabio's original ask: "a button that opens up the LoRA panel, which is the same panel
 * as the models have, which is called the settings panel, which has everything already
 * built in." So the flow builds no LoRA UI at all — it names a model and emits.
 *
 * WHAT MOVED. This spec used to press a `LoRAs` action button on the flow's RUN SLIDE and
 * assert it emitted `{ modelId: 'krea2' }`. MPI-608 deleted that button: one flow-level
 * button could only ever name one rack, and a flow choosing a model per phase needs one
 * each. The opener is now a cogwheel beside EACH model dropdown in the Flow Library's
 * detail panel. The spec was left asserting the deleted button and had been failing red
 * since e0173e5d; rewritten here (MPI-610) onto the shape that shipped.
 *
 * The model id is still the part worth pinning. An event that fires with `undefined`
 * opens nothing and logs nothing — the cogwheel would look wired and do exactly as much
 * as the Enhance button did before MPI-504 fixed it. And with two slots there is a new
 * way to be silently wrong: BOTH cogwheels emitting the same id, which would send the
 * blend phase's rack at the render model.
 *
 * The library is mounted directly rather than through `Events.emit('flows:open')` — the
 * shell gates that door on an installed engine (`blockedByNoEngine`), and the E2E profile
 * deliberately has none.
 */
// Electron boot (splash → local server → shell) plus the settle wait runs past the
// 30s default.
test.setTimeout(90000);

test('each model slot gets its OWN cogwheel, opening Model Settings on THAT slot\'s model', async ({}, testInfo) => {
  const { app, window } = await launchApp(testInfo);

  try {
    await window.waitForTimeout(6000);

    await window.evaluate(async () => {
      const { MpiFlowLibrary } = await import(
        '/js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js');
      const lib = MpiFlowLibrary.mount(document.createElement('div'));
      window.__mpi610 = lib;
      lib.el.open();
    });

    // Open the Character Sheet's detail panel by clicking its tile, the way a user does.
    await window.evaluate(() => {
      const tile = [...document.querySelectorAll('.mpi-tile')]
        .find(t => t.textContent.includes('Character Sheet'));
      if (!tile) throw new Error('the Character Sheet tile is not in the library');
      tile.click();
    });

    // ONE labelled slot since MPI-628. This probe was written for MPI-610's TWO slots —
    // Krea 2 rendering and Klein removing the head — and the head removal stopped being a
    // model pass, so the blend slot went with it. No shipped flow declares two slots now,
    // so the MULTI-slot render has no desktop probe left; the machinery behind it is
    // covered at node level in tests/flow-model-choice.test.cjs against a synthetic
    // fixture. Restore the second half here the day a two-slot flow ships — a fixture flow
    // is NOT the answer in this file, because the Library renders a tile and a missing
    // preview asset 404s the whole suite.
    //
    // Still worth its run: the slot must label itself rather than read "Model", and the
    // cogwheel has to open on the slot's own model.
    await expect(window.locator('.mpi-detail__field-label:text-is("Render model")')).toHaveCount(1);
    await expect(window.locator('.mpi-detail__field-label:text-is("Blend model")')).toHaveCount(0);
    await expect(window.locator('.mpi-detail__model-pick')).toHaveCount(1);

    // …and a cogwheel in it, because the slot declares `loras: true`.
    const cogs = window.locator('.mpi-detail__loras-btn');
    await expect(cogs).toHaveCount(1);

    // Listen first, then press. A bare emit would look identical from the outside.
    const asked = await window.evaluate(async () => {
      const { Events } = await import('/js/events.js');
      const seen = [];
      const off = Events.on('ui:open-model-settings', p => seen.push(p));
      for (const btn of document.querySelectorAll('.mpi-detail__loras-btn')) btn.click();
      await new Promise(r => setTimeout(r, 500));
      off?.();
      return seen;
    });

    // The cogwheel opens on the SLOT's running model, not on a flow-level default.
    expect(asked).toEqual([{ modelId: 'krea2' }]);
  } finally {
    await window.evaluate(() => { window.__mpi610?.el?.destroy?.(); }).catch(() => {});
    await closeApp(app);
  }
});
