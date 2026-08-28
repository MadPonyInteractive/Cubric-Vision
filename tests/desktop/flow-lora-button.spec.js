const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

/**
 * MPI-504 -> MPI-608 -> MPI-610 -> MPI-613 -> MPI-638 — a Flow's LoRA rack is opened by the
 * app's OWN Model Settings panel, and it now sits BESIDE the model dropdown it belongs to.
 *
 * Fabio's original ask: "a button that opens up the LoRA panel, which is the same panel
 * as the models have, which is called the settings panel, which has everything already
 * built in." So the flow builds no LoRA UI at all — it names a model and opens the panel.
 *
 * WHAT MOVED, TWICE. MPI-608 put a cogwheel in the Flow Library's detail drawer. MPI-613
 * put another on the run slide, and both were live at once. MPI-638 settled it on the run
 * slide and removed the drawer's: an installed flow now opens straight into its frame and
 * never renders that drawer, so the only flow reaching it has weights that are not on disk
 * — and a rack for a model you have not downloaded configures nothing.
 *
 * MPI-638 also PAIRED the cogwheel with a model dropdown, which is what let the button drop
 * its text label. Fabio, 2026-08-28: "render model" and "edit model" "are not names that
 * are sustainable because we might have 'pinpaint model' or 'remove model' ... if those
 * names were introduced, it would die, or it would introduce complexity. So if we move the
 * model drop downs to the last stage of the flow and place a little cogwheel next to the
 * model drop down that is solved."
 *
 * WHAT THIS PINS, and why each half needs a real renderer:
 *   1. the row RENDERS on the run slide — one line, dropdown + cogwheel, and NO slot
 *      caption, because the Character Sheet declares exactly one model slot;
 *   2. the cogwheel ADDRESSES the model that is actually running. A cogwheel that opened
 *      a fixed id would look identical until the user switched candidate — the same silent
 *      shape as the `undefined` modelId MPI-610 was written to catch;
 *   3. the pick REPAINTS the row rather than the slide, and the cogwheel follows it.
 *
 * `s_installedModelIds` is stubbed rather than downloading 12.25GB of weights — the same
 * move `flow-reuse-opens-without-model.spec.js` makes, and for the same reason. The run
 * slide's picker offers INSTALLED candidates only (MPI-638), so without the stub there is
 * nothing to choose between and the probe would pass while proving nothing.
 */
// Electron boot (splash -> local server -> shell) plus the settle wait runs past the
// 30s default.
test.setTimeout(90000);

