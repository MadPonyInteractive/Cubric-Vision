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

/**
 * MPI-641 — a slot with ONE installed candidate states its model in a BOX.
 *
 * Fabio, on the screenshot where only Krea 2 was installed: *"can we make that name display
 * inside a box to better match the rest of the UI?"* In a 236px column of boxed controls,
 * bare text has nothing to align to and reads as a stray caption.
 *
 * The box is the DROPDOWN TRIGGER's, not MpiInput's sunken field, and that is the point:
 * this exact slot renders an `MpiDropdown` the moment a second candidate is installed, so
 * matching the trigger means installing a model changes the CONTROL without moving the
 * LAYOUT. Asserted on COMPUTED style rather than on the class being present — a class with
 * its rule deleted still passes a class check, and "it has a box" is the whole request.
 *
 * The negative half matters as much: it must not look like a control it is not. A box that
 * reads as a dropdown and answers no click is the same lie in the other direction.
 */
test('a one-candidate slot states its model in a box, and the box is not a control', async ({}, testInfo) => {
  const { app, window } = await launchApp(testInfo);

  try {
    await window.waitForTimeout(6000);

    const box = await window.evaluate(async () => {
      const { MpiBaseFlow } = await import('/js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js');
      const { getFlowById } = await import('/js/data/flowsRegistry.js');
      const { state } = await import('/js/state.js');

      // ONLY the SFW arm installed — one candidate, so no choice to offer.
      state.s_installedModelIds = ['krea2'];
      state.currentProject = { name: 'e2e', path: 'e2e', itemGroups: [] };

      const flow = MpiBaseFlow.mount(document.createElement('div'),
        { flow: getFlowById('character-sheet') });
      window.__mpi641 = flow;
      flow.el.open();
      await new Promise(r => setTimeout(r, 400));
      const ticks = document.querySelectorAll('.mpi-base-flow__tick');
      ticks[ticks.length - 1].click();
      await new Promise(r => setTimeout(r, 400));

      const el = document.querySelector('.mpi-base-flow__model-name');
      if (!el) return { missing: true, dropdowns: document.querySelectorAll('.mpi-base-flow__model-pick .mpi-dropdown').length };

      // Compare against a LIVE trigger on this same slide — the Style field is an
      // MpiDropdown — instead of hardcoding values. `--r-1` is `0px` ("sharp: Stage
      // prefers angular over rounded"), so a test asserting "rounded" would have been
      // asserting a taste this app does not hold; measuring the real thing cannot make
      // that mistake, and it follows the trigger if the trigger is ever restyled.
      const trig = document.querySelector('.mpi-base-flow__field-select .mpi-dropdown__trigger');
      const pick = (e) => {
        const c = getComputedStyle(e);
        return {
          background: c.backgroundColor, borderWidth: c.borderTopWidth,
          borderStyle: c.borderTopStyle, radius: c.borderTopLeftRadius,
          padX: c.paddingLeft, padY: c.paddingTop, fontSize: c.fontSize,
          // `line-height` is here as an INGREDIENT because the outcome it decides cannot
          // be measured in this harness. A <button> does not inherit the frame's 1.6
          // line-height, so a span with identical padding and font-size came out 43px
          // against the trigger's 39 — the slot grew 4px the moment a model was
          // uninstalled, and the six paint properties above all matched while it did.
          //
          // The honest assertion would be equal HEIGHT. It cannot live here: this frame
          // is a `main-area` MpiOverlay and the suite sits on Landing, where that host
          // has no size, so every element inside measures 0 and `height === height`
          // becomes `0 === 0`. That vacuous version was written first and passed against
          // the 43px box. Sizing the host by hand did not recover real geometry either.
          // Height was verified live instead (39 = 39, MPI-641 validation.md).
          lineHeight: c.lineHeight,
        };
      };
      return {
        text: el.textContent.trim(),
        tag: el.tagName,
        dropdowns: document.querySelectorAll('.mpi-base-flow__model-pick .mpi-dropdown').length,
        name: pick(el),
        trigger: trig ? pick(trig) : null,
        cursor: getComputedStyle(el).cursor,
        nameBorderColor: getComputedStyle(el).borderTopColor,
        triggerBorderColor: trig ? getComputedStyle(trig).borderTopColor : null,
      };
    });

    expect(box.missing, 'one installed candidate must render the NAME, not a dropdown').toBeFalsy();
    expect(box.dropdowns, 'a one-option dropdown claims a choice that is not there').toBe(0);
    expect(box.text).toBe('Krea 2');
    expect(box.trigger, 'no live trigger to compare against — this test is stale').toBeTruthy();

    // THE BOX MATCHES THE CONTROL IT REPLACES. Installing a second candidate swaps this
    // span for an MpiDropdown in the same spot, so anything that differs here is the
    // layout shifting under the user for no reason they can see.
    expect(box.name.background, 'same surface as the trigger').toBe(box.trigger.background);
    expect(box.name.borderWidth).toBe(box.trigger.borderWidth);
    expect(box.name.borderStyle).toBe(box.trigger.borderStyle);
    expect(box.name.radius).toBe(box.trigger.radius);
    expect(box.name.padX).toBe(box.trigger.padX);
    expect(box.name.padY).toBe(box.trigger.padY);
    expect(box.name.fontSize).toBe(box.trigger.fontSize);
    // The one that decides whether the column MOVES. `normal` is the button default the
    // trigger gets; anything inherited from the frame makes this box taller than the
    // dropdown it replaces. See the note in `pick()` for why this stands in for a height
    // assertion rather than being one.
    expect(box.name.lineHeight, 'an inherited line-height makes the box taller than the '
      + 'dropdown it replaces, and the slot grows when a model is uninstalled')
      .toBe(box.trigger.lineHeight);

    // …and it must NOT pretend to be the control. The border is deliberately one step
    // quieter than a real trigger's, and there is no chevron, no hover and no pointer:
    // a box that reads as a dropdown and answers no click is the same lie in reverse.
    expect(box.nameBorderColor, 'a quieter border is what separates a statement from an offer')
      .not.toBe(box.triggerBorderColor);
    expect(box.tag, 'a button would promise a click that does nothing').toBe('SPAN');
    expect(box.cursor, 'a pointer cursor is a promise').not.toBe('pointer');
  } finally {
    await window.evaluate(() => { window.__mpi641?.el?.destroy?.(); }).catch(() => {});
    await closeApp(app);
  }
});
