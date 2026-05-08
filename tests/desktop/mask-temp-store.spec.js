const fs = require('fs');
const { test, expect, _electron: electron } = require('@playwright/test');

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test('maskTempStore service: write → read → delete → read', async ({}, testInfo) => {
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

    // writeManual + writeSubtract
    const writeResult = await window.evaluate(async (px) => {
      const { maskTempStore } = await import('/js/services/maskTempStore.js');
      const wm = await maskTempStore.writeManual('p1', 'g1', 'i1', px);
      const ws = await maskTempStore.writeSubtract('p1', 'g1', 'i1', px);
      return { wm, ws };
    }, PNG_DATA_URL);
    expect(writeResult.wm).toEqual({ ok: true });
    expect(writeResult.ws).toEqual({ ok: true });

    // read returns both layers
    const read1 = await window.evaluate(async () => {
      const { maskTempStore } = await import('/js/services/maskTempStore.js');
      return await maskTempStore.read('p1', 'g1', 'i1');
    });
    expect(read1.manual).toMatch(/^data:image\/png;base64,/);
    expect(read1.subtract).toMatch(/^data:image\/png;base64,/);

    // delete clears the item dir
    const del = await window.evaluate(async () => {
      const { maskTempStore } = await import('/js/services/maskTempStore.js');
      return await maskTempStore.delete('p1', 'g1', 'i1');
    });
    expect(del).toEqual({ ok: true });

    // read returns null fields after delete
    const read2 = await window.evaluate(async () => {
      const { maskTempStore } = await import('/js/services/maskTempStore.js');
      return await maskTempStore.read('p1', 'g1', 'i1');
    });
    expect(read2.manual).toBeNull();
    expect(read2.subtract).toBeNull();

    // path-traversal id rejected by main; service surfaces { ok: false }
    const traversal = await window.evaluate(async (px) => {
      const { maskTempStore } = await import('/js/services/maskTempStore.js');
      return await maskTempStore.writeManual('..', 'g1', 'i1', px);
    }, PNG_DATA_URL);
    expect(traversal.ok).toBe(false);
    expect(traversal.error).toMatch(/path traversal/i);
  } finally {
    if (app.windows().length > 0) {
      await app.close().catch(() => {});
    }
  }
});
