const fs = require('fs');
const { test, expect, _electron: electron } = require('@playwright/test');
const { shellWindow, SHELL_URL_RE } = require('./shellWindow');

// MPI-620 — clearing a filled media slot must not break navigation.
//
// `_mediaGroups[].items` is SPARSE BY CONTRACT: clearing a slot `delete`s its index
// rather than splicing, so every later image keeps the role its slot names. But
// `Array.prototype.find` is one of the few iterators that does NOT skip holes — it
// calls back with `undefined` — and `_mediaForRole` used a bare `it.role`.
//
// The failure was invisible in every way that usually catches one. The TypeError fired
// inside `_renderSlide` BEFORE `slidesEl.innerHTML = ''`, so the old slide stayed on
// screen while `_current` had already advanced: pressing Next once appeared to do
// nothing, and pressing it again jumped to Generate (which builds no gizmo and never
// calls `_mediaForRole`). It read as "the flow skips the middle step". Nothing reached
// `clientLogger`, so `app.log` showed a clean session, and the node suite cannot see it
// because the bug only exists once a real slot has been filled and then cleared.
//
// This drives that exact sequence in the real renderer: seed a filled slot, click the
// slot's clear button, then step forward and assert the MIDDLE step is what mounts.
test('clearing a filled media slot still advances into the gizmo step', async ({}, testInfo) => {
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
      const errs = [];
      window.addEventListener('error', e => errs.push(String(e.message)));

      const { MpiBaseFlow } = await import('/js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js');
      const { getFlowById } = await import('/js/data/flowsRegistry.js');
      const flow = getFlowById('scribble');

      // 1x1 png — the slot only needs a url it can render as filled.
      const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAf'
        + 'FcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

      // MpiBaseFlow cannot be measured in a detached div, and the shell's `flow:open`
      // path gives a 0x0 overlay with no project open. Mount into a throwaway div, then
      // append the element into a fixed, fully sized host.
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:99999';
      document.body.appendChild(host);

      const inst = MpiBaseFlow.mount(document.createElement('div'), {
        flow,
        initialInputs: { mediaItems: [{ mediaType: 'image', role: 'image1', url: PNG }] },
      });
      host.appendChild(inst.el);
      inst.el.open?.();
      await new Promise(r => setTimeout(r, 400));

      const activeIdx = () => [...inst.el.querySelectorAll('[aria-current]')]
        .findIndex(t => t.getAttribute('aria-current') === 'step');

      const out = { tickCount: inst.el.querySelectorAll('[aria-current]').length };
      out.start = activeIdx();

      inst.el.querySelector('.mpi-base-flow__slot-clear')?.click();
      await new Promise(r => setTimeout(r, 300));
      out.afterClear = activeIdx();

      const next = [...inst.el.querySelectorAll('button')]
        .find(b => /next/i.test(b.className) || /next/i.test(b.getAttribute('aria-label') || ''));
      out.nextFound = !!next;
      next?.click();
      await new Promise(r => setTimeout(r, 350));
      out.afterNext = activeIdx();
      out.canvasMounted = !!inst.el.querySelector('canvas');

      out.errs = errs;
      inst.el.destroy?.();
      host.remove();
      return out;
    });

    // Inputs · Draw it · Generate — the middle step must exist to be skipped.
    expect(result.tickCount).toBe(3);
    expect(result.nextFound).toBe(true);
    expect(result.start).toBe(0);
    expect(result.afterClear).toBe(0);

    // THE REGRESSION: 2 here means the middle step was skipped, 0 means the throw ate
    // the navigation and left the old slide up.
    expect(result.afterNext).toBe(1);
    // …and it really mounted the paint gizmo rather than the "add an image" placeholder.
    expect(result.canvasMounted).toBe(true);
    expect(result.errs).toEqual([]);
  } finally {
    await app.close();
  }
});

// MPI-620 — a `blankOnly` step field is DISABLED once its step's media slot is filled.
//
// Scribble's canvas size sizes a BLANK canvas; an uploaded drawing brings its own size,
// so with a slot filled the control has nothing to act on. It used to render live and
// inert — the gizmo refused the change internally and nothing on screen said so, which
// is the failure Fabio rejected twice ("a control that moves and does nothing is worse
// than either real behaviour"). This pins BOTH directions, because a flag that disables
// unconditionally would pass a one-sided test while breaking the blank-canvas flow that
// is the whole point of this Flow.
test('a blankOnly field is disabled with media and live without', async ({}, testInfo) => {
  const userDataDir = testInfo.outputPath('user-data-blankonly');
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
      const { state } = await import('/js/state.js');
      const flow = getFlowById('scribble');

      const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAf'
        + 'FcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

      const probe = async (withMedia) => {
        // `seeded` prefers `state.s_flowInputs[flow.id]` over `initialInputs`, so a
        // previous probe's persisted media would leak into the next one and make the
        // blank case read as filled. Clear it on both sides.
        state.s_flowInputs = {};

        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:99999';
        document.body.appendChild(host);

        const inst = MpiBaseFlow.mount(document.createElement('div'), {
          flow,
          initialInputs: withMedia
            ? { mediaItems: [{ mediaType: 'image', role: 'image1', url: PNG }] }
            : {},
        });
        host.appendChild(inst.el);
        inst.el.open?.();
        await new Promise(r => setTimeout(r, 350));

        [...inst.el.querySelectorAll('button')]
          .find(b => /next/i.test(b.className) || /next/i.test(b.getAttribute('aria-label') || ''))
          ?.click();
        await new Promise(r => setTimeout(r, 400));

        const dds = [...inst.el.querySelectorAll('.mpi-dropdown')];
        const out = {
          count: dds.length,
          disabled: dds.map(d => d.className.includes('mpi-dropdown--disabled')),
        };
        inst.el.destroy?.();
        host.remove();
        state.s_flowInputs = {};
        return out;
      };

      return { blank: await probe(false), withMedia: await probe(true) };
    });

    // Blank canvas: every control on the step is live.
    expect(result.blank.disabled).toEqual([false, false]);
    // Slot filled: the canvas-size select alone goes disabled. The second dropdown is
    // the gizmo's own and must NOT be swept up by the flag.
    expect(result.withMedia.disabled).toEqual([true, false]);
  } finally {
    await app.close();
  }
});
