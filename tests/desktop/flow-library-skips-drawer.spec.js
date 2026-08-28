const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

/**
 * MPI-638 — clicking an INSTALLED flow opens its frame. The detail drawer is for a flow
 * that is not ready yet.
 *
 * Fabio, 2026-08-28: "when a flow is installed and the user clicks it, the slide over shows
 * up for the user to press open. The first thing that the user sees is an explanation of
 * how the flow works and what it does, so the slide over is an unnecessary step."
 *
 * He is describing a literal duplicate: `MpiBaseFlow`'s step 0 already paints the title,
 * the hero clip and the description in its right column. For a Ready flow the drawer's only
 * unique content is install machinery that flow has no use for — so it became a toll booth
 * between the user and the thing they clicked.
 *
 * WHY THIS NEEDS A REAL RENDERER. The branch reads `flowAvailability(flow)` and
 * `state.currentPage` and then either emits or paints — three modules, and the failure
 * modes are both SILENT:
 *   - too eager: an uninstalled flow emits `flow:open`, the frame mounts, and Generate dies
 *     on a toast with no Install button anywhere on screen;
 *   - too shy: a Ready flow still opens the drawer and nothing about the app looks broken,
 *     it just never got better.
 * A source assertion cannot tell those apart, and `flow-model-choice.test.cjs` only pins the
 * shape of the condition. This drives the tile.
 *
 * `s_installedModelIds` is stubbed rather than downloading weights, the same move
 * `flow-reuse-opens-without-model.spec.js` makes. `head-swap` is the fixture because it
 * needs exactly one model (`qwen-edit`) and declares no choosable slot, so availability is
 * the ONLY variable this spec moves.
 */
test.setTimeout(90000);

test('a Ready flow tile opens the frame; an unready one still opens the drawer', async ({}, testInfo) => {
  const { app, window } = await launchApp(testInfo);

  try {
    await window.waitForTimeout(6000);

    const result = await window.evaluate(async () => {
      const { MpiFlowLibrary } = await import(
        '/js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js');
      const { Events } = await import('/js/events.js');
      const { state } = await import('/js/state.js');
      const { PAGE_GALLERY, PAGE_LANDING } = await import('/js/router.js');

      const lib = MpiFlowLibrary.mount(document.createElement('div'));
      window.__mpi638lib = lib;

      // One press of the Head Swap tile, under a stated installed-set and page.
      const press = async (installed, page) => {
        state.s_installedModelIds = installed;
        state.currentPage = page;
        const opened = [];
        const off = Events.on('flow:open', p => opened.push(p.flowId));
        lib.el.open();
        const tile = [...document.querySelectorAll('.mpi-tile')]
          .find(t => t.textContent.includes('Head Swap'));
        if (!tile) throw new Error('the Head Swap tile is not in the library');
        tile.click();
        await new Promise(r => setTimeout(r, 250));
        off?.();
        // `is-open` is the drawer's own class, toggled by openDetail / _closeDetail.
        const drawer = !!document.querySelector('#flow-detail-panel.is-open');
        lib.el.close();
        return { opened, drawer };
      };

      return {
        ready: await press(['qwen-edit'], PAGE_GALLERY),
        notInstalled: await press([], PAGE_GALLERY),
        // Available, but a flow lands as a card in the CURRENT project — from Landing
        // there is none, so `flow:open` would go nowhere and the drawer's disabled Open
        // plus its toast stay the honest answer.
        onLanding: await press(['qwen-edit'], PAGE_LANDING),
      };
    });

    expect(result.ready.opened, 'a Ready flow must open its frame directly').toEqual(['head-swap']);
    expect(result.ready.drawer, 'and must NOT stop at the drawer on the way').toBe(false);

    expect(result.notInstalled.opened, 'an unready flow must not mount a frame it cannot run').toEqual([]);
    expect(result.notInstalled.drawer, 'it needs the drawer — Install lives there').toBe(true);

    expect(result.onLanding.opened, 'flow:open from Landing would land nowhere').toEqual([]);
    expect(result.onLanding.drawer, 'so the drawer answers instead').toBe(true);
  } finally {
    await window.evaluate(() => { window.__mpi638lib?.el?.destroy?.(); }).catch(() => {});
    await closeApp(app);
  }
});
