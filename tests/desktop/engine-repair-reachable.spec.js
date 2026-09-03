// MPI-674 / issue #2: a degraded engine has a repair a RELEASE build can reach.
//
// This is the half MPI-673 could not promise. Its dialog originally said only that the
// install "is retried every time the engine starts fresh" — true, and unreachable: the
// one restart control lives on the dev-only Ctrl+Tab radial, and a restart alone cannot
// get past a stamped curated-deps marker anyway (`ensureCuratedPythonDeps` skips on a
// match, so packages lost after a successful pass are never reinstalled).
//
// The unit suite pins the route, the marker-before-stop ordering and the wiring. What it
// cannot run is whether the control is actually THERE and actually calls it. This spec
// mounts the real Settings component on a real Electron shell and drives the button.
//
// Nothing here starts, stops or repairs an engine: `/engine/repair-python-deps` is
// stubbed, and the restart that would follow it is never reached.
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

test('a degraded engine gets a Repair engine control in Settings, and it calls the repair', async ({}, testInfo) => {
  test.setTimeout(90000);
  const { app, window, pageErrors } = await launchApp(testInfo);

  try {
    const result = await window.evaluate(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const REASON = 'custom node packs failed to import: RES4LYF, comfyui-videohelpersuite';

      const [{ MpiSettings }, { state }, { Events }] = await Promise.all([
        import('/js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js'),
        import('/js/state.js'),
        import('/js/events.js'),
      ]);

      Events.emit('engine:install-skipped');
      await sleep(300);

      const realFetch = window.fetch;
      const calls = [];
      window.fetch = (input, init) => {
        const url = String(typeof input === 'string' ? input : input?.url || '');
        if (url.includes('/engine/repair-python-deps')) {
          calls.push({ url, method: init?.method || 'GET' });
          return Promise.resolve(new Response(JSON.stringify({ success: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        // The engine's queue: idle, so the repair's pre-flight guard lets it through.
        if (url.includes('/queue')) {
          return Promise.resolve(new Response(JSON.stringify({ queue_running: [], queue_pending: [] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return realFetch(input, init);
      };

      const host = document.createElement('div');
      document.body.appendChild(host);
      let inst = null;

      try {
        // ── A healthy engine gets no section at all ──────────────────────────
        state.comfyDepsWarning = null;
        inst = MpiSettings.mount(host);
        inst.el.onOpen();
        await sleep(300);
        const healthySection = inst.el.querySelector('#mpiSettingsEngineHealthSection');
        const whenHealthy = {
          present: Boolean(healthySection),
          hidden: healthySection?.hidden,
          // The PROPERTY is not the question — `hidden` is a UA rule and the section
          // carries an author `display:flex`, which beat it silently. Ask the pixels.
          display: healthySection ? getComputedStyle(healthySection).display : null,
        };

        // ── A degraded engine gets the section, the reason, and the button ───
        state.comfyDepsWarning = REASON;
        inst.el.onOpen();
        await sleep(300);
        const section = inst.el.querySelector('#mpiSettingsEngineHealthSection');
        const button = section?.querySelector('#mpiSettingsEngineHealthSlot button');
        const whenDegraded = {
          hidden: section?.hidden,
          // The WHOLE section's text, so the no-jargon assertion below cannot be
          // dodged by moving an identifier into a different element.
          text: section?.textContent || '',
          buttonLabel: button?.textContent?.trim() || '',
        };

        // ── Pressing it reaches the repair route ────────────────────────────
        button?.click();
        await sleep(600);

        return {
          whenHealthy,
          whenDegraded,
          calls,
          // The button must stop being clickable for the whole pass — a second
          // repair would kill the engine the first one is waiting on.
          disabledAfterClick: button?.hasAttribute('disabled'),
          labelAfterClick: button?.textContent?.trim() || '',
        };
      } finally {
        window.fetch = realFetch;
        state.comfyDepsWarning = null;
        inst?.el?.destroy?.();
        host.remove();
      }
    });

    // Healthy: the row exists in the template but must never be shown.
    expect(result.whenHealthy.present).toBe(true);
    expect(result.whenHealthy.hidden).toBe(true);
    // MPI-685: the assertion that was missing. `hidden` was true the whole time in 1.4.3
    // while the section sat on screen, because `.mpi-settings__section` sets
    // `display:flex` and an author rule beats the UA `[hidden]` one. Every healthy
    // install was told "Part of the engine did not install" over an empty row, and this
    // suite was green. Assert what the user sees, not what the DOM claims.
    expect(result.whenHealthy.display).toBe('none');

    // Degraded: shown, with the control.
    expect(result.whenDegraded.hidden).toBe(false);
    expect(result.whenDegraded.buttonLabel).toBe('Repair engine');

    // And it says NOTHING a user did not ask for. `state.comfyDepsWarning` is a
    // developer string — the node packs that failed to import, or a raw pip error —
    // and it used to be rendered straight onto this row. This is an artist's app: what
    // broke internally belongs in app.log, which "Show log file" already reaches.
    // (User call, 2026-09-01.) Asserted on the section's whole text, so a future edit
    // cannot smuggle an identifier back in through a different element.
    for (const jargon of ['RES4LYF', 'videohelpersuite', 'custom node', 'Python', 'pip', 'import']) {
      expect(result.whenDegraded.text).not.toContain(jargon);
    }

    // And it actually repairs — this is the assertion the whole card exists for.
    expect(result.calls).toEqual([
      { url: expect.stringContaining('/engine/repair-python-deps'), method: 'POST' },
    ]);
    expect(result.disabledAfterClick).toBe(true);
    expect(result.labelAfterClick).toBe('Repairing…');

    expect(pageErrors).toEqual([]);
  } finally {
    await closeApp(app);
  }
});
