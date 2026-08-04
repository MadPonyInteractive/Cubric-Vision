// MPI-443: Model Settings — the surface that shipped broken in 1.3.0.
//
// Two different root causes have made this same overlay unusable:
//   MPI-356  the overlay mounted into #tool-container, a stacking context, so it
//            painted UNDER the body-mounted picker that opened it — and its own
//            open-time rescan re-entered open() exponentially (~13k console errors).
//   8184709b the LoRA tree pickers and the upscale dropdown portalled to body at
//            MOUNT; open() builds them BEFORE overlay.show(), so the overlay's
//            stash pass swept every popup into hidden DOM.
//
// Both read to the user as "clicking does nothing", so this spec asserts the
// popups are genuinely on screen and on top, and that open() runs exactly once.
//
// It deliberately stops short of picking an option: a selection auto-saves through
// projectService to the project on disk, which is a different subsystem with its
// own tests. elementFromPoint at each popup's centre already proves the rows are
// the topmost hit target, which is the part 1.3.0 got wrong.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

const MODEL_ID = 'sdxl-realistic';

test('Model Settings opens with its LoRA and upscale popups usable', async ({}, testInfo) => {
  test.setTimeout(90000);
  const { app, window, consoleErrors, pageErrors } = await launchApp(testInfo);

  // A real project folder, not a made-up path: opening settings for a model the
  // project has no entry for legitimately writes its defaults through
  // /update-project-settings, and a folder that does not exist turns that into a
  // 500 the spec would then have to explain away.
  const folderPath = testInfo.outputPath('project');
  fs.mkdirSync(folderPath, { recursive: true });
  fs.writeFileSync(
    path.join(folderPath, 'project.json'),
    JSON.stringify({ id: 'e2e-model-settings', name: 'E2E Model Settings', itemGroups: [], modelSettings: {} }, null, 2),
  );

  try {
    const result = await window.evaluate(async ({ modelId, folderPath }) => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));

      const [{ Events }, { state }, { DEPS }, { getModelById }, { MpiModelSettings }] = await Promise.all([
        import('/js/events.js'),
        import('/js/state.js'),
        import('/js/data/modelConstants/dependencies.js'),
        import('/js/data/modelRegistry.js'),
        import('/js/components/Compounds/MpiModelSettings/MpiModelSettings.js'),
      ]);

      Events.emit('engine:install-skipped');
      await sleep(300);

      // Asset lists come from the engine's model folders, which an isolated E2E
      // user-data dir does not have. Serve the files this model would really
      // resolve to (its own default upscaler + the engine-bundled SIAX) so the
      // popups have the option rows they have in production — an empty list would
      // render a zero-height popup and fake a failure.
      const base = (p) => String(p || '').split('/').pop();
      const model = getModelById(modelId);
      const upscaleFiles = [...new Set([
        base(DEPS[model?.defaultUpscale]?.filename),
        base(DEPS['4x-NMKD-Siax']?.filename),
      ].filter(Boolean))];
      if (!upscaleFiles.length) upscaleFiles.push('4x-NMKD-Siax_200k.pth');
      const loraFiles = ['ProbeFolder/probe_lora.safetensors'];

      const realFetch = window.fetch;
      const json = (body) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
      window.fetch = (url, ...rest) => {
        const u = new URL(String(url), location.origin);
        if (u.pathname === '/comfy/list-files') {
          const sub = u.searchParams.get('subDir');
          if (sub === 'loras') return Promise.resolve(json({ success: true, files: loraFiles }));
          if (sub === 'upscale_models') return Promise.resolve(json({ success: true, files: upscaleFiles }));
        }
        // No drop zones: MpiFolderDrop targets real engine folders that do not
        // exist here, and drag-import is not this spec's subject.
        if (u.pathname === '/comfy/model-folders') return Promise.resolve(json({ success: true, folders: [] }));
        return realFetch(url, ...rest);
      };

      state.currentProject = {
        id: 'e2e-model-settings', name: 'E2E Model Settings', folderPath,
        itemGroups: [], modelSettings: {},
      };

      const settings = MpiModelSettings.mount(document.createElement('div'));

      // The MPI-356 loop ran through el.open itself (its state:changed subscription
      // calls el.open(_context)), so counting calls on this property is what a
      // re-entry would have to go through.
      let openCalls = 0;
      const realOpen = settings.el.open;
      settings.el.open = (ctx) => { openCalls++; return realOpen(ctx); };

      await settings.el.open({ modelId });
      await sleep(200);

      const measure = (node, rootEl) => {
        if (!node) return { found: false, rootIsOpen: !!rootEl?.classList.contains('is-open') };
        const r = node.getBoundingClientRect();
        const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
        return {
          found: true,
          rootIsOpen: !!rootEl?.classList.contains('is-open'),
          bodyChild: node.parentNode === document.body,
          stashed: !!node.closest('.mpi-overlay-stash'),
          hasSize: r.width > 0 && r.height > 0,
          onTop: !!hit && (node === hit || node.contains(hit)),
          dims: [Math.round(r.width), Math.round(r.height)],
        };
      };

      // ── the overlay itself (MPI-356's stacking-context half) ──────────────
      const overlayEl = document.querySelector('.mpi-overlay--body');
      const overlayRect = overlayEl?.getBoundingClientRect();
      const overlay = {
        found: !!overlayEl,
        bodyChild: overlayEl?.parentNode === document.body,
        hasSize: !!overlayRect && overlayRect.width > 0 && overlayRect.height > 0,
        holdsSettings: !!overlayEl?.querySelector('.mpi-model-settings'),
      };

      // ── LoRA slot 1: the tree picker ──────────────────────────────────────
      const loraRoot = document.querySelector('.mpi-model-settings__lora-list .mpi-model-settings__lora-slot .mpi-tree-picker');
      loraRoot?.querySelector('.mpi-tree-picker__trigger')?.click();
      await sleep(150);
      const loraBox = document.querySelector('.mpi-tree-picker__box.is-open');
      const loraPicker = measure(loraBox, loraRoot);
      loraPicker.rowCount = loraBox ? loraBox.querySelectorAll('.mpi-tree-picker__row').length : 0;

      loraRoot?.querySelector('.mpi-tree-picker__trigger')?.click();   // close before the next
      await sleep(80);

      // ── the upscale dropdown ──────────────────────────────────────────────
      const upRoot = document.querySelector('.mpi-model-settings__upscale-slot .mpi-dropdown');
      upRoot?.querySelector('.mpi-dropdown__trigger')?.click();
      await sleep(150);
      const upList = document.querySelector('.mpi-dropdown__list.is-open');
      const upscale = measure(upList, upRoot);
      upscale.rowCount = upList ? upList.querySelectorAll('.mpi-dropdown__option').length : 0;

      const openCallsAfterFirstOpen = openCalls;

      // ── arm the MPI-356 loop ──────────────────────────────────────────────
      // The re-entry can only happen while the overlay is ALREADY open: the
      // live-rerender subscription is gated on _isOpen, which open() sets last.
      // So opening once proves nothing about it — the asset lists have to change
      // UNDER an open overlay, which is what a drag-import or a folder edit does.
      // One rebuild is the contract; the rescan that rebuild performs must not
      // feed the same subscription again.
      state.availableLoras = ['ProbeFolder/second_lora.safetensors'];
      await sleep(1200);

      settings.el.destroy?.();
      window.fetch = realFetch;

      return {
        overlay, loraPicker, upscale, openCallsAfterFirstOpen,
        openCallsAfterAssetChange: openCalls,
        loraSlots: document.querySelectorAll('.mpi-model-settings__lora-slot').length,
      };
    }, { modelId: MODEL_ID, folderPath });

    expect(result.overlay.found, 'settings overlay not in the DOM').toBe(true);
    expect(result.overlay.bodyChild, 'settings overlay is not a body child (MPI-356 mounted it in #tool-container)').toBe(true);
    expect(result.overlay.hasSize, 'settings overlay has a zero-size rect').toBe(true);
    expect(result.overlay.holdsSettings, 'settings overlay does not contain .mpi-model-settings').toBe(true);

    for (const name of ['loraPicker', 'upscale']) {
      const m = result[name];
      expect(m.rootIsOpen, `${name}: trigger click did not register`).toBe(true);
      expect(m.found, `${name}: popup node not in the document at all`).toBe(true);
      expect(m.stashed, `${name}: popup was swept into the overlay stash (the 1.3.0 bug)`).toBe(false);
      expect(m.bodyChild, `${name}: popup is not a direct body child`).toBe(true);
      expect(m.hasSize, `${name}: popup has a zero-size rect (${m.dims})`).toBe(true);
      expect(m.onTop, `${name}: popup is not the topmost element at its own centre`).toBe(true);
      expect(m.rowCount, `${name}: popup rendered no selectable rows`).toBeGreaterThan(0);
    }

    // MPI-356: open() feeding its own state:changed listener, two events per pass.
    // Exactly one live re-render for the asset change, and the rescan that
    // re-render does must not come back round as another one.
    expect(result.openCallsAfterFirstOpen, 'open() re-entered during the initial open').toBe(1);
    expect(result.openCallsAfterAssetChange,
      'open() re-entered — the open-time rescan is feeding its own state:changed listener again (MPI-356)').toBe(2);
    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toHaveLength(0);
    expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  } finally {
    await closeApp(app);
  }
});
