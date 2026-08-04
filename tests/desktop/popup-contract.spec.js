// MPI-443: the portal-vs-overlay-stash contract, as a permanent regression test.
//
// A body-mounted MpiOverlay stashes every document.body child into a display:none
// div when it shows. MpiDropdown and MpiTreePicker portal their popup to body — so
// while they portalled at MOUNT time, any picker built into an overlay BEFORE
// show() was swept into that stash: the trigger still toggled is-open (the chevron
// flipped) but the popup lived inside hidden DOM. That shipped in 1.3.0 as "the
// LoRA and upscale selectors do nothing" and was fixed in 8184709b by keeping the
// portal node detached until first open.
//
// This spec rebuilds that exact arrangement against the primitives. The real
// surface it broke is covered by model-settings-popup.spec.js; this one fails
// first and names the primitive, so the next component to sit inside a body
// overlay inherits the guarantee instead of rediscovering the trap.
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

test('pickers built inside a body-mounted overlay open on top of it, not into its stash', async ({}, testInfo) => {
  // Boot under load can blow the 30s default (matches the other desktop specs).
  test.setTimeout(90000);
  const { app, window, consoleErrors, pageErrors } = await launchApp(testInfo);

  try {
    const result = await window.evaluate(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));

      const [{ Events }, { MpiOverlay }, { MpiDropdown }, { MpiTreePicker }] = await Promise.all([
        import('/js/events.js'),
        import('/js/components/Primitives/MpiOverlay/MpiOverlay.js'),
        import('/js/components/Primitives/MpiDropdown/MpiDropdown.js'),
        import('/js/components/Primitives/MpiTreePicker/MpiTreePicker.js'),
      ]);

      // Leave the engine-install boot gate — with no engine on an isolated user
      // data dir the modal is up, and this test wants the same clean body the
      // user has once they are inside the app. A no-op when the gate never armed.
      Events.emit('engine:install-skipped');
      await sleep(300);

      /**
       * The four questions that separate "popup is there" from "popup exists in
       * hidden DOM". rootIsOpen is the precondition: in the shipped bug it was
       * TRUE while everything else was false, which is exactly the shape of a
       * click that registered against a popup nobody can see.
       */
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

      const overlay = MpiOverlay.mount(document.createElement('div'), {
        closable: false, mountTarget: 'body',
      });

      // Built BEFORE show() — the bug scenario. Both pickers portal their popup to
      // body, and show() is what stashes body's children.
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'padding:40px;display:flex;flex-direction:column;gap:24px';
      const ddHost = document.createElement('div');
      const tpHost = document.createElement('div');
      wrapper.append(ddHost, tpHost);
      overlay.el.appendToContainer(wrapper);

      // extraClasses is forwarded onto the portalled popup by both primitives, so
      // it is how the test finds ITS popup among any the shell already has open.
      const dd = MpiDropdown.mount(ddHost, {
        options: [{ label: 'Alpha', value: 'a' }, { label: 'Beta', value: 'b' }],
        value: '', placeholder: 'Pick one', extraClasses: 'e2e-probe-dd',
      });
      const tp = MpiTreePicker.mount(tpHost, {
        options: [
          { label: '— None —', value: '' },
          { label: 'probe_lora.safetensors', value: 'ProbeFolder/probe_lora.safetensors' },
        ],
        value: '', placeholder: 'Choose LoRA', extraClasses: 'e2e-probe-tp',
      });

      overlay.el.show();
      await sleep(100);

      const ddTrigger = dd.el.querySelector('.mpi-dropdown__trigger');
      ddTrigger.click();
      await sleep(100);
      const dropdown = measure(document.querySelector('.mpi-dropdown__list.e2e-probe-dd'), dd.el);

      ddTrigger.click();            // close before opening the next one
      await sleep(50);

      const tpTrigger = tp.el.querySelector('.mpi-tree-picker__trigger');
      tpTrigger.click();
      await sleep(100);
      const treePicker = measure(document.querySelector('.mpi-tree-picker__box.e2e-probe-tp'), tp.el);

      overlay.el.hide();
      dd.el.destroy?.();
      tp.el.destroy?.();
      overlay.el.destroy?.();

      return { dropdown, treePicker };
    });

    for (const [name, m] of Object.entries(result)) {
      // Precondition: if the trigger never toggled, the click did not land and
      // everything below would fail for a reason that has nothing to do with the
      // portal. Assert it first so that failure reads correctly.
      expect(m.rootIsOpen, `${name}: trigger click did not register`).toBe(true);
      expect(m.found, `${name}: popup node not in the document at all`).toBe(true);
      expect(m.stashed, `${name}: popup was swept into the overlay stash (the 1.3.0 bug)`).toBe(false);
      expect(m.bodyChild, `${name}: popup is not a direct body child`).toBe(true);
      expect(m.hasSize, `${name}: popup has a zero-size rect (${m.dims})`).toBe(true);
      expect(m.onTop, `${name}: popup is not the topmost element at its own centre`).toBe(true);
    }

    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toHaveLength(0);
    expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  } finally {
    await closeApp(app);
  }
});
