const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

/**
 * MPI-631 — the gallery must hand its video decoders back when it is not the
 * visible surface, and when a generation is using the GPU.
 *
 * Each promoted hover `<video>` carries `preload="auto"`, so it holds a decoder and
 * its decode surfaces for as long as it exists. Promotion used to be a one-way
 * ratchet (the IntersectionObserver unobserved a card the moment it promoted), and
 * a 161-asset project measured 410 MB → 1858 MB of dedicated VRAM, flat and
 * byte-identical for 13 idle minutes. Only navigating away ever released it.
 *
 * The invariant is the count of promoted `<video>` elements: it must fall to zero
 * while something covers the gallery or a generation is in flight, and come back
 * when the hold is dropped.
 *
 * The fixture uses REAL shipped media (the Flow hero clips and their stills under
 * `comfy_workflows/display/`, served by `routes/workflowStatic.js`). A made-up
 * src does not work: a poster that 404s takes the missing-media path, which empties
 * `.mpi-group-card__media` entirely, so there is nothing to promote and the spec
 * reads as a broken fix when the fix is fine.
 */
// Electron boot (splash → local server → shell) runs past the 30s default.
test.setTimeout(90000);

const CARD_COUNT = 4;

test('gallery releases promoted videos on overlay open and on generation dispatch', async ({}, testInfo) => {
  const { app, window } = await launchApp(testInfo);

  try {
    await window.waitForTimeout(6000); // shell boot settles

    // Mount a real MpiGalleryGrid on synthetic video groups, outside the app's own
    // layout so no project is needed. Kept on `window.__mpi631` so later steps drive
    // the same instance.
    await window.evaluate(async (n) => {
      const { MpiGalleryGrid } = await import('/js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js');
      const host = document.createElement('div');
      host.id = 'mpi631-host';
      // Big enough that every card lands inside the observer's root margin, so all
      // of them promote and the counts below are not a scroll-position artefact.
      host.style.cssText = 'position:fixed;inset:0;width:1200px;height:900px;z-index:0;';
      document.body.appendChild(host);

      const names = ['flow-scribble', 'flow-outpaint', 'flow-head-swap', 'flow-draw-it-in'];
      const groups = Array.from({ length: n }, (_, i) => ({
        id: `mpi631-${i}`,
        type: 'video',
        selectedIndex: 0,
        history: [{
          id: `mpi631-item-${i}`,
          type: 'video',
          filePath: `/comfy_workflows/display/${names[i % names.length]}.mp4`,
          thumbPath: `/comfy_workflows/display/${names[i % names.length]}.webp`,
        }],
      }));

      window.__mpi631 = { grid: MpiGalleryGrid.mount(host, { groups }), host };
    }, CARD_COUNT);

    const promoted = () => window.locator('video.mpi-group-card__thumb--hover-video');

    // IntersectionObserver delivers asynchronously.
    await expect(promoted()).toHaveCount(CARD_COUNT);

    // ── Trigger 1: something covers the gallery ──────────────────────────────
    await window.evaluate(async () => {
      const { Overlays } = await import('/js/managers/overlayManager.js');
      window.__mpi631.overlay = { show() {}, hide() {} };
      Overlays.request(window.__mpi631.overlay);
    });
    await expect(promoted()).toHaveCount(0);

    // Tearing down once is not enough — promotion must stay OFF. An observer
    // notification is just `promoteVideo()`, so scrolling while suspended would
    // otherwise re-promote the whole band and free nothing.
    await window.evaluate(() => {
      document.querySelectorAll('#mpi631-host .mpi-group-card').forEach(c => c.promoteVideo?.());
    });
    await expect(promoted()).toHaveCount(0);

    // …except for the one-card hover exception: an explicit hover is a direct
    // request for that card, and costs one decoder rather than all of them.
    await window.evaluate(() => {
      document.querySelector('#mpi631-host .mpi-group-card')?.promoteVideo?.({ userHover: true });
    });
    await expect(promoted()).toHaveCount(1);

    await window.evaluate(async () => {
      const { Overlays } = await import('/js/managers/overlayManager.js');
      Overlays.release(window.__mpi631.overlay);
    });
    await expect(promoted()).toHaveCount(CARD_COUNT);

    // ── Trigger 2: a generation wants the GPU ────────────────────────────────
    await window.evaluate(async () => {
      const { Events } = await import('/js/events.js');
      const { state } = await import('/js/state.js');
      state.generationQueueCount = 1;
      Events.emit('generation:started', { id: 'mpi631', scope: 'gallery' });
    });
    await expect(promoted()).toHaveCount(0);

    // Resume is deferred 150ms and re-checks the queue, so a still-running queue
    // must NOT bring the decoders back.
    await window.evaluate(async () => {
      const { Events } = await import('/js/events.js');
      Events.emit('generation:complete', { id: 'mpi631' });
    });
    await window.waitForTimeout(400);
    await expect(promoted()).toHaveCount(0);

    // Drained → resume.
    await window.evaluate(async () => {
      const { Events } = await import('/js/events.js');
      const { state } = await import('/js/state.js');
      state.generationQueueCount = 0;
      Events.emit('generation:complete', { id: 'mpi631' });
    });
    await expect(promoted()).toHaveCount(CARD_COUNT);
  } finally {
    await window.evaluate(() => {
      window.__mpi631?.grid?.el?.destroy?.();
      window.__mpi631?.host?.remove();
      delete window.__mpi631;
    }).catch(() => {});
    await closeApp(app);
  }
});

