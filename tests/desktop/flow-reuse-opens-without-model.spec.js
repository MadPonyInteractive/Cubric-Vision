const fs = require('fs');
const { test, expect, _electron: electron } = require('@playwright/test');
const { shellWindow, SHELL_URL_RE } = require('./shellWindow');

// MPI-620 — Reuse on a flow card must ALWAYS open the flow, whatever is installed.
//
// This guards a REVERSAL, which is why it is pinned rather than left to review. The
// obvious instinct — "the model is missing, don't open a flow that can't run" — is what
// `openFlowFromReuse` used to do: `flowAvailability()` failed, the user got a warning and
// was bounced to the Flow Library, and the flow never mounted. Because the saved
// `flowInputs` are only restored ON MOUNT, that refusal silently threw away the user's
// work — and for Scribble the input IS their drawing. Fabio's call: "He should be able to
// reuse it anyway ... This way he doesn't lose his drawing."
//
// A tier that is gone is a SUBSTITUTION, not a failure: `flowModelIds` already resolves a
// card made on klein-9b to klein-4b when only 4B is installed. So the outcome is a toast
// over the open flow, and nothing is ever refused.
//
// Driven in the real renderer because the two halves live in different modules: the seed
// + open is `flowService`, and the ERROR-LEVEL TOAST only exists if `statusBar` listens on
// `ui:danger` (`ui:error` is the blocking dialog, not a toast). A node test can see
// neither. `s_installedModelIds` is stubbed rather than installing weights.
test('reuse opens a flow whose model is missing, keeps the inputs, and toasts', async ({}, testInfo) => {
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
      const { openFlowFromReuse } = await import('/js/services/flowService.js');
      const { state } = await import('/js/state.js');
      const { Events } = await import('/js/events.js');

      // MPI-647: `shell.js`'s `models:checked` listener is the ONLY writer of
      // `s_installedModelIds` and it refreshes asynchronously from the backend. On a
      // runner with no weights it resolves to [] and can land inside the 80ms window
      // below — after the stub, before the deferred toast reads it — which is how this
      // spec reddened master and then reran green on the identical commit. Re-apply the
      // stub from a listener registered AFTER shell's: `Events` fans out over an
      // insertion-ordered Set synchronously, so the refresh is overwritten inside its own
      // emit, before any deferred reader can see it. This suppresses the race rather than
      // outrunning it — widening the sleep would only move the flake.
      let stubbed = null;
      const unstub = Events.on('models:checked', () => {
        if (stubbed) state.s_installedModelIds = stubbed;
      });

      const run = async (installed, recorded) => {
        const seen = [];
        const unsubs = [
          Events.on('ui:warning', p => seen.push({ kind: 'warning', message: p.message })),
          Events.on('ui:danger', p => seen.push({ kind: 'danger', message: p.message })),
          Events.on('flow:open', p => seen.push({ kind: 'open', flowId: p.flowId })),
          Events.on('flows:open', () => seen.push({ kind: 'library' })),
        ];
        stubbed = installed;
        state.s_installedModelIds = installed;
        state.s_flowInputs = {};
        const handled = openFlowFromReuse({
          flowId: 'scribble',
          flowInputs: { positive: 'a cliff' },
          generationSettings: { flowModelIds: recorded },
        });
        // MPI-647: provoke the CI condition instead of waiting for it. This is exactly
        // what the boot refresh emits on a machine with no weights installed, and it is
        // synchronous, so it lands in the worst possible place — after the stub, before
        // the deferred read. Waiting cannot reproduce it here: the real models ARE
        // installed on a dev box, so the refresh never resolves empty. Without the
        // re-stub above, this fails `legacyCard` on every run.
        Events.emit('models:checked', { installedModelIds: [] });
        // The open + toast are deferred one tick on purpose (the reuse menu's teardown
        // fires a bare `ui:close-all-popups` that would otherwise eat the overlay).
        await new Promise(r => setTimeout(r, 80));
        unsubs.forEach(u => u());
        return { handled, restored: state.s_flowInputs?.scribble?.positive ?? null, seen };
      };

      const cases = {
        substituted: await run(['klein-4b'], ['klein-9b']),
        nothingInstalled: await run([], ['klein-9b']),
        sameTier: await run(['klein-9b'], ['klein-9b']),
        legacyCard: await run(['klein-4b'], undefined),
      };
      unstub();
      return cases;
    });

    for (const [name, r] of Object.entries(result)) {
      expect(r.handled, `${name}: reuse must handle a flow card`).toBe(true);
      // The whole point: opened, with the drawing intact, and NEVER redirected.
      expect(r.seen.filter(e => e.kind === 'open').map(e => e.flowId), `${name}: must open the flow`).toEqual(['scribble']);
      expect(r.restored, `${name}: saved inputs must be restored`).toBe('a cliff');
      expect(r.seen.some(e => e.kind === 'library'), `${name}: must NOT bounce to the Flow Library`).toBe(false);
    }

    // A different tier will run — name BOTH, or the user cannot tell what changed.
    const swap = result.substituted.seen.find(e => e.kind === 'warning');
    expect(swap, 'a substituted tier must warn').toBeTruthy();
    expect(swap.message).toContain('FLUX.2 Klein 4B');
    expect(swap.message).toContain('FLUX.2 Klein 9B');

    // Nothing installed is error-level, and it must still say the inputs survived.
    const dead = result.nothingInstalled.seen.find(e => e.kind === 'danger');
    expect(dead, 'no installed candidate must raise a danger toast').toBeTruthy();
    expect(dead.message).toContain('Flows');

    // Silence when the recorded tier still runs, and when the card predates the record —
    // a pre-MPI-620 card must never be guessed at from weight filenames.
    expect(result.sameTier.seen.filter(e => e.kind !== 'open'), 'same tier must be silent').toEqual([]);
    expect(result.legacyCard.seen.filter(e => e.kind !== 'open'), 'an unrecorded card must be silent').toEqual([]);
  } finally {
    await app.close();
  }
});
