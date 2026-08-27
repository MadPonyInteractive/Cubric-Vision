const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

/**
 * MPI-633 — the image rendition ladder, and the demote that pays for it.
 *
 * A card mounts the smallest rendition that covers its rendered box, so a big card
 * stops upscaling a 512px thumb. That fix is not free: measured on 120 cards at the
 * largest slider level, the ladder rests at 238 MB of dedicated VRAM after a scroll
 * to the bottom, against 12 MB for today's single thumb — while the four cards
 * actually visible account for only 23.7 of it. The other 214 MB are Chromium's GPU
 * image cache holding every card the scroll passed, so the two halves ship together
 * and this spec asserts both.
 *
 * The invariant is which FILE the `<img>` is pointing at, because that is the whole
 * mechanism: a big on-screen card holds the large rendition, and a card scrolled
 * further than `DEMOTE_MARGIN_PX` away drops back to the small one.
 *
 * The fixture points thumbPath / thumbPathLg / filePath at three DIFFERENT real
 * shipped stills (`comfy_workflows/display/`, served by `routes/workflowStatic.js`)
 * so the assertion can tell them apart. Real files, not invented ones: a src that
 * 404s takes the missing-media path, which empties `.mpi-group-card__media` and
 * makes the spec read as a broken fix when the fix is fine (MPI-631).
 */
// Electron boot (splash → local server → shell) runs past the 30s default.
test.setTimeout(90000);

const SMALL = 'flow-scribble';
const LARGE = 'flow-outpaint';
const FULL  = 'flow-head-swap';


test('a big card mounts the large rendition, a small one does not', async ({}, testInfo) => {
  const { app, window } = await launchApp(testInfo);

  try {
    await window.waitForTimeout(6000); // shell boot settles

    // The slider level is read off `state` at mount, so each level gets its own
    // mount rather than a synthesised slider gesture.
    const mountAt = (level) => window.evaluate(async (lvl) => {
      const { MpiGalleryGrid } = await import('/js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js');
      const { state } = await import('/js/state.js');
      window.__mpi633a?.grid?.el?.destroy?.();
      window.__mpi633a?.host?.remove();

      const host = document.createElement('div');
      host.id = 'mpi633a-host';
      host.style.cssText = 'position:fixed;top:0;left:0;width:1600px;height:900px;z-index:0;';
      document.body.appendChild(host);

      const groups = Array.from({ length: 6 }, (_, i) => ({
        id: `mpi633a-${i}`,
        type: 'image',
        selectedIndex: 0,
        history: [{
          id: `mpi633a-item-${i}`,
          type: 'image',
          filePath:    '/comfy_workflows/display/flow-head-swap.webp',
          thumbPath:   '/comfy_workflows/display/flow-scribble.webp',
          thumbPathLg: '/comfy_workflows/display/flow-outpaint.webp',
          // A WIDE aspect, so the justified packer really does put two cards on a
          // row at level 4. With no dimensions the ratio defaults to 1.0, the
          // packer fits four per row, and a 354px card is correctly BELOW the
          // boundary -- the fixture would then prove the opposite of what it says.
          pixelDimensions: { w: 1920, h: 1080 },
        }],
      }));

      state.gallerySizeLevel = lvl;
      window.__mpi633a = { grid: MpiGalleryGrid.mount(host, { groups }), host };
      return window.devicePixelRatio || 1;
    }, level);

    const firstSrc = () => window.evaluate(
      () => document.querySelector('#mpi633a-host .mpi-group-card__thumb')?.getAttribute('src') || '');
    const cardBox = () => window.evaluate(() =>
      Math.max(...['width', 'height'].map(k =>
        parseFloat(document.querySelector('#mpi633a-host .mpi-gallery-grid__row-wrap')?.style[k] || '0'))));

    // Level 4: two cards per row at 1600px is ~790 CSS px, above the 512 boundary at
    // any device pixel ratio, so this card owes the large rendition.
    const dpr = await mountAt(4);
    await expect.poll(firstSrc).toContain(LARGE);
    expect(await cardBox() * dpr, 'level 4 card must clear the 512 boundary or this proves nothing')
      .toBeGreaterThan(512);

    // Level 1: six per row at 1600px is ~250 CSS px — under 512 even at dpr 2, so
    // the card must stay on the cheap thumb.
    await mountAt(1);
    await expect.poll(firstSrc).toContain(SMALL);
    expect(await cardBox() * dpr, 'level 1 card must stay under the boundary')
      .toBeLessThanOrEqual(512);
  } finally {
    await window.evaluate(() => {
      window.__mpi633a?.grid?.el?.destroy?.();
      window.__mpi633a?.host?.remove();
      delete window.__mpi633a;
    }).catch(() => {});
    await closeApp(app);
  }
});

