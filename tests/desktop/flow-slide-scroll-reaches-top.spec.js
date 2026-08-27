const fs = require('fs');
const { test, expect, _electron: electron } = require('@playwright/test');
const { shellWindow, SHELL_URL_RE } = require('./shellWindow');

// MPI-596 — an overflowing step slide must still be scrollable to its TOP.
//
// `.mpi-base-flow__slide` centres its child (`align-items: center`) AND scrolls
// (`overflow-y: auto`). Those two together are a known CSS trap: once the content is
// taller than the container, centring pushes the overflow ABOVE the scroll origin,
// where `scrollTop: 0` already is — so the top of the content is unreachable and no
// amount of scrolling brings it back. Only the BOTTOM half overflows into scrollable
// space.
//
// Fabio hit it by making the UI slightly bigger: the step's image lost its top edge and
// could not be scrolled to (2026-08-27, twice — the second time with a screenshot). The
// fix is `align-items: safe center`, which falls back to flex-start the moment overflow
// would occur, so the block centres while it fits and scrolls honestly when it does not.
//
// This drives the real renderer at a viewport deliberately too short for the slide, and
// asserts the first child's top edge is reachable. Without the fix `topAtScrollZero` is
// NEGATIVE — the content begins above the scroll container and cannot be brought down.
test('an overflowing step slide can still be scrolled to its top', async ({}, testInfo) => {
  const userDataDir = testInfo.outputPath('user-data');
  fs.mkdirSync(userDataDir, { recursive: true });

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  env.CUBRIC_E2E = '1';
  env.CUBRIC_E2E_USER_DATA = userDataDir;

  const app = await electron.launch({ args: ['.'], env });

  try {
    const window = await shellWindow(app);
    await expect(window).toHaveURL(SHELL_URL_RE);

    const result = await window.evaluate(async () => {
      const { MpiBaseFlow } = await import('/js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js');
      const { getFlowById } = await import('/js/data/flowsRegistry.js');
      const flow = getFlowById('object-stamp');
      if (!flow) return { missingFlow: true };

      const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAf'
        + 'FcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

      // A host SHORTER than the slide needs — this is the "slightly bigger UI" case,
      // reproduced by shrinking the stage instead of scaling the chrome.
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;inset:0;width:1100px;height:420px;z-index:99999';
      document.body.appendChild(host);

      const inst = MpiBaseFlow.mount(document.createElement('div'), {
        flow,
        initialInputs: {
          mediaItems: [
            { mediaType: 'image', role: 'image1', url: PNG },
            { mediaType: 'image', role: 'image2', url: PNG },
          ],
        },
      });
      host.appendChild(inst.el);
      inst.el.open?.();
      await new Promise(r => setTimeout(r, 400));

      // Walk to the last middle step (`place`), the tallest one — canvas + mode row +
      // prompt + hint.
      const next = () => [...inst.el.querySelectorAll('button')]
        .find(b => /next/i.test(b.className) || /next/i.test(b.getAttribute('aria-label') || ''));
      next()?.click();
      await new Promise(r => setTimeout(r, 300));
      next()?.click();
      await new Promise(r => setTimeout(r, 400));

      const slide = inst.el.querySelector('.mpi-base-flow__slide[data-active="true"]');
      const work = slide?.querySelector('.mpi-base-flow__work');
      if (!slide || !work) { host.remove(); return { noSlide: true }; }

      slide.scrollTop = 0;
      await new Promise(r => setTimeout(r, 60));

      const out = {
        overflowing: slide.scrollHeight > slide.clientHeight + 1,
        // The gap between the content's top edge and the scroll viewport's top edge at
        // scrollTop 0. Negative means the content starts ABOVE the viewport with no way
        // to scroll up to it — the bug.
        topAtScrollZero: Math.round(work.getBoundingClientRect().top - slide.getBoundingClientRect().top),
      };

      inst.el.destroy?.();
      host.remove();
      return out;
    });

    expect(result.missingFlow).toBeUndefined();
    expect(result.noSlide).toBeUndefined();

    // The point of the fixture: if this is false the test proves nothing, so fail loudly
    // rather than passing on a slide that happened to fit.
    expect(result.overflowing).toBe(true);

    // THE REGRESSION. >= 0 means the top edge is at or below the scroll origin and the
    // user can reach it. Before the fix this was a negative number.
    expect(result.topAtScrollZero).toBeGreaterThanOrEqual(0);
  } finally {
    await app.close();
  }
});