test('the run slide pairs a model dropdown with its cogwheel, and the cogwheel follows the pick', async ({}, testInfo) => {
  const { app, window } = await launchApp(testInfo);

  try {
    await window.waitForTimeout(6000);

    await window.evaluate(async () => {
      const { MpiBaseFlow } = await import('/js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js');
      const { getFlowById } = await import('/js/data/flowsRegistry.js');
      const { state } = await import('/js/state.js');

      // Both Krea 2 arms on disk: the Character Sheet's ONE slot then has a real choice,
      // which is the only way its dropdown renders at all.
      state.s_installedModelIds = ['krea2', 'krea2-nsfw'];
      // The cogwheel is gated on an open project — a rack edits settings that live on one,
      // and a flow cannot run without one either.
      state.currentProject = { name: 'e2e', path: 'e2e', itemGroups: [] };

      const flow = MpiBaseFlow.mount(document.createElement('div'),
        { flow: getFlowById('character-sheet') });
      window.__mpi638 = flow;
      flow.el.open();
    });

    // The ticker NAVIGATES (carousel-frame.md), so the last tick is the run slide —
    // reached the way a user reaches it rather than by poking a private index.
    //
    // Clicked IN PAGE rather than through Playwright, and every interaction below is the
    // same. The frame is a `main-area` MpiOverlay: it covers `#tool-container`, which the
    // LANDING page does not have, so the whole overlay renders into the DOM and measures
    // zero — Playwright refuses to click an invisible element and this reads as a broken
    // frame. Navigating a real project's Gallery first would cost the rest of the app to
    // prove one row. The MPI-610 spec this replaces drove the library the same way.
    await window.evaluate(() => {
      const ticks = document.querySelectorAll('.mpi-base-flow__tick');
      ticks[ticks.length - 1].click();
    });

    const row = window.locator('.mpi-base-flow__model-slot');
    await expect(row).toHaveCount(1);
    // ONE slot since MPI-628 (the Klein head-removal phase stopped being a model pass),
    // so there is nothing to disambiguate and the caption must be absent. The label is a
    // DISAMBIGUATOR, not a name: this is the assertion that fails if someone reintroduces
    // per-flow wording like "Render model".
    await expect(row.locator('.mpi-base-flow__field-label')).toHaveCount(0);
    await expect(window.locator('.mpi-base-flow__model-pick .mpi-dropdown')).toHaveCount(1);

    const cog = window.locator('.mpi-base-flow__model-cog');
    await expect(cog).toHaveCount(1);
    // The cogwheel names the model it will open — which is also how this spec reads the
    // resolution without reaching into the panel.
    await expect(cog).toHaveAttribute('aria-label', 'LoRAs for Krea 2');

    // Press it, switch candidate, press it again — and read WHICH MODEL the panel opened
    // on both times. `MpiModelSettings.open({ modelId })` emits `settings:model:select`,
    // and that id is the only thing that proves the wiring: the button's own label is
    // derived from the resolved id, so a cogwheel opening a FIXED id (`slot.models[0]`,
    // the recommended one) renders an identical row with an identical tooltip and is
    // wrong only once the user switches. That mutant survived an earlier draft of this
    // spec, which asserted the label alone.
    //
    // It is also what proves the button is WIRED at all: the frame mounts its own
    // MpiModelSettings rather than emitting `ui:open-model-settings`, which is listened
    // for by two workspace Blocks a flow opened from Landing does not have on screen — a
    // bare emit would look identical from the outside and open nothing.
    const opened = await window.evaluate(async () => {
      const { Events } = await import('/js/events.js');
      const { getFlowById, flowModelIds } = await import('/js/data/flowsRegistry.js');
      const seen = [];
      const off = Events.on('settings:model:select', p => seen.push(p.modelId));
      const press = async () => {
        document.querySelector('.mpi-base-flow__model-cog').click();
        await new Promise(r => setTimeout(r, 300));
      };

      await press();
      const panelMounted = !!document.querySelector('.mpi-model-settings');

      // Switch candidate. The pick must repaint the ROW — not `_renderSlide()`, which
      // would tear down and replay the result pane to change one dropdown — and the
      // cogwheel must follow it, or the user edits the SFW rack while NSFW renders.
      const dd = document.querySelector('.mpi-base-flow__model-pick .mpi-dropdown');
      dd.querySelector('.mpi-dropdown__trigger').click();
      await new Promise(r => setTimeout(r, 200));
      // Queried off `document`, not off `dd`: MpiDropdown PORTALS its list to the body so
      // a flow step row cannot clip it, and an option scoped to the wrapper is gone.
      const opt = [...document.querySelectorAll('.mpi-dropdown__option')]
        .find(o => o.textContent.includes('Krea 2 NSFW'));
      if (!opt) throw new Error('the NSFW candidate is not in the dropdown');
      opt.click();
      await new Promise(r => setTimeout(r, 200));

      await press();
      off?.();
      return { seen, panelMounted, resolved: flowModelIds(getFlowById('character-sheet')) };
    });

    expect(opened.panelMounted, 'the cogwheel must open the app\'s own panel').toBe(true);
    expect(opened.seen, 'the panel must open on the model the slot is RUNNING, both times')
      .toEqual(['krea2', 'krea2-nsfw']);
    expect(opened.resolved, 'the pick must be recorded in the session Map')
      .toEqual(['krea2-nsfw']);
    await expect(window.locator('.mpi-base-flow__model-slot')).toHaveCount(1);
    await expect(window.locator('.mpi-base-flow__model-cog'))
      .toHaveAttribute('aria-label', 'LoRAs for Krea 2 NSFW');
  } finally {
    await window.evaluate(() => { window.__mpi638?.el?.destroy?.(); }).catch(() => {});
    await closeApp(app);
  }
});
