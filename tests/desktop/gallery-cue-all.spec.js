// MPI-733 — Cue all: select N gallery cards, right-click, one queued job per card.
//
// Mounted through MpiGalleryBlock, NEVER the grid alone. The first cut read the op
// from `s_selectedOpByModel`, and every probe that mounted the grid standalone
// HANDED it the op — so it passed green while the op SOURCE was wrong both ways in
// Fabio's app. Here the op comes from the real PromptBox, moved by the real gesture
// (a staged image chip auto-picks i2i programmatically), and the remembered op is
// poisoned to the OPPOSITE value before each read, so a regression to the memory
// read inverts the assertions.
//
// No GPU: `_dispatchNextCue` promotes a pending job only while
// `generationStore.getSnapshot()` reports its lane idle. Reporting both lanes busy
// holds every enqueued job in the Cue queue, where `peekCueQueue()` reads the exact
// config it would have dispatched.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

// Electron boot (splash -> local server -> shell) runs past the 30s default.
test.setTimeout(90000);

// Real shipped stills, one per card, so each job's swept slot is distinguishable. A
// src that 404s takes the missing-media path and can drop the card (MPI-631/633).
const STILLS = [
  '/comfy_workflows/display/boogu-edit-balanced.webp',
  '/comfy_workflows/display/boogu-edit-high.webp',
  '/comfy_workflows/display/chroma-flash-01.webp',
];
// The chip staged in the PromptBox — deliberately none of the cards' stills. i2i has
// ONE image slot, so every job must carry its card IN that slot, never this chip.
const STAGED = '/comfy_workflows/display/chroma-hyper-01.webp';
// A plain flat model: no op groups, engine deps or variants, so `installed` alone
// makes it usable (`isModelUsable`) and every supportedOp installed.
const MODEL_ID = 'sdxl-realistic';

/** Three images and a video, so the label has to FILTER, not count the selection. */
function fixtureGroups() {
  const group = (id, type, still) => ({
    id, type, name: id, selectedIndex: 0,
    history: [{ id: `${id}-item`, type, filePath: still, thumbPath: still, pixelDimensions: { w: 1024, h: 1024 } }],
  });
  return [
    group('cue-img-1', 'image', STILLS[0]),
    group('cue-img-2', 'image', STILLS[1]),
    group('cue-vid-1', 'video', STILLS[0]),
    group('cue-img-3', 'image', STILLS[2]),
  ];
}
// Click order. The video sits mid-selection so the queue order proves it was skipped
// in place rather than shuffling the images around it.
const SELECTION = ['cue-img-1', 'cue-img-2', 'cue-vid-1', 'cue-img-3'];

/** The op the PromptBox would Run with right now. */
function liveOp(window) {
  return window.evaluate(() => document.querySelector('.mpi-prompt-box').getRunPayload().operation);
}

/** Poison the remembered op, so reading it instead of the live op flips the result. */
async function rememberOp(window, op) {
  await window.evaluate(async ({ modelId, op }) => {
    const { state } = await import('/js/state.js');
    state.s_selectedOpByModel = { [modelId]: op };
  }, { modelId: MODEL_ID, op });
}

/** Ctrl-click every id (a toggle), in order. */
async function ctrlClick(window, ids) {
  await window.evaluate(async (groupIds) => {
    for (const id of groupIds) {
      document.querySelector(`.mpi-gallery-grid__row-wrap[data-group-id="${id}"] .mpi-group-card`)
        .dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    }
    await new Promise(r => setTimeout(r, 150));
  }, ids);
}

/** Right-click the first selected card; returns the cue-all row, the menu left OPEN. */
async function openCueEntry(window) {
  return window.evaluate(async (firstId) => {
    document.querySelector(`.mpi-gallery-grid__row-wrap[data-group-id="${firstId}"] .mpi-group-card`)
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 60 }));
    await new Promise(r => setTimeout(r, 200));
    const item = document.querySelector('.mpi-ctx-menu__item[data-key="cue-all"]');
    return {
      label: item?.textContent?.trim() ?? null,
      disabled: !!item?.disabled,
      info: item?.dataset?.info ?? null,
      // A right-click OUTSIDE the selection acts on that card alone — this count is
      // what stops that silent fallback from reading as a pass.
      selected: document.querySelectorAll('.mpi-group-card--selected').length,
    };
  }, SELECTION[0]);
}

