const fs = require('fs');
const { test, expect, _electron: electron } = require('@playwright/test');
const { shellWindow, SHELL_URL_RE } = require('./shellWindow');

// MPI-122: the renderer's whole model→dependency chain runs through
// resolveModelDeps.js. This boots the real app and resolves the merged wan-22
// IN-PAGE (real Electron module resolver) so an import-path or shape regression in
// that chain fails loudly here instead of silently at first download.
//
// wan-22 was the last op-keyed model; it is FLAT now, so what this pins is that the
// flatten kept every weight reachable and that no shipped model went back to
// operation groups (the install UI for choosing between them is gone).
test('renderer resolves the merged wan-22 model via the dep resolver', async ({}, testInfo) => {
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
      const reg = await import('/js/data/modelRegistry.js');
      const res = await import('/js/data/modelConstants/resolveModelDeps.js');
      const wan = reg.getModelById('wan-22');
      return {
        merged: !!wan,
        // No shipped model may declare operation groups any more.
        anyOpKeyed: reg.MODELS.some(m => res.hasOperationGroups(m)),
        selectable: res.selectableOps(wan),
        // Legacy split ids must resolve to the merged model.
        viaLegacy: reg.getModelById('wan-22-t2v')?.id || null,
        fullUniverseHasI2VNode:
          res.resolveFullUniverse(wan).includes('ComfyUI-PainterI2Vadvanced'),
        // MPI-470's t2v pair was deleted from the model; the flatten must not have
        // let it back in through the dep list.
        universeHasNoDeadT2V:
          !res.resolveFullUniverse(wan).some(id => id.startsWith('wan-22-t2v')),
      };
    });

    expect(result.merged).toBe(true);
    expect(result.anyOpKeyed).toBe(false);
    expect(result.selectable).toEqual([]);
    expect(result.viaLegacy).toBe('wan-22');
    expect(result.fullUniverseHasI2VNode).toBe(true);
    expect(result.universeHasNoDeadT2V).toBe(true);
  } finally {
    await app.close();
  }
});
