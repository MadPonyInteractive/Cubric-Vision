// MPI-693 — the media picker lists CARDS, not files.
//
// The picker used to push every entry of every group's `history`, so a card with
// 14 takes was 14 tiles captioned with raw filenames, sitting beside a gallery
// that showed one card under the name the user gave it. What these tests pin:
//
//  - one tile per ItemGroup, never one per take;
//  - the caption is the GALLERY's label — asserted against the text
//    `MpiGalleryGrid` renders for the same groups, not against a hard-coded
//    string, so the two cannot quietly drift apart later;
//  - the type filter reads `group.type`. A group may hold mixed types, so
//    filtering on the selected item's type instead would drop a card out of the
//    very tab the gallery lists it under — the fixture has exactly that card;
//  - an audio tile plays on hover and stops on leave.
const path = require('path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

// Electron boot (splash -> local server -> shell) runs past the 30s default.
test.setTimeout(90000);

const REPO = path.resolve(__dirname, '..', '..').replace(/\\/g, '/');
// Real shipped media, addressed the way a project item is: an absolute path that
// `resolveMediaUrl` wraps into `/project-file?path=…`. A src that 404s leaves the
// <audio> unplayable and a working fix reads as broken.
const STILL = `${REPO}/comfy_workflows/display/flow-head-swap.webp`;
// A shipped voice sample (11.1s), NOT `assets/sounds/notify.wav` — that one is
// 319ms, so it had already ENDED inside the settle after mouseenter and read as
// "hover did not play", while the leave assertion (`currentTime === 0`) passed on
// the `ended` reset whether or not mouseleave did anything. A clip long enough to
// still be playing is what makes both halves mean something; the duration is
// asserted below so a future swap cannot quietly reintroduce that.
const SOUND = `${REPO}/voices/child_1.opus`;

function item(id, type, filePath, over = {}) {
  return {
    id, type, filePath,
    thumbPath: type === 'image' ? filePath : undefined,
    pixelDimensions: { w: 1920, h: 1080 },
    name: null,
    ...over,
  };
}

/**
 * Six cards covering every branch of `_collect` and `_cardLabel`.
 *
 * `pick-named` carries three takes — the whole point of the card is that it is
 * ONE tile. `pick-mixed` is a video group whose selected take is an image, which
 * is the case that separates a `group.type` filter from an item-type one.
 */
function fixtureGroups() {
  return [
    {
      id: 'pick-named', type: 'image', name: 'named_file_stem', customName: 'Hero shot',
      createdAt: '2026-09-01T10:00:00Z', selectedIndex: 1, archived: false,
      history: [
        item('pick-named-0', 'image', STILL),
        item('pick-named-1', 'image', STILL),
        item('pick-named-2', 'image', STILL),
      ],
    },
    {
      // Two takes with the SELECTED one second, so a regression that reads
      // `history[0]` instead of `history[selectedIndex]` surfaces as the caption
      // 'wrong_take' rather than passing silently on identical entries.
      id: 'pick-derived', type: 'image', name: 'derived_file_stem', customName: null,
      createdAt: '2026-09-01T09:00:00Z', selectedIndex: 1, archived: false,
      history: [
        item('pick-derived-0', 'image', STILL, { name: 'wrong_take' }),
        item('pick-derived-1', 'image', STILL),
      ],
    },
    {
      // 'Untitled Group' is createItemGroup's default and names nothing; the file
      // does, so the caption falls through to the basename.
      id: 'pick-untitled', type: 'image', name: 'Untitled Group', customName: null,
      createdAt: '2026-09-01T08:00:00Z', selectedIndex: 0, archived: false,
      history: [item('pick-untitled-0', 'image', `${REPO}/comfy_workflows/display/flow-head-swap.webp`)],
    },
    {
      id: 'pick-archived', type: 'image', name: 'archived_stem', customName: null,
      createdAt: '2026-09-01T07:00:00Z', selectedIndex: 0, archived: true,
      history: [item('pick-archived-0', 'image', STILL)],
    },
    {
      // A pending/failed generation: a card with no file. Handing it to a Flow slot
      // would resolve to a broken URL, so it must not render.
      id: 'pick-nofile', type: 'image', name: 'nofile_stem', customName: null,
      createdAt: '2026-09-01T06:00:00Z', selectedIndex: 0, archived: false,
      history: [{ id: 'pick-nofile-0', type: 'image', filePath: null }],
    },
    {
      id: 'pick-mixed', type: 'video', name: 'mixed_stem', customName: 'Clip with a still selected',
      createdAt: '2026-09-01T05:00:00Z', selectedIndex: 0, archived: false,
      history: [item('pick-mixed-0', 'image', STILL)],
    },
  ];
}

/** Put the fixture where `_collect` reads it, and open a picker over it. */
async function openPicker(window, groups, mediaType) {
  await window.evaluate(async ({ gs, type }) => {
    const [{ MpiMediaPicker }, { state }] = await Promise.all([
      import('/js/components/Compounds/MpiMediaPicker/MpiMediaPicker.js'),
      import('/js/state.js'),
    ]);
    window.__pick?.el?.destroy?.();
    state.currentProject = { id: 'e2e-pick', name: 'E2E Pick', itemGroups: gs, modelSettings: {} };
    const picker = MpiMediaPicker.mount(document.createElement('div'), { mediaType: type });
    picker.el.show();
    window.__pick = picker;
    await new Promise(r => setTimeout(r, 250));
  }, { gs: groups, type: mediaType });
}

/** Tile captions currently rendered, in render order. */
function captions(window) {
  return window.evaluate(() =>
    [...document.querySelectorAll('.mpi-media-picker__name')].map(el => el.textContent));
}

/** Click one of the four filter tabs by its label. Driven in-page, not by locator. */
async function setFilter(window, label) {
  await window.evaluate(async (want) => {
    const tab = [...document.querySelectorAll('.mpi-media-picker__filter')]
      .find(b => b.textContent.trim() === want);
    tab.click();
    await new Promise(r => setTimeout(r, 200));
  }, label);
}

test('one tile per card, captioned exactly as the gallery captions it', async ({}, testInfo) => {
  const { app, window } = await launchApp(testInfo);

  try {
    await window.waitForTimeout(6000); // shell boot settles
    await openPicker(window, fixtureGroups(), 'image');
    await setFilter(window, 'All media');

    const shown = await captions(window);

    // Four of the six render: the archived card and the file-less card are both out.
    expect(shown).toHaveLength(4);
    expect(shown).toContain('Hero shot');            // customName wins
    expect(shown).toContain('derived_file_stem');    // group.name === the file stem
    expect(shown).toContain('flow-head-swap');       // 'Untitled Group' -> basename, no ext
    expect(shown).not.toContain('archived_stem');
    expect(shown).not.toContain('nofile_stem');
    // The SELECTED take, not the first one.
    expect(shown).not.toContain('wrong_take');

    // Three takes, one tile. This is the whole card, so assert the count directly
    // rather than inferring it from the total above.
    expect(shown.filter(c => c === 'Hero shot')).toHaveLength(1);

    // The captions are the gallery's, not a second naming rule that happens to
    // agree today. Mount the real grid on the same groups and compare the sets.
    //
    // `pick-untitled` is held out of the comparison because it is the ONE place the
    // two deliberately differ: the gallery renders the literal 'Untitled Group',
    // and the picker falls through to the filename, because the ask was "the title
    // the user added, else the file name" and that default is not a title anyone
    // typed. Nothing in the app writes it — only a legacy or hand-edited
    // project.json can — so every card a user can actually make is still covered.
    const galleryNames = await window.evaluate(async (gs) => {
      const { MpiGalleryGrid } = await import('/js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js');
      const { state } = await import('/js/state.js');
      state.gallerySort = { order: 'newest', filter: 'all', scope: 'active' };
      const host = document.createElement('div');
      host.id = 'pick-grid-host';
      host.style.cssText = 'position:fixed;top:0;left:0;width:1600px;height:900px;z-index:0;';
      document.body.appendChild(host);
      const grid = MpiGalleryGrid.mount(host, { groups: gs });
      await new Promise(r => setTimeout(r, 400));
      const names = [...host.querySelectorAll('.mpi-group-card__name')].map(el => el.textContent);
      grid.el.destroy?.();
      host.remove();
      return names;
    }, fixtureGroups().filter(g =>
      !g.archived && g.history[0].filePath && g.id !== 'pick-untitled'));

    // Non-degenerate first: an empty grid would make the comparison vacuous.
    expect(galleryNames.length).toBe(3);
    expect(shown.filter(c => c !== 'flow-head-swap').sort()).toEqual([...galleryNames].sort());
  } finally {
    await closeApp(app);
  }
});

test('the type filter reads group.type, like the gallery', async ({}, testInfo) => {
  const { app, window } = await launchApp(testInfo);

  try {
    await window.waitForTimeout(6000);
    await openPicker(window, fixtureGroups(), 'image');

    // `pick-mixed` is `type: 'video'` and its selected take is an IMAGE. The
    // gallery files it under Videos; filtering per item would file it under Images
    // instead, so each tab is asserted in both directions.
    await setFilter(window, 'Videos');
    expect(await captions(window)).toEqual(['Clip with a still selected']);

    await setFilter(window, 'Images');
    const images = await captions(window);
    expect(images).toHaveLength(3);
    expect(images).not.toContain('Clip with a still selected');
  } finally {
    await closeApp(app);
  }
});

test('an audio tile plays on hover and stops on leave', async ({}, testInfo) => {
  const { app, window } = await launchApp(testInfo);

  try {
    await window.waitForTimeout(6000);

    const audioGroups = [{
      id: 'pick-audio', type: 'audio', name: 'notify', customName: 'A sound',
      createdAt: '2026-09-01T10:00:00Z', selectedIndex: 0, archived: false,
      history: [item('pick-audio-0', 'audio', SOUND)],
    }];

    await window.evaluate(async () => {
      const { Storage } = await import('/js/core/storage.js');
      // 0 IS the mute and skips hover-play entirely, so the spec must not inherit a
      // muted profile from another run.
      Storage.setGalleryVolume(0.8);
    });
    await openPicker(window, audioGroups, 'audio');

    expect(await captions(window)).toEqual(['A sound']);

    const hover = async (event) => window.evaluate(async (type) => {
      const tile = document.querySelector('.mpi-media-picker__tile-media');
      tile.dispatchEvent(new MouseEvent(type, { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      const audio = tile.querySelector('audio');
      return audio
        ? { exists: true, paused: audio.paused, currentTime: audio.currentTime, duration: audio.duration }
        : { exists: false };
    }, event);

    // Built on the first hover, not with the tile — so its absence beforehand is
    // part of the contract, not an accident of timing.
    const before = await window.evaluate(() =>
      !!document.querySelector('.mpi-media-picker__tile-media audio'));
    expect(before).toBe(false);

    const playing = await hover('mouseenter');
    expect(playing.exists).toBe(true);
    // Non-degenerate first: a clip shorter than the settle above would end on its
    // own and make BOTH of the assertions around it pass against a broken hover.
    expect(playing.duration).toBeGreaterThan(2);
    expect(playing.paused).toBe(false);

    const stopped = await hover('mouseleave');
    expect(stopped.paused).toBe(true);
    expect(stopped.currentTime).toBe(0);
  } finally {
    await closeApp(app);
  }
});
