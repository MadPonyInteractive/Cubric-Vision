// MPI-589: the Tab ring and the Flows button in the gallery bar.
//
// Two things here are the whole point of the spec, and both fail silently:
//  - Flows is a BODY OVERLAY, and `workspace.flip`'s when-gate used to block on any
//    `.mpi-overlay--body`. Get that exception wrong and Tab dies the moment Flows
//    opens — the ring gets in and never comes out, with no error anywhere.
//  - The Model Library is also a body overlay and must STILL block Tab, so an
//    exception that is merely "a body overlay is open" is not good enough.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

function makeProject(testInfo, itemGroups = []) {
  const folderPath = testInfo.outputPath('project');
  fs.mkdirSync(folderPath, { recursive: true });
  const project = { id: 'e2e-ring', name: 'E2E Ring', itemGroups, modelSettings: {} };
  fs.writeFileSync(path.join(folderPath, 'project.json'), JSON.stringify(project, null, 2));
  return { ...project, folderPath };
}

async function releaseBootGate(window) {
  await window.evaluate(async () => {
    const { Events } = await import('/js/events.js');
    Events.emit('engine:install-skipped');
    await new Promise(r => setTimeout(r, 300));
  });
}

async function openGallery(window, project) {
  await window.evaluate(async (p) => {
    const [{ state }, { navigate, PAGE_GALLERY }] = await Promise.all([
      import('/js/state.js'),
      import('/js/router.js'),
    ]);
    state.currentProject = p;
    navigate(PAGE_GALLERY);
    await new Promise(r => setTimeout(r, 400));
  }, project);
}

/** Where the ring currently stands: 'FLOWS' or the current page. */
function where(window) {
  return window.evaluate(async () => {
    const { state } = await import('/js/state.js');
    return document.querySelector('.mpi-overlay--body .mpi-flow-library') ? 'FLOWS' : state.currentPage;
  });
}

test('Tab rings gallery → Flows → last card, and the Flows button opens the library', async ({}, testInfo) => {
  test.setTimeout(90000);
  const { app, window, consoleErrors, pageErrors } = await launchApp(testInfo);
  try {
    await releaseBootGate(window);
    await openGallery(window, makeProject(testInfo, [
      { id: 'grp1', name: 'Group 1', type: 'image', history: [], selectedIndex: 0 },
    ]));

    // The button is dead centre of the bar — Fabio's placement, and a real <button>.
    const flowsBtn = window.locator('.mpi-project-name__flows');
    await expect(flowsBtn).toBeVisible();
    expect(await flowsBtn.evaluate(el => el.tagName)).toBe('BUTTON');

    expect(await where(window)).toBe('gallery');
    await window.keyboard.press('Tab');
    await expect(window.locator('.mpi-overlay--body .mpi-flow-library')).toBeVisible({ timeout: 5000 });

    await window.keyboard.press('Tab');
    await expect.poll(() => where(window), { timeout: 5000 }).toBe('group-history');

    await window.keyboard.press('Tab');
    await expect.poll(() => where(window), { timeout: 5000 }).toBe('gallery');

    // The button is the other door in.
    await flowsBtn.click();
    await expect(window.locator('.mpi-overlay--body .mpi-flow-library')).toBeVisible({ timeout: 5000 });

    expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toHaveLength(0);
  } finally {
    await closeApp(app);
  }
});

test('a project with no cards rings between the gallery and Flows instead of dead-ending', async ({}, testInfo) => {
  test.setTimeout(90000);
  const { app, window, consoleErrors, pageErrors } = await launchApp(testInfo);
  try {
    await releaseBootGate(window);
    await openGallery(window, makeProject(testInfo, []));

    await window.keyboard.press('Tab');
    await expect(window.locator('.mpi-overlay--body .mpi-flow-library')).toBeVisible({ timeout: 5000 });
    await window.keyboard.press('Tab');
    await expect.poll(() => where(window), { timeout: 5000 }).toBe('gallery');

    expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toHaveLength(0);
  } finally {
    await closeApp(app);
  }
});

test('the Model Library still blocks Tab', async ({}, testInfo) => {
  test.setTimeout(90000);
  const { app, window, consoleErrors, pageErrors } = await launchApp(testInfo);
  try {
    await releaseBootGate(window);
    await openGallery(window, makeProject(testInfo, [
      { id: 'grp1', name: 'Group 1', type: 'image', history: [], selectedIndex: 0 },
    ]));

    await window.evaluate(async () => {
      const { Events } = await import('/js/events.js');
      Events.emit('models:open');
      await new Promise(r => setTimeout(r, 800));
    });
    await expect(window.locator('.mpi-overlay--body')).toBeVisible();

    await window.keyboard.press('Tab');
    await window.waitForTimeout(600);
    expect(await where(window)).toBe('gallery');
    await expect(window.locator('.mpi-overlay--body .mpi-flow-library')).toHaveCount(0);

    expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  } finally {
    await closeApp(app);
  }
});