test('Cue all follows the LIVE prompt-box op and queues one job per card, each sweeping its own image', async ({}, testInfo) => {
  const { app, window, pageErrors } = await launchApp(testInfo);

  try {
    // An isolated user data dir has no engine; leave the install boot gate.
    await window.evaluate(async () => {
      const { Events } = await import('/js/events.js');
      Events.emit('engine:install-skipped');
      await new Promise(r => setTimeout(r, 300));
    });

    const folderPath = testInfo.outputPath('project');
    fs.mkdirSync(folderPath, { recursive: true });
    const project = { id: 'e2e-cue-all', name: 'E2E Cue all', modelSettings: {}, itemGroups: fixtureGroups() };
    fs.writeFileSync(path.join(folderPath, 'project.json'), JSON.stringify(project, null, 2));

    await window.evaluate(async ({ p, modelId }) => {
      const [{ state }, { Events }, { MODELS }, { navigate, PAGE_GALLERY }] = await Promise.all([
        import('/js/state.js'),
        import('/js/events.js'),
        import('/js/data/modelRegistry.js'),
        import('/js/router.js'),
      ]);
      // A bare runner has no weights, and the boot model sync re-writes `installed`
      // from disk on every `models:checked`. Re-stub from a listener registered AFTER
      // the app's, so the refresh is overwritten inside its own emit
      // (docs/testing-desktop-specs.md, trap 5).
      const model = MODELS.find(m => m.id === modelId);
      const stub = () => {
        model.installed = true;
        const ids = state.s_installedModelIds || [];
        if (!ids.includes(modelId)) state.s_installedModelIds = [...ids, modelId];
      };
      stub();
      Events.on('models:checked', stub);
      state.s_selectedModelIdByType = { image: modelId, video: null };
      state.s_lastSelectedMediaType = 'image';
      state.currentProject = p;
      navigate(PAGE_GALLERY);
      await new Promise(r => setTimeout(r, 1000));
    }, { p: { ...project, folderPath: folderPath.replace(/\\/g, '/') }, modelId: MODEL_ID });

    await expect(window.locator('.mpi-gallery-grid__row-wrap')).toHaveCount(4, { timeout: 10000 });
    await expect(window.locator('.mpi-prompt-box')).toHaveCount(1);

    // ── 1. Empty box: the live op is text-only, the memory says i2i ──────────
    expect(await liveOp(window)).toBe('t2i');
    await rememberOp(window, 'i2i');
    await ctrlClick(window, SELECTION);
    expect(await openCueEntry(window)).toEqual({
      label: 'Cue all',
      disabled: true,
      info: 'Cue all does not support the current operation',
      selected: 4,
    });
    await window.evaluate(() => document.body.click());
    await ctrlClick(window, SELECTION); // toggle back off -> selection mode exits

    // ── 2. Stage an image the way a card drag does: the box picks i2i itself ──
    await window.evaluate(async (still) => {
      const dt = new DataTransfer();
      dt.setData('application/mpi-media', JSON.stringify({ filePath: still, type: 'image', name: 'staged' }));
      document.querySelector('.mpi-prompt-box')
        .dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 300));
    }, STAGED);
    expect(await liveOp(window)).toBe('i2i');
    await rememberOp(window, 't2i');

    // Hold both lanes busy BEFORE the click, so the jobs stay pending.
    await window.evaluate(async () => {
      const { generationStore } = await import('/js/services/generationStore.js');
      const real = generationStore.getSnapshot;
      generationStore.getSnapshot = () => {
        const snap = real();
        return { ...snap, running: [...snap.running, { lane: 'local' }, { lane: 'remote' }] };
      };
    });

    await ctrlClick(window, SELECTION);
    expect(await openCueEntry(window)).toEqual({
      label: 'Cue all (3)',
      disabled: false,
      info: 'Queue one job per selected card on the current settings',
      selected: 4,
    });

    // ── 3. One click -> three queued jobs ────────────────────────────────────
    const jobs = await window.evaluate(async () => {
      document.querySelector('.mpi-ctx-menu__item[data-key="cue-all"]').click();
      await new Promise(r => setTimeout(r, 300));
      const { peekCueQueue, clearCueQueue } = await import('/js/services/generationService.js');
      const queued = peekCueQueue().map(job => ({
        operation: job.config.operation,
        urls: job.config.mediaItems.map(m => m.url),
      }));
      clearCueQueue();
      return queued;
    });

    // Every job runs the recipe's op, and carries exactly its own card in the one
    // image slot — the staged chip was substituted, not appended.
    expect(jobs.map(j => j.operation)).toEqual(['i2i', 'i2i', 'i2i']);
    for (const job of jobs) {
      expect(job.urls).toHaveLength(1);
      expect(job.urls).not.toContain(STAGED);
    }
    // The swept slot differs per job, in click order, video skipped in place.
    expect(jobs.map(j => j.urls[0])).toEqual(STILLS);

    expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  } finally {
    await closeApp(app);
  }
});