test('a card with no large rendition uses the ORIGINAL, never an upscaled thumb', async ({}, testInfo) => {
  // Clamp to source. Most assets in a project are 1280x800, so no `.1280.webp` is
  // ever written for them — the original IS that tier, and a big card must land on
  // filePath rather than fall back to the 512 thumb it is visibly upscaling.
  const { app, window } = await launchApp(testInfo);

  try {
    await window.waitForTimeout(6000);

    await window.evaluate(async () => {
      const { MpiGalleryGrid } = await import('/js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js');
      const { state } = await import('/js/state.js');
      const host = document.createElement('div');
      host.id = 'mpi633b-host';
      host.style.cssText = 'position:fixed;top:0;left:0;width:1600px;height:900px;z-index:0;';
      document.body.appendChild(host);

      const groups = Array.from({ length: 4 }, (_, i) => ({
        id: `mpi633b-${i}`,
        type: 'image',
        selectedIndex: 0,
        history: [{
          id: `mpi633b-item-${i}`,
          type: 'image',
          filePath:    '/comfy_workflows/display/flow-head-swap.webp',
          thumbPath:   '/comfy_workflows/display/flow-scribble.webp',
          thumbPathLg: null,
          pixelDimensions: { w: 1920, h: 1080 },
        }],
      }));

      state.gallerySizeLevel = 4;
      window.__mpi633b = { grid: MpiGalleryGrid.mount(host, { groups }), host };
    });

    await expect.poll(() => window.evaluate(
      () => document.querySelector('#mpi633b-host .mpi-group-card__thumb')?.getAttribute('src') || ''))
      .toContain(FULL);
  } finally {
    await window.evaluate(() => {
      window.__mpi633b?.grid?.el?.destroy?.();
      window.__mpi633b?.host?.remove();
      delete window.__mpi633b;
    }).catch(() => {});
    await closeApp(app);
  }
});

test('a promoted video card mounts the PROXY, and the item keeps its master', async ({}, testInfo) => {
  // Phase 2. A decoder works at the clip's native resolution however small the card is —
  // measured, the same 3000x1280 clip costs 81.2 MB per promoted card in a 64x80 box and
  // 82.4 MB in a 134x167 one — so the file is the only lever. What must not drift is that
  // ONLY the gallery element takes the proxy: the viewer, drag-out and reveal all read the
  // item's `filePath`, and a proxy leaking into those would silently downgrade an export.
  const { app, window } = await launchApp(testInfo);

  try {
    await window.waitForTimeout(6000);

    await window.evaluate(async () => {
      const { MpiGalleryGrid } = await import('/js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js');
      const host = document.createElement('div');
      host.id = 'mpi633e-host';
      host.style.cssText = 'position:fixed;top:0;left:0;width:1200px;height:900px;z-index:0;';
      document.body.appendChild(host);

      // Two DIFFERENT real clips standing in for master and proxy, so the assertion can
      // tell them apart. A made-up src 404s into the missing-media path (MPI-631).
      const groups = [{
        id: 'mpi633e-0',
        type: 'video',
        selectedIndex: 0,
        history: [{
          id: 'mpi633e-item-0',
          type: 'video',
          filePath:  '/comfy_workflows/display/flow-head-swap.mp4',
          proxyPath: '/comfy_workflows/display/flow-scribble.mp4',
          thumbPath: '/comfy_workflows/display/flow-head-swap.webp',
        }],
      }];

      window.__mpi633e = { grid: MpiGalleryGrid.mount(host, { groups }), host };
    });

    const promotedSrc = () => window.evaluate(() =>
      document.querySelector('#mpi633e-host video.mpi-group-card__thumb--hover-video')
        ?.getAttribute('src') || '');

    await expect.poll(promotedSrc).toContain('flow-scribble.mp4');

    // And the master appears NOWHERE in the card — the gallery only ever holds the proxy.
    // `filePath` still lives on the item, which is what the viewer and the export paths
    // read; a master leaking into a card element would mean the decoder is back.
    const cardHtml = await window.evaluate(() =>
      document.querySelector('#mpi633e-host .mpi-group-card')?.innerHTML || '');
    expect(cardHtml).not.toContain('flow-head-swap.mp4');
  } finally {
    await window.evaluate(() => {
      window.__mpi633e?.grid?.el?.destroy?.();
      window.__mpi633e?.host?.remove();
      delete window.__mpi633e;
    }).catch(() => {});
    await closeApp(app);
  }
});

