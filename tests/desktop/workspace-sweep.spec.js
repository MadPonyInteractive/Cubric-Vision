// MPI-443: breadth pass over the surfaces a release is least likely to be
// hand-tested on. Each test opens one surface and asserts only that it mounts
// and that nothing threw — deliberately shallow, because the point is coverage
// of the places nobody clicks before shipping, not depth on any one of them.
//
// Not covered here, on purpose: the Model Library needs installed models, so it
// does not mount meaningfully on an empty E2E user data dir and needs its own
// fixture before it can join this sweep. The Flow Library was excluded for the
// same reason plus its dev gate — that gate is gone (MPI-589) and the library now
// has real coverage of its own in flows-tab-ring.spec.js.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

/** A project that exists on disk, so workspace mounts can really read/write it. */
function makeProject(testInfo, itemGroups = []) {
  const folderPath = testInfo.outputPath('project');
  fs.mkdirSync(folderPath, { recursive: true });
  const project = {
    id: 'e2e-sweep', name: 'E2E Sweep', itemGroups, modelSettings: {},
  };
  fs.writeFileSync(path.join(folderPath, 'project.json'), JSON.stringify(project, null, 2));
  return { ...project, folderPath };
}

/** Leave the engine-install boot gate — an isolated user data dir has no engine. */
async function releaseBootGate(window) {
  await window.evaluate(async () => {
    const { Events } = await import('/js/events.js');
    Events.emit('engine:install-skipped');
    await new Promise(r => setTimeout(r, 300));
  });
}

test('landing page mounts', async ({}, testInfo) => {
  test.setTimeout(90000);
  const { app, window, consoleErrors, pageErrors } = await launchApp(testInfo);
  try {
    await releaseBootGate(window);
    await expect(window.locator('#page-landing')).toBeVisible();
    // The project picker is the landing page's own content, not shell chrome —
    // if it is missing the page rendered but the block behind it did not.
    await expect(window.locator('#projectGrid')).toBeAttached();
    expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toHaveLength(0);
  } finally {
    await closeApp(app);
  }
});

test('settings slide-over mounts and closes', async ({}, testInfo) => {
  test.setTimeout(90000);
  const { app, window, consoleErrors, pageErrors } = await launchApp(testInfo);
  try {
    await releaseBootGate(window);
    await window.evaluate(async () => {
      const [{ Events }, { MpiSettings }] = await Promise.all([
        import('/js/events.js'),
        import('/js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js'),
      ]);
      Events.emit('slide-over:open', { title: 'Settings', component: MpiSettings });
    });
    const panel = window.locator('.mpi-slide-over');
    await expect(panel).toBeVisible();
    await window.evaluate(() => document.querySelector('.mpi-slide-over')?.close());
    await expect(panel).toHaveCount(0, { timeout: 5000 });
    expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toHaveLength(0);
  } finally {
    await closeApp(app);
  }
});

test('gallery workspace mounts', async ({}, testInfo) => {
  test.setTimeout(90000);
  const { app, window, consoleErrors, pageErrors } = await launchApp(testInfo);
  try {
    await releaseBootGate(window);
    await window.evaluate(async (project) => {
      const [{ state }, { navigate, PAGE_GALLERY }] = await Promise.all([
        import('/js/state.js'),
        import('/js/router.js'),
      ]);
      state.currentProject = project;
      navigate(PAGE_GALLERY);
    }, makeProject(testInfo));

    await expect(window.locator('#app-shell')).toBeVisible();
    await expect(window.locator('#tool-container')).not.toBeEmpty({ timeout: 10000 });
    expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toHaveLength(0);
  } finally {
    await closeApp(app);
  }
});

test('group-history workspace mounts', async ({}, testInfo) => {
  test.setTimeout(90000);
  const { app, window, consoleErrors, pageErrors } = await launchApp(testInfo);
  try {
    await releaseBootGate(window);
    const project = makeProject(testInfo, [
      { id: 'grp1', name: 'Group 1', type: 'image', history: [], selectedIndex: 0 },
    ]);
    await window.evaluate(async (project) => {
      const [{ state }, { navigate, PAGE_GROUP_HISTORY }] = await Promise.all([
        import('/js/state.js'),
        import('/js/router.js'),
      ]);
      state.currentProject = project;
      navigate(PAGE_GROUP_HISTORY, { groupId: 'grp1' });
    }, project);

    await expect(window.locator('#app-shell')).toBeVisible();
    await expect(window.locator('#tool-container')).not.toBeEmpty({ timeout: 10000 });
    expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
    expect(consoleErrors, `console errors: ${consoleErrors.join(' | ')}`).toHaveLength(0);
  } finally {
    await closeApp(app);
  }
});
