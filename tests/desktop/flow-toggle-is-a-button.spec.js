const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

/**
 * MPI-504 — a declared `toggle` renders as a toggleable icon+label MpiButton, shows
 * its caption ONCE, and reports its new state back to the flow.
 *
 * Fabio's ask: "MPI buttons for the toggles instead… you can actually use an icon and
 * the name, so that you don't need labels on the top like you have now." Three things
 * can go wrong quietly here and none of them throws:
 *   - the caption prints twice (button face + the wrapper's label span above it);
 *   - MpiButton drops out of icon mode, where `toggleable` is ignored outright and
 *     every `is-active` rule in MpiButton.css stops matching — the button then looks
 *     alive and flips nothing;
 *   - the flip never reaches the flow, so the run silently uses the default. That is
 *     the same shape as the Enhance dead-box: right on screen, wrong in the payload,
 *     or the reverse.
 *
 * So the assertions are the rendered button, the absence of a second caption, and the
 * value the flow itself kept — read back through a slide rebuild, not out of state.
 */
// Electron boot (splash → local server → shell) plus the settle wait runs past the
// 30s default.
test.setTimeout(90000);

test('a declared toggle is a toggleable button that reports its state', async ({}, testInfo) => {
  const { app, window } = await launchApp(testInfo);

  try {
    await window.waitForTimeout(6000);

    await window.evaluate(async () => {
      const { Events } = await import('/js/events.js');
      Events.emit('flow:open', { flowId: 'character-sheet' });
    });
    await expect(window.locator('.mpi-base-flow')).toHaveCount(1);

    // The toggles are run-slide fields, so walk to the last slide. Clicks go through
    // the handler in-page: with no project open the overlay's main-area is hidden, so
    // nothing inside it is clickable to a synthetic gesture.
    await window.evaluate(() => {
      document.querySelector('#flow-next').click();
      document.querySelector('#flow-next').click();
    });

    const toggles = window.locator('.mpi-base-flow__field-toggle button.mpi-ibtn');
    await expect(toggles).toHaveCount(2);

    const turbo = window.locator(
      '.mpi-base-flow__field-toggle button:has(.mpi-ibtn__label:text-is("Turbo"))',
    );
    await expect(turbo).toHaveCount(1);
    // The caption lives on the button's face and NOWHERE else — a `field-label` span
    // saying the same word above it is the thing this change removed.
    await expect(
      window.locator('.mpi-base-flow__field-label:text-is("Turbo")'),
    ).toHaveCount(0);

    // Declared defaults paint: Turbo is off, the headless pass is on.
    await expect(turbo).not.toHaveClass(/is-active/);
    await expect(
      window.locator('.mpi-base-flow__field-toggle button:has(.mpi-ibtn__label:text-is("Headless front body"))'),
    ).toHaveClass(/is-active/);

    // Flip it. `is-active` alone would prove only that MpiButton toggles itself —
    // the primitive flips that class whether or not anyone listened.
    await window.evaluate(() => {
      [...document.querySelectorAll('.mpi-base-flow__field-toggle button')]
        .find(b => b.querySelector('.mpi-ibtn__label')?.textContent === 'Turbo')
        .click();
    });
    await expect(turbo).toHaveClass(/is-active/);

    // So round-trip it through the flow's own store instead. Every slide rebuilds its
    // fields from `_fieldValues`, seeded `_fieldValues[id] ?? f.default` — so leaving
    // the slide and coming back re-mounts this button from whatever the flow recorded.
    // A `toggle` event that never reached `_setFlowField` comes back as the DECLARED
    // DEFAULT, which is `false`. This needs no run and no GPU — and it is why
    // `state.s_flowInputs` is NOT the witness: a live flow never writes that key while
    // the user edits (its writers are the run path at dispatch, and
    // `flowService.openFlowFromReuse`, which seeds it before the flow mounts), so
    // reading it here returns `undefined` however many controls have been touched.
    await window.evaluate(() => {
      document.querySelector('#flow-prev').click();
      document.querySelector('#flow-next').click();
    });
    await expect(
      window.locator('.mpi-base-flow__field-toggle button:has(.mpi-ibtn__label:text-is("Turbo"))'),
    ).toHaveClass(/is-active/);
  } finally {
    await closeApp(app);
  }
});