test('flinging past 40 cards does not decode 40 large renditions', async ({}, testInfo) => {
  // The half that actually bounds VRAM. A decoded image is retained by Chromium's GPU
  // image cache keyed by URL, so once a card has PAINTED its large rendition the
  // memory is gone whether or not anything still points at it — measured on the
  // 120-card rig: demoting every off-screen card back to 512 left the resting cost at
  // 236.5 MB against 234.5 for the same tour with no demote at all. The only lever is
  // how many distinct large renditions ever get painted, which the scroll-idle gate
  // cuts from every card to the band you stop on: 73.8 MB against 241.5 on a fling.
  //
  // Asserted through `performance` resource entries rather than live `src` values,
  // which is why each card's large rendition carries its own cache-busting query: at
  // rest the demote has put the off-screen cards back on the small thumb either way,
  // so the DOM cannot tell a banded sweep from one that promoted everything. What was
  // fetched can.
  const { app, window } = await launchApp(testInfo);
  const CARDS = 40;

  try {
    await window.waitForTimeout(6000);

    await window.evaluate(async (n) => {
      const { MpiGalleryGrid } = await import('/js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js');
      const { state } = await import('/js/state.js');
      const host = document.createElement('div');
      host.id = 'mpi633d-host';
      host.style.cssText = 'position:fixed;top:0;left:0;width:1600px;height:420px;z-index:0;';
      document.body.appendChild(host);

      const groups = Array.from({ length: n }, (_, i) => ({
        id: `mpi633d-${i}`,
        type: 'image',
        selectedIndex: 0,
        history: [{
          id: `mpi633d-item-${i}`,
          type: 'image',
          filePath:    '/comfy_workflows/display/flow-head-swap.webp',
          thumbPath:   '/comfy_workflows/display/flow-scribble.webp',
          thumbPathLg: `/comfy_workflows/display/flow-outpaint.webp?card=${i}`,
          pixelDimensions: { w: 1920, h: 1080 },
        }],
      }));

      state.gallerySizeLevel = 4;
      window.__mpi633d = { grid: MpiGalleryGrid.mount(host, { groups }), host };
    }, CARDS);

    await window.waitForTimeout(1500);

    // One continuous gesture, ~16 ms per step — a wheel fling, not 40 deliberate stops.
    // The buffer is cleared first: the shell's own boot fills the default 250-entry
    // resource-timing buffer long before the fixture mounts, and a FULL buffer drops
    // new entries silently — which reads as "nothing was fetched" and looks exactly
    // like the gate working perfectly. Clearing also scopes the count to the fling.
    await window.evaluate(async () => {
      performance.setResourceTimingBufferSize(2000);
      performance.clearResourceTimings();
      const g = document.querySelector('#mpi633d-host .mpi-gallery-grid__grid');
      for (let i = 0; i < 300; i++) {
        const before = g.scrollTop;
        g.scrollTop = Math.min(before + g.clientHeight * 0.8, g.scrollHeight);
        if (g.scrollTop <= before + 1) break;
        await new Promise(r => setTimeout(r, 16));
      }
    });
    await window.waitForTimeout(2000); // past the 150 ms idle, then settle

    const fetched = await window.evaluate(() => performance.getEntriesByType('resource')
      .filter(e => e.name.includes('flow-outpaint.webp?card=')).length);

    // The band the fling ends on, plus whatever the start promoted before it moved —
    // a handful, not one per card. The exact number depends on the promote margin, so
    // this asserts the ORDER, which is the thing the gate changes.
    expect(fetched, 'a fling must not decode a large rendition per card').toBeLessThan(CARDS / 2);
    expect(fetched, 'the band it came to rest on must still be sharp').toBeGreaterThan(0);
  } finally {
    await window.evaluate(() => {
      window.__mpi633d?.grid?.el?.destroy?.();
      window.__mpi633d?.host?.remove();
      delete window.__mpi633d;
    }).catch(() => {});
    await closeApp(app);
  }
});

