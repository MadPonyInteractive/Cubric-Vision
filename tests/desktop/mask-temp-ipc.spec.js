const fs = require('fs');
const path = require('path');
const os = require('os');
const { test, expect, _electron: electron } = require('@playwright/test');

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test('mask-temp IPC: write/read/delete + session lifecycle', async ({}, testInfo) => {
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

    // Resolve session info via IPC (running in main process via app.evaluate).
    const sessionInfo = await app.evaluate(async ({ ipcMain }) => {
      // ipcMain.handle returns no value here; emit synthetic event by re-using handler registry.
      // Easier: call through renderer.
      return null;
    });
    expect(sessionInfo).toBeNull(); // not used; renderer path is the real test

    // Renderer-side IPC calls (contextIsolation=false → window.require works).
    const sessionResp = await window.evaluate(async () => {
      const { ipcRenderer } = window.require('electron');
      return await ipcRenderer.invoke('mask-temp:get-session-id');
    });
    expect(sessionResp.ok).toBe(true);
    expect(typeof sessionResp.sessionId).toBe('string');
    expect(sessionResp.sessionId.length).toBeGreaterThan(10);
    expect(typeof sessionResp.tempDir).toBe('string');

    const tempDir = sessionResp.tempDir;
    const sessionId = sessionResp.sessionId;

    // Write manual.
    const writeManual = await window.evaluate(async (px) => {
      const { ipcRenderer } = window.require('electron');
      return await ipcRenderer.invoke('mask-temp:write-manual', 'p1', 'g1', 'i1', px);
    }, PNG_DATA_URL);
    expect(writeManual).toEqual({ ok: true });

    // Verify file on disk.
    const manualPath = path.join(tempDir, 'p1', 'g1', 'i1', 'manual.png');
    expect(fs.existsSync(manualPath)).toBe(true);
    expect(fs.statSync(manualPath).size).toBeGreaterThan(0);

    // Read returns manual, subtract null.
    const read1 = await window.evaluate(async () => {
      const { ipcRenderer } = window.require('electron');
      return await ipcRenderer.invoke('mask-temp:read', 'p1', 'g1', 'i1');
    });
    expect(read1.ok).toBe(true);
    expect(read1.manual).toMatch(/^data:image\/png;base64,/);
    expect(read1.subtract).toBeNull();

    // Write subtract.
    const writeSub = await window.evaluate(async (px) => {
      const { ipcRenderer } = window.require('electron');
      return await ipcRenderer.invoke('mask-temp:write-subtract', 'p1', 'g1', 'i1', px);
    }, PNG_DATA_URL);
    expect(writeSub).toEqual({ ok: true });

    const read2 = await window.evaluate(async () => {
      const { ipcRenderer } = window.require('electron');
      return await ipcRenderer.invoke('mask-temp:read', 'p1', 'g1', 'i1');
    });
    expect(read2.manual).toMatch(/^data:image\/png;base64,/);
    expect(read2.subtract).toMatch(/^data:image\/png;base64,/);

    // Path traversal rejected.
    const traversal = await window.evaluate(async (px) => {
      const { ipcRenderer } = window.require('electron');
      return await ipcRenderer.invoke('mask-temp:write-manual', '..', 'g1', 'i1', px);
    }, PNG_DATA_URL);
    expect(traversal.ok).toBe(false);
    expect(traversal.error).toMatch(/path traversal/i);

    // Delete clears item dir.
    const del = await window.evaluate(async () => {
      const { ipcRenderer } = window.require('electron');
      return await ipcRenderer.invoke('mask-temp:delete', 'p1', 'g1', 'i1');
    });
    expect(del).toEqual({ ok: true });

    const read3 = await window.evaluate(async () => {
      const { ipcRenderer } = window.require('electron');
      return await ipcRenderer.invoke('mask-temp:read', 'p1', 'g1', 'i1');
    });
    expect(read3.manual).toBeNull();
    expect(read3.subtract).toBeNull();

    // Confirm session dir exists pre-quit.
    expect(fs.existsSync(tempDir)).toBe(true);
    expect(path.basename(tempDir)).toBe('cubric-' + sessionId);

    await app.close();

    // Post-quit: before-quit hook removes session dir.
    // Allow brief delay for fs to settle.
    await new Promise((r) => setTimeout(r, 500));
    expect(fs.existsSync(tempDir)).toBe(false);
  } finally {
    if (app.windows().length > 0) {
      await app.close().catch(() => {});
    }
  }
});

test('mask-temp: stale cubric-* dirs pruned at boot', async ({}, testInfo) => {
  // Plant a stale dir before launch.
  const stalePath = path.join(os.tmpdir(), 'cubric-stale-' + Date.now());
  fs.mkdirSync(stalePath, { recursive: true });
  fs.writeFileSync(path.join(stalePath, 'leftover.txt'), 'old');
  expect(fs.existsSync(stalePath)).toBe(true);

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

    // Confirm stale dir gone post-boot.
    expect(fs.existsSync(stalePath)).toBe(false);
  } finally {
    await app.close();
  }
});
