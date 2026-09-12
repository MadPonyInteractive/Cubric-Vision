// MPI-738: Enter in the notes editor must insert a newline.
//
// The unit test asserts the registry gate exists; this one presses the real key
// through the real stack. That matters because the bug was never in the notes
// editor at all — MpiModal binds `modal.confirm` on every show() whether or not
// the dialog listens, and hotkeyManager preventDefaults any bound+eligible key
// before dispatch. Only a live keypress proves nothing else eats Enter first.
//
// Same component serves project notes and card notes, so one mount covers both.
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

test('Enter types a newline in the notes editor textarea', async ({}, testInfo) => {
  test.setTimeout(90000);
  const { app, window, pageErrors } = await launchApp(testInfo);

  try {
    await window.evaluate(async () => {
      const [{ Events }, { MpiNotesEditor }] = await Promise.all([
        import('/js/events.js'),
        import('/js/components/Compounds/MpiNotesEditor/MpiNotesEditor.js'),
      ]);
      Events.emit('engine:install-skipped');
      await new Promise((r) => setTimeout(r, 300));

      // A fresh E2E profile shows the 18+ gate and the changelog; either would
      // otherwise sit on top of the editor and hold focus.
      Events.emit('ui:close-all-popups');
      await new Promise((r) => setTimeout(r, 200));

      const editor = MpiNotesEditor.mount(document.createElement('div'), {
        title: 'E2E notes',
        value: '',              // empty opens in edit mode
        onSave: async () => {},
      });
      editor.el.show();
      await new Promise((r) => setTimeout(r, 200));
    });

    const field = window.locator('.mpi-notes-editor .mpi-input__field');
    await expect(field).toBeVisible();
    await field.click();
    await window.keyboard.type('line one');
    await window.keyboard.press('Enter');
    await window.keyboard.type('line two');

    expect(await field.inputValue()).toBe('line one\nline two');

    // The dialog must also still be standing — Enter reaching `modal.confirm`
    // is the failure mode this gate exists to prevent.
    await expect(field).toBeVisible();

    expect(pageErrors).toEqual([]);
  } finally {
    await closeApp(app);
  }
});