test('a card scrolled far off-screen drops back to the small rendition, and returns', async ({}, testInfo) => {
  // Phase 1b. Without this the ladder is a 20x VRAM regression, not a quality fix.
  const { app, window } = await launchApp(testInfo);

  try {
    await window.waitForTimeout(6000);

    await window.evaluate(async () => {
      const { MpiGalleryGrid } = await import('/js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js');
      const { state } = await import('/js/state.js');
      const host = document.createElement('div');
      host.id = 'mpi633c-host';
      // Short host so the cards overflow and the grid actually scrolls.
      host.style.cssText = 'position:fixed;top:0;left:0;width:1600px;height:420px;z-index:0;';
      document.body.appendChild(host);

      // Enough rows that a card can travel further than DEMOTE_MARGIN_PX (600px)
      // out of view — a fixture that overflows by a few hundred pixels can never
      // trip the demote and would pass green against a broken build (MPI-631).
      const groups = Array.from({ length: 40 }, (_, i) => ({
        id: `mpi633c-${i}`,
        type: 'image',
        selectedIndex: 0,
        history: [{
          id: `mpi633c-item-${i}`,
          type: 'image',
          filePath:    '/comfy_workflows/display/flow-head-swap.webp',
          thumbPath:   '/comfy_workflows/display/flow-scribble.webp',
          thumbPathLg: '/comfy_workflows/display/flow-outpaint.webp',
          // A WIDE aspect, so the justified packer really does put two cards on a
          // row at level 4. With no dimensions the ratio defaults to 1.0, the
          // packer fits four per row, and a 354px card is correctly BELOW the
          // boundary -- the fixture would then prove the opposite of what it says.
          pixelDimensions: { w: 1920, h: 1080 },
        }],
      }));

      state.gallerySizeLevel = 4;
      window.__mpi633c = { grid: MpiGalleryGrid.mount(host, { groups }), host };
    });

    await window.waitForTimeout(1500); // initial layout + observer pass

    const scrollable = await window.evaluate(() => {
      const g = document.querySelector('#mpi633c-host .mpi-gallery-grid__grid');
      return g ? g.scrollHeight - g.clientHeight : 0;
    });
    expect(scrollable, 'must overflow by more than DEMOTE_MARGIN_PX or the demote can never fire')
      .toBeGreaterThan(1000);

    const firstSrc = () => window.evaluate(
      () => document.querySelector('#mpi633c-host [data-group-id="mpi633c-0"] .mpi-group-card__thumb')
        ?.getAttribute('src') || '');

    await expect.poll(firstSrc).toContain(LARGE);

    const scrollTo = (y) => window.evaluate((top) => {
      const g = document.querySelector('#mpi633c-host .mpi-gallery-grid__grid');
      g.scrollTop = top === -1 ? g.scrollHeight : top;
    }, y);

    await scrollTo(-1);
    await expect.poll(firstSrc).toContain(SMALL);

    // Not permanent — the same hysteresis pair the video decoders use.
    await scrollTo(0);
    await expect.poll(firstSrc).toContain(LARGE);
  } finally {
    await window.evaluate(() => {
      window.__mpi633c?.grid?.el?.destroy?.();
      window.__mpi633c?.host?.remove();
      delete window.__mpi633c;
    }).catch(() => {});
    await closeApp(app);
  }
});
