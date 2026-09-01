const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

/**
 * MPI-682 — a deps-only flow must be able to free its own weights from the drawer.
 *
 * Until the audio section every flow's weight arrived through a MODEL, and the Model
 * Library already uninstalls models. `minimax-music` declares NO requiredModels, so its
 * 13.4GB is flow-owned and the Model Library never sees it — before this, install-only
 * and permanently.
 *
 * WHY THIS NEEDS A REAL RENDERER. Three things have to line up and each fails silently on
 * its own:
 *   - the button is gated on `available && requiredDeps.length`, so a source assertion
 *     cannot tell "correctly hidden" from "never rendered";
 *   - the POST has to go out under `flowDepKey(id)`. A model id there is accepted by the
 *     server, returns 200, and frees NOTHING — `_flowRequiredDepIds(excludeUninstallId)`
 *     keeps the weights because the uninstall id never matched their owner. That is the
 *     exact silent no-op the card exists to remove, and it looks like success;
 *   - the payload must carry the flow's OWN deps. `getFlowDependencies()` unions a
 *     `requiredPlugins` plugin's deps in for the install payload, so reaching for the
 *     obvious helper over-promises disk the server guard is going to keep anyway.
 *
 * `tests/flow-uninstall-guard.test.cjs` pins the server half. This drives the button.
 *
 * The fetch is stubbed: this asserts what the UI SENDS, and nothing on a CI runner's disk
 * is there to delete. `s_installedModelIds` + the dep-status cache are stubbed the same way
 * `flow-library-skips-drawer.spec.js` does — and for the same CI-only reason (a dev box
 * fills `_flowDepStatusCache` from disk, a bare runner does not).
 *
 * PAGE_LANDING throughout: since MPI-638 a Ready flow clicked from the Gallery skips the
 * drawer entirely, so Landing is where this button is reachable.
 */
test.setTimeout(90000);

test('a deps-only flow offers Uninstall, and sends its OWN deps under the flow key', async ({}, testInfo) => {
  const { app, window } = await launchApp(testInfo);

  try {
    await window.waitForTimeout(6000);

    const result = await window.evaluate(async () => {
      const { MpiFlowLibrary } = await import(
        '/js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js');
      const { Events } = await import('/js/events.js');
      const { state } = await import('/js/state.js');
      const { PAGE_LANDING } = await import('/js/router.js');
      const { getFlowById, setFlowDepStatus, flowModelIds } = await import('/js/data/flowsRegistry.js');

      const DEPS_FLOW = 'minimax-music';   // no requiredModels — its whole footprint is its own
      const MODELS_FLOW = 'outpaint';      // one model, no own deps — the negative case

      const ownDeps = (id) => getFlowById(id).requiredDeps || [];
      const markDeps = (id, present) =>
        setFlowDepStatus(id, new Map(ownDeps(id).map(d => [d, present])));

      // Capture the uninstall POST instead of performing it. Everything else falls
      // through, or the app under test loses its own plumbing mid-spec.
      const sent = [];
      const realFetch = window.fetch.bind(window);
      window.fetch = (url, opts) => {
        if (String(url).includes('/comfy/models/uninstall')) {
          sent.push(JSON.parse(opts.body));
          return Promise.resolve({
            ok: true,
            json: async () => ({ removed: ownDeps(DEPS_FLOW).map(id => ({ id })), keptShared: [] }),
          });
        }
        return realFetch(url, opts);
      };

      const toasts = [];
      const offToast = ['ui:success', 'ui:info', 'ui:warning', 'ui:error']
        .map(e => Events.on(e, p => toasts.push({ e, ...p })));

      const lib = MpiFlowLibrary.mount(document.createElement('div'));
      window.__mpi682lib = lib;
      state.currentPage = PAGE_LANDING;

      // Open the drawer for one flow and report what its footer offers.
      const footerOf = async (flowId, title) => {
        lib.el.open();
        const tile = [...document.querySelectorAll('.mpi-tile')]
          .find(t => t.textContent.includes(title));
        if (!tile) throw new Error(`the ${title} tile is not in the library`);
        tile.click();
        await new Promise(r => setTimeout(r, 250));
        const actions = document.querySelector('#flow-detail-panel .mpi-detail__actions');
        return [...(actions?.querySelectorAll('.mpi-btn') || [])].map(b => b.textContent.trim());
      };

      // (1) Ready + own deps → Open AND Uninstall.
      markDeps(DEPS_FLOW, true);
      state.s_installedModelIds = [];
      const readyButtons = await footerOf(DEPS_FLOW, getFlowById(DEPS_FLOW).title);

      // (2) The dialog names the flow and the disk, then the POST goes out.
      [...document.querySelectorAll('#flow-detail-panel .mpi-btn')]
        .find(b => b.textContent.trim() === 'Uninstall')?.click();
      await new Promise(r => setTimeout(r, 150));
      const dialogText = document.querySelector('.mpi-ok-cancel #text-slot')?.textContent || '';
      [...document.querySelectorAll('.mpi-ok-cancel #actions-slot .mpi-btn')]
        .find(b => b.textContent.trim() === 'Uninstall')?.click();
      await new Promise(r => setTimeout(r, 400));
      lib.el.close();

      // (3) A models-only flow owns nothing to free — Open alone.
      state.s_installedModelIds = flowModelIds(getFlowById(MODELS_FLOW));
      const modelsOnlyButtons = await footerOf(MODELS_FLOW, getFlowById(MODELS_FLOW).title);
      lib.el.close();

      // (4) Not installed → Install, never Uninstall.
      markDeps(DEPS_FLOW, false);
      state.s_installedModelIds = [];
      const notReadyButtons = await footerOf(DEPS_FLOW, getFlowById(DEPS_FLOW).title);
      lib.el.close();

      window.fetch = realFetch;
      offToast.forEach(off => off?.());

      return {
        readyButtons, modelsOnlyButtons, notReadyButtons, dialogText, sent, toasts,
        expectedDeps: ownDeps(DEPS_FLOW),
        title: getFlowById(DEPS_FLOW).title,
      };
    });

    expect(result.readyButtons, 'a Ready deps-only flow must offer both Open and Uninstall')
      .toEqual(['Open', 'Uninstall']);
    expect(result.modelsOnlyButtons, 'a models-only flow owns nothing to free — its weights come off in the Model Library')
      .toEqual(['Open']);
    expect(result.notReadyButtons, 'an uninstalled flow must not offer to uninstall')
      .toEqual(['Install models']);

    expect(result.dialogText, 'the dialog must name the flow').toContain(result.title);
    expect(result.dialogText, 'and the disk it frees').toContain('13.4GB');
    expect(result.dialogText, 'and warn that a sibling flow keeps what it shares')
      .toContain('Files shared with another installed flow will be kept.');

    expect(result.sent.length, 'exactly one uninstall must go out').toBe(1);
    // The key IS the fix. A model id here returns 200 and frees nothing.
    expect(result.sent[0].modelId, 'the flow key is what releases the server guard')
      .toBe('flow:minimax-music');
    expect(result.sent[0].dependencies.map(d => d.id), 'its OWN deps, not the install-payload union')
      .toEqual(result.expectedDeps);

    const said = result.toasts.map(t => t.message).join(' | ');
    expect(said, 'the Flow Library must report the result itself — nothing else does')
      .toContain(`${result.title} uninstalled`);
  } finally {
    await window.evaluate(() => { window.__mpi682lib?.el?.destroy?.(); }).catch(() => {});
    await closeApp(app);
  }
});
