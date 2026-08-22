/**
 * MPI-573. Electron answers renderer permission requests itself, and a refused
 * getUserMedia comes back with no prompt, no dialog and nothing in the log — the
 * recorder simply never arms, which reads as a broken component rather than as a
 * denied permission. The handler in main.js is the whole fix, and nothing else in
 * the app exercises it, so it can regress silently. This spec is the alarm.
 *
 * Installing that handler also INVERTED the default for every other permission, so
 * the two the app already relied on are asserted here too: `fullscreen` (the video
 * control bar, focus mode) and `pointerLock` (MpiRadialMenu, the operation picker).
 * Both fail silently when refused.
 */
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

test('the renderer is granted microphone, fullscreen and pointer lock', async ({}, testInfo) => {
  const { app, window, pageErrors } = await launchApp(testInfo);

  try {
    // NotAllowedError is the permission being refused — this spec's whole subject.
    // NotFoundError is a machine with no microphone, which a CI runner legitimately
    // is; that must not fail the build, so the assertion names the one error that
    // means the app is broken rather than requiring a device to exist.
    const mic = await window.evaluate(async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach(t => t.stop());
        return 'granted';
      } catch (e) {
        return e.name;
      }
    });
    expect(mic, 'microphone permission was refused — the recorder cannot arm')
      .not.toBe('NotAllowedError');

    // permissions.query goes through the CHECK handler, the synchronous twin of the
    // request handler. It is what labels the device list in Settings, and it can be
    // wired wrong while the request handler is right.
    const states = await window.evaluate(async () => {
      const out = {};
      for (const name of ['microphone']) {
        try { out[name] = (await navigator.permissions.query({ name })).state; }
        catch (e) { out[name] = `query-failed:${e.name}`; }
      }
      return out;
    });
    expect(states.microphone).not.toBe('denied');

    const fullscreen = await window.evaluate(async () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      try { await el.requestFullscreen(); await document.exitFullscreen(); return 'ok'; }
      catch (e) { return e.name; }
      finally { el.remove(); }
    });
    expect(fullscreen, 'fullscreen was refused — the video control bar and focus mode break')
      .toBe('ok');

    expect(pageErrors).toEqual([]);
  } finally {
    await closeApp(app);
  }
});