/**
 * Trigger C — a card that scrolls far enough away hands its decoder back on its own.
 *
 * Without this, the overlay and generation holds still leave a deliberate scroll to
 * the bottom of a big project parked at its full cost for as long as the user sits in
 * the gallery: measured 1976 MB with both other triggers already working. The resident
 * set has to track what is on screen, not what has ever been on screen.
 */
test('gallery demotes videos that scroll far off-screen, and re-promotes on return', async ({}, testInfo) => {
  const { app, window } = await launchApp(testInfo);

  try {
    await window.waitForTimeout(6000);

    // A short host so the cards overflow and the grid actually scrolls — the point
    // of this spec is the scroll, so a fixture that fits on screen proves nothing.
    const total = await window.evaluate(async () => {
      const { MpiGalleryGrid } = await import('/js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js');
      const host = document.createElement('div');
      host.id = 'mpi631c-host';
      host.style.cssText = 'position:fixed;top:0;left:0;width:900px;height:420px;z-index:0;';
      document.body.appendChild(host);

      const names = ['flow-scribble', 'flow-outpaint', 'flow-head-swap', 'flow-draw-it-in'];
      // Enough rows that a card can travel further than DEMOTE_MARGIN_PX (600px)
      // out of view. A fixture that only overflows by a few hundred pixels can
      // never trip the demote and would pass green against a broken build.
      const groups = Array.from({ length: 60 }, (_, i) => ({
        id: `mpi631c-${i}`,
        type: 'video',
        selectedIndex: 0,
        history: [{
          id: `mpi631c-item-${i}`,
          type: 'video',
          filePath: `/comfy_workflows/display/${names[i % names.length]}.mp4`,
          thumbPath: `/comfy_workflows/display/${names[i % names.length]}.webp`,
        }],
      }));

      window.__mpi631c = { grid: MpiGalleryGrid.mount(host, { groups }), host };
      return groups.length;
    });

    const promotedIn = (sel) => window.locator(`${sel} video.mpi-group-card__thumb--hover-video`);

    // Settle the initial layout + observer pass.
    await window.waitForTimeout(1500);

    const scrollable = await window.evaluate(() => {
      const g = document.querySelector('#mpi631c-host .mpi-gallery-grid__grid');
      return g ? g.scrollHeight - g.clientHeight : 0;
    });
    expect(scrollable, 'must overflow by more than DEMOTE_MARGIN_PX or the demote can never fire').toBeGreaterThan(1000);

    // Not everything promotes: only the visible band plus its margin.
    const atTop = await promotedIn('#mpi631c-host').count();
    expect(atTop).toBeGreaterThan(0);
    expect(atTop).toBeLessThan(total);

    // The first card is on screen at the top…
    await expect(promotedIn('#mpi631c-host [data-group-id="mpi631c-0"]')).toHaveCount(1);

    // …and must give its decoder back once it is far behind us.
    await window.evaluate(() => {
      const g = document.querySelector('#mpi631c-host .mpi-gallery-grid__grid');
      g.scrollTop = g.scrollHeight;
    });
    await expect(promotedIn('#mpi631c-host [data-group-id="mpi631c-0"]')).toHaveCount(0);

    // Still bounded at the bottom — this is a moving window, not a second ratchet.
    expect(await promotedIn('#mpi631c-host').count()).toBeLessThan(total);

    // Scrolling back re-promotes it: demotion must not be permanent.
    await window.evaluate(() => {
      const g = document.querySelector('#mpi631c-host .mpi-gallery-grid__grid');
      g.scrollTop = 0;
    });
    await expect(promotedIn('#mpi631c-host [data-group-id="mpi631c-0"]')).toHaveCount(1);
  } finally {
    await window.evaluate(() => {
      window.__mpi631c?.grid?.el?.destroy?.();
      window.__mpi631c?.host?.remove();
      delete window.__mpi631c;
    }).catch(() => {});
    await closeApp(app);
  }
});
