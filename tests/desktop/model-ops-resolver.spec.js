const fs = require('fs');
const { test, expect, _electron: electron } = require('@playwright/test');

// MPI-122: with Wan 2.2 merged back to a single operation-selectable model, the
// renderer's whole model→dependency chain runs through resolveModelDeps.js. This
// boots the real app and resolves the merged wan-22 IN-PAGE (real Electron module
// resolver) so an import-path or shape regression in the migrated chain fails
// loudly here instead of silently at first download.
test('renderer resolves the merged wan-22 model via the op resolver', async ({}, testInfo) => {
  const userDataDir = testInfo.outputPath('user-data');
  fs.mkdirSync(userDataDir, { recursive: true });

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  env.CUBRIC_E2E = '1';
  env.CUBRIC_E2E_USER_DATA = userDataDir;

  const app = await electron.launch({ args: ['.'], env });

  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window).toHaveURL(/127\.0\.0\.1:3000/);

    const result = await window.evaluate(async () => {
      const reg = await import('/js/data/modelRegistry.js');
      const res = await import('/js/data/modelConstants/resolveModelDeps.js');
      const stateMod = await import('/js/state.js');
      const wan = reg.getModelById('wan-22');
      return {
        merged: !!wan,
        opKeyed: res.hasOperationGroups(wan),
        selectable: res.selectableOps(wan).sort(),
        // Legacy split ids must resolve to the merged model.
        viaLegacy: reg.getModelById('wan-22-t2v')?.id || null,
        fullUniverseHasI2VNode:
          res.resolveFullUniverse(wan).includes('ComfyUI-PainterI2Vadvanced'),
        t2vOnlyExcludesI2VNode:
          !res.resolveDeps(wan, ['t2v_ms']).includes('ComfyUI-PainterI2Vadvanced'),
        // requiresOps + cascade helpers must be exported and load in-page.
        hasRequiresHelpers:
          typeof res.expandRequiredOps === 'function'
          && typeof res.dependentsOfOp === 'function',
        // s_modelOpDraftByModel state key exists (persisted op draft).
        hasDraftState: 's_modelOpDraftByModel' in stateMod.state,
      };
    });

    expect(result.merged).toBe(true);
    expect(result.opKeyed).toBe(true);
    expect(result.selectable).toEqual(['i2v_ms', 't2v_ms']);
    expect(result.viaLegacy).toBe('wan-22');
    expect(result.fullUniverseHasI2VNode).toBe(true);
    expect(result.t2vOnlyExcludesI2VNode).toBe(true);
    expect(result.hasRequiresHelpers).toBe(true);
    expect(result.hasDraftState).toBe(true);
  } finally {
    await app.close();
  }
});
