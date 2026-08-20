const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

/**
 * MPI-504 — a programmatic write into a Flow text field must reach the RENDERED
 * textarea, not an expando on the mount host.
 *
 * The Enhance button looked dead for a whole session. It was not: the op ran, the
 * text came back, `_fieldValues` received it, and the button correctly greyed out
 * because the value WAS there. Only the DOM write was lost — `_writeFieldValue`
 * queried `.mpi-base-flow__field-text`, which is the host `<div>` MpiInput mounts
 * INTO, and `div.value = text` sets a property nobody reads. No error, no log, no
 * repaint, clean exit.
 *
 * So the assertion has to be the rendered value of the `<textarea>` itself. Asserting
 * `_fieldValues` proves nothing here — that state was correct the entire time the bug
 * was live, which is exactly why it went unnoticed. `tests/` cannot see the DOM, so
 * this lives with the desktop specs.
 *
 * Both halves of the one broken line are covered, and neither needs a GPU:
 *   1. text IN  — `MpiInput.setValue` on the live field, the API `_writeFieldValue`
 *      now calls, on the element it now finds;
 *   2. text OUT — clear-on-edit, which runs the same `_writeFieldValue` and was
 *      silently broken in the same way: editing the source prompt is supposed to
 *      discard an enhancement written for the old wording.
 */
// Electron boot (splash → local server → shell) plus the settle wait runs past the
// 30s default.
test.setTimeout(90000);

test('a programmatic write into a Flow text field reaches the textarea', async ({}, testInfo) => {
  const { app, window } = await launchApp(testInfo);

  try {
    // The shell wires the flow:open listener during boot; wait for it to settle.
    await window.waitForTimeout(6000);

    // Opened through the event, not the Library tile: OPEN there is Gallery-only and
    // does nothing with no project loaded.
    await window.evaluate(async () => {
      const { Events } = await import('/js/events.js');
      Events.emit('flow:open', { flowId: 'character-sheet' });
    });
    await expect(window.locator('.mpi-base-flow')).toHaveCount(1);

    // With no project open the overlay mounts into a main-area the landing page keeps
    // hidden, so nothing inside it is CLICKABLE or FILLABLE — the same constraint
    // flow-close-destroys-instance.spec.js works around. Every interaction below
    // therefore goes through the real handler in-page rather than through a synthetic
    // Playwright gesture. The ASSERTIONS stay on the rendered textarea, which is the
    // whole point of the spec and reads fine on a hidden element.
    await window.evaluate(() => document.querySelector('#flow-next').click());

    // Anchor on the LABEL, not on DOM order: a field added to the step later must
    // not silently repoint this spec at the wrong box.
    const field = (label) => window.locator(
      `.mpi-base-flow__field:has(.mpi-base-flow__field-label:text-is("${label}"))`,
    );
    const source = field('Your character').locator('textarea');
    const phrase = field('The character phrase').locator('textarea');
    await expect(source).toHaveCount(1);
    await expect(phrase).toHaveCount(1);

    // 1. TEXT IN. Drive the Primitive exactly as `_writeFieldValue` does — reach the
    //    component root inside the wrapper and call its own API. Before the fix the
    //    equivalent write landed on the host div and this assertion saw an empty box.
    await window.evaluate(() => {
      const wrap = [...document.querySelectorAll('.mpi-base-flow__field')].find(
        w => w.querySelector('.mpi-base-flow__field-label')?.textContent === 'The character phrase',
      );
      wrap.querySelector('.mpi-input').setValue('ENHANCED-SENTINEL');
    });
    await expect(phrase).toHaveValue('ENHANCED-SENTINEL');

    // 2. TEXT OUT. `setValue` emits nothing, so the flow's own store has not seen that
    //    text — type it in first so clear-on-edit has something to discard. Value plus
    //    a bubbling `input` is the pair a real keystroke produces, and it is what
    //    MpiInput's own listener consumes, so `_setFlowField` runs for real.
    await window.evaluate(() => {
      const type = (label, text) => {
        const wrap = [...document.querySelectorAll('.mpi-base-flow__field')].find(
          w => w.querySelector('.mpi-base-flow__field-label')?.textContent === label,
        );
        const ta = wrap.querySelector('textarea');
        ta.value = text;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      };
      type('The character phrase', 'ENHANCED-SENTINEL');
      type('Your character', 'a knight in a dented breastplate');
    });
    // Editing the source discards the enhancement: it was written for the old
    // wording. Same `_writeFieldValue`, so a regression on that line fails here too.
    await expect(phrase).toHaveValue('');
  } finally {
    await closeApp(app);
  }
});
