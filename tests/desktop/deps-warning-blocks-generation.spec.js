// MPI-673 / issue #2: a degraded local engine tells the user, and refuses the graph.
//
// The unit suite pins the wiring (the reason survives on `/comfy/status`, the start
// still starts, the gate exists). What it cannot run is the part the reporter actually
// experienced: an engine that answers `ready` while five node packs failed to import.
// This spec runs it — `/comfy/status` is stubbed to answer exactly what a degraded
// engine answers, and the two user-visible consequences are asserted on the real DOM
// and the real dispatch path.
//
// Nothing here starts an engine or dispatches a graph: `ensureServerRunning` takes its
// already-running-and-ready early return, and the gate throws before the workflow is
// even loaded.
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

test('a degraded engine opens the error dialog and blocks the generation', async ({}, testInfo) => {
  test.setTimeout(90000);
  const { app, window, pageErrors } = await launchApp(testInfo);

  try {
    const result = await window.evaluate(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const REASON = 'curated python deps FAILED: pip could not reach the index';

      const [{ localEngine }, { state }, { Events }] = await Promise.all([
        import('/js/services/comfyController.js'),
        import('/js/state.js'),
        import('/js/events.js'),
      ]);

      // Same boot-gate escape the other desktop specs use.
      Events.emit('engine:install-skipped');
      await sleep(300);

      // What a degraded engine answers: up, serving, and carrying the reason its
      // packages never installed.
      const realFetch = window.fetch;
      window.fetch = (input, init) => {
        const url = String(typeof input === 'string' ? input : input?.url || '');
        if (url.includes('/comfy/status')) {
          return Promise.resolve(new Response(
            JSON.stringify({ running: true, ready: true, needsRestart: false, depsWarning: REASON }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ));
        }
        return realFetch(input, init);
      };

      try {
        state.comfyDepsWarning = null;
        await localEngine.ensureServerRunning({ background: true });
        await sleep(300);

        const dialog = document.querySelector('.mpi-error-dialog');
        const announced = {
          mirrored: state.comfyDepsWarning,
          dialogOpen: Boolean(dialog),
          title: dialog?.querySelector('.mpi-error-dialog__title')?.textContent || '',
          message: dialog?.querySelector('.mpi-error-dialog__message')?.textContent || '',
        };

        // Announced on CHANGE: a second pass over the same warning must not reopen it.
        dialog?.remove();
        await localEngine.ensureServerRunning({ background: true });
        await sleep(200);
        const reopened = Boolean(document.querySelector('.mpi-error-dialog'));

        // The gate. A graph must never reach a degraded engine — that is the raw
        // `Node 'ClownsharKSampler' not found` the reporter saw.
        let blocked = null;
        try {
          await localEngine.runWorkflow('krea2_t2i_sfw', {});
          blocked = { code: null, message: 'runWorkflow RESOLVED — the graph was dispatched' };
        } catch (err) {
          blocked = { code: err?.code || null, message: err?.message || '' };
        }

        return { announced, reopened, blocked };
      } finally {
        window.fetch = realFetch;
        state.comfyDepsWarning = null;
        document.querySelector('.mpi-error-dialog')?.remove();
      }
    });

    expect(result.announced.mirrored).toContain('curated python deps FAILED');
    expect(result.announced.dialogOpen).toBe(true);
    expect(result.announced.title).toBe('Engine packages failed to install');
    expect(result.announced.message).toContain('could not be installed');
    expect(result.reopened).toBe(false);

    expect(result.blocked.code).toBe('python_deps_broken');
    expect(result.blocked.message).toContain('could not be installed');

    expect(pageErrors).toEqual([]);
  } finally {
    await closeApp(app);
  }
});
