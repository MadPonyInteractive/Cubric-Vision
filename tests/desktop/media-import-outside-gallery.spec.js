// MPI-723 — an import made outside the Gallery has to become a card.
//
// `media:imported`'s only listener used to live inside MpiGalleryBlock. Navigation
// destroys the outgoing Block before mounting the next, so exactly one Block is ever
// mounted: a drop on the history workspace's PromptBox wrote the file and its sidecar
// to disk and built no ItemGroup at all. Nothing on screen said so.
//
// Two halves, and the second is the one a well-meaning fix breaks: the card appears
// AND the view does not move. Fabio, 2026-09-11: "I stay on the same image history
// card. Otherwise it's going to send me to a different place where I don't want to
// be working." Anything that navigates, selects or opens the new card fails here.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

// Electron boot (splash -> local server -> shell) runs past the 30s default.
test.setTimeout(90000);

// A real shipped still. A src that 404s takes the missing-media path, which can
// remove the entry again and make a passing fix read as broken (MPI-631/633).
const STILL = '/comfy_workflows/display/flow-head-swap.webp';


/** Group ids the grid is currently rendering, in render order. */
function renderedIds(window) {
  return window.evaluate(() =>
    [...document.querySelectorAll('.mpi-gallery-grid__row-wrap')].map(el => el.dataset.groupId));
}

/** Leave the engine-install boot gate — an isolated user data dir has no engine. */
async function releaseBootGate(window) {
  await window.evaluate(async () => {
    const { Events } = await import('/js/events.js');
    Events.emit('engine:install-skipped');
    await new Promise(r => setTimeout(r, 300));
  });
}

test('an import from the history workspace becomes a card, and does not move the view', async ({}, testInfo) => {
  const { app, window, pageErrors } = await launchApp(testInfo);

  try {
    await releaseBootGate(window);

    const folderPath = testInfo.outputPath('project');
    fs.mkdirSync(folderPath, { recursive: true });
    const project = {
      id: 'e2e-import',
      name: 'E2E Import',
      modelSettings: {},
      itemGroups: [
        { id: 'grp1', name: 'Group 1', type: 'image', history: [], selectedIndex: 0 },
      ],
    };
    fs.writeFileSync(path.join(folderPath, 'project.json'), JSON.stringify(project, null, 2));

    // Sit where the bug lived: inside a group's history, NOT the gallery.
    await window.evaluate(async (p) => {
      const [{ state }, { navigate, PAGE_GROUP_HISTORY }] = await Promise.all([
        import('/js/state.js'),
        import('/js/router.js'),
      ]);
      state.currentProject = p;
      navigate(PAGE_GROUP_HISTORY, { groupId: 'grp1' });
      await new Promise(r => setTimeout(r, 500));
    }, { ...project, folderPath: folderPath.replace(/\\/g, '/') });

    await expect(window.locator('#tool-container')).not.toBeEmpty({ timeout: 10000 });

    // The event every ingest surface ends on — PromptBox drop, the picker's upload
    // card, the recorder. Emitted directly so the assertion is about the LISTENER,
    // not about whether a synthesised OS drag lands on the right element.
    const after = await window.evaluate(async (still) => {
      const [{ Events }, { state }] = await Promise.all([
        import('/js/events.js'),
        import('/js/state.js'),
      ]);
      Events.emit('media:imported', {
        url: still,
        filename: 'imported_001.webp',
        itemId: 'e2e-import-1',
        thumbPath: still,
        mediaType: 'image',
        pixelDimensions: { w: 1920, h: 1080 },
      });
      // addGroup persists before it emits, so this waits on a real round trip.
      await new Promise(r => setTimeout(r, 2000));
      return {
        page: state.currentPage,
        groupId: state.currentParams?.groupId,
        ids: (state.currentProject?.itemGroups || []).map(g => g.id),
      };
    }, STILL);

    expect(after.ids).toHaveLength(2);
    expect(after.ids).toContain('grp1');

    // The half that a fix which "helpfully" reveals the new card would break.
    expect(after.page).toBe('group-history');
    expect(after.groupId).toBe('grp1');

    // Built in memory is not built: the group has to survive a reload.
    const onDisk = JSON.parse(fs.readFileSync(path.join(folderPath, 'project.json'), 'utf8'));
    expect(onDisk.itemGroups).toHaveLength(2);

    expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  } finally {
    await closeApp(app);
  }
});

test('importing from the Gallery still paints exactly one card, placeholder swapped', async ({}, testInfo) => {
  const { app, window, pageErrors } = await launchApp(testInfo);

  try {
    await releaseBootGate(window);

    const folderPath = testInfo.outputPath('project');
    fs.mkdirSync(folderPath, { recursive: true });
    const project = { id: 'e2e-import-gal', name: 'E2E Import Gallery', modelSettings: {}, itemGroups: [] };
    fs.writeFileSync(path.join(folderPath, 'project.json'), JSON.stringify(project, null, 2));

    await window.evaluate(async (p) => {
      const [{ state }, { navigate, PAGE_GALLERY }] = await Promise.all([
        import('/js/state.js'),
        import('/js/router.js'),
      ]);
      state.currentProject = p;
      navigate(PAGE_GALLERY);
      await new Promise(r => setTimeout(r, 800));
    }, { ...project, folderPath: folderPath.replace(/\\/g, '/') });

    await expect(window.locator('#tool-container')).not.toBeEmpty({ timeout: 10000 });

    // The spinner placeholder (MPI-671) is still the gallery block's own job.
    await window.evaluate(async () => {
      const { Events } = await import('/js/events.js');
      Events.emit('media:import-started', { tempId: 'tmp-1', filename: 'imported_001.webp', mediaType: 'image' });
      await new Promise(r => setTimeout(r, 400));
    });
    // The placeholder card IS the tempId — the spinner div is in every card's
    // markup, so asserting on it would pass against any card at all.
    expect(await renderedIds(window)).toEqual(['tmp-1']);

    // Settled then imported, in the order uploadMediaFile and its callers emit them.
    await window.evaluate(async (still) => {
      const { Events } = await import('/js/events.js');
      Events.emit('media:import-settled', { tempId: 'tmp-1' });
      Events.emit('media:imported', {
        url: still,
        filename: 'imported_001.webp',
        itemId: 'e2e-gal-1',
        thumbPath: still,
        mediaType: 'image',
        pixelDimensions: { w: 1920, h: 1080 },
      });
      await new Promise(r => setTimeout(r, 2000));
    }, STILL);

    // One card, not two, and it is the REAL group rather than a stuck placeholder:
    // the block repaints from project:group-added only, so the old optimistic
    // prepend cannot double up with it, and the tempId card is gone.
    const groupIds = await window.evaluate(async () => {
      const { state } = await import('/js/state.js');
      return (state.currentProject?.itemGroups || []).map(g => g.id);
    });
    expect(groupIds).toHaveLength(1);
    expect(await renderedIds(window)).toEqual(groupIds);

    expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  } finally {
    await closeApp(app);
  }
});
