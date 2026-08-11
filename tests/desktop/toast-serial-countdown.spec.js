// MPI-542: two toasts on screen, ONE countdown.
//
// Reading is serial. The stack shows two at a time (deliberate — a second toast you
// cannot see is a toast you will miss), but until this fix both ran their own timer
// from the moment they appeared. Live 2026-08-11, with durations newly scaled to the
// message length, Fabio finished the first toast and found the second already half
// gone: "I could only read half of the message."
//
// So the newer toast stays visible but does not start counting until the older one is
// gone. This spec pins that, plus the drain ORDER it depends on — a burst has to
// promote oldest-first, or the queue reads backwards. (_drainQueue took
// `queued[queued.length - 1]`, on a comment claiming column-reverse put the oldest
// last in the DOM. Toasts are appended, so the oldest is FIRST; column-reverse is a
// rendering direction and reorders nothing.)
//
// Timer state is read straight off the elements (_timerStarted / _timerRunning) —
// the alternative is inferring it from an in-flight CSS width transition, which is
// exactly the kind of measurement that goes flaky on a loaded CI box.
const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

test('a second toast does not start counting down until the first is gone', async ({}, testInfo) => {
  test.setTimeout(90000);
  const { app, window, consoleErrors, pageErrors } = await launchApp(testInfo);

  try {
    const result = await window.evaluate(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));

      const [{ Events }, { MpiToast }] = await Promise.all([
        import('/js/events.js'),
        import('/js/components/Primitives/MpiToast/MpiToast.js'),
      ]);

      // Same boot-gate escape the other desktop specs use.
      Events.emit('engine:install-skipped');
      await sleep(300);

      const DURATION = 800;
      for (const n of ['one', 'two', 'three', 'four']) {
        const wrap = document.createElement('div');
        document.body.appendChild(wrap);
        const t = MpiToast.mount(wrap, {
          message: `serial ${n}`,
          variant: 'info',
          duration: DURATION,
          sound: false,   // four chimes into a test run is nobody's idea of a good time
        });
        t.on('close', () => wrap.remove());
      }

      // DOM order is arrival order, so this reads oldest -> newest either way.
      const snap = () => [...document.querySelectorAll('.mpi-toast')]
        .filter(el => (el.textContent || '').includes('serial '))
        .map(el => ({
          name: (el.textContent.match(/serial (\w+)/) || [])[1],
          queued: el.classList.contains('mpi-toast--queued'),
          started: el._timerStarted === true,
          running: el._timerRunning === true,
        }));

      // Sample on the HANDOVER, never on a stopwatch. Each toast's turn begins when
      // the previous one ends, so fixed sleeps accumulate the close animation as drift
      // and land a sample a whole turn late — which is how the first run of this spec
      // failed, on a phase error rather than on the behaviour.
      const gone = async (name) => {
        for (let i = 0; i < 200; i++) {
          if (!snap().some(r => r.name === name)) return true;
          await sleep(25);
        }
        return false;
      };

      const out = {};
      await sleep(250);
      out.atStart = snap();

      out.firstLeft = await gone('one');
      out.afterFirst = snap();

      out.secondLeft = await gone('two');
      out.afterSecond = snap();

      out.allLeft = await gone('four');
      out.atEnd = snap();
      return out;
    });

    expect(result.firstLeft && result.secondLeft && result.allLeft,
      'a toast never left the stack within 5s of its 800ms window').toBe(true);

    // ── The whole point: exactly one countdown at any instant. ────────────────
    for (const [phase, rows] of Object.entries(result).filter(([, v]) => Array.isArray(v))) {
      const running = rows.filter(r => r.running).map(r => r.name);
      expect(running.length, `REGRESSION at ${phase}: ${running.length} toasts counting `
        + `down at once (${running.join(', ')}). A toast's window burns while the user is `
        + 'still reading the one before it — the defect this spec exists for.').toBeLessThan(2);
    }

    // Two visible, and only the OLDER one counting. The younger one is on screen the
    // whole time — this is not a one-at-a-time stack, it is a one-timer stack.
    const start = result.atStart;
    expect(start.map(r => r.name)).toEqual(['one', 'two', 'three', 'four']);
    expect(start.filter(r => !r.queued).map(r => r.name)).toEqual(['one', 'two']);
    expect(start.find(r => r.name === 'one').running).toBe(true);
    expect(start.find(r => r.name === 'two').started,
      'REGRESSION: the second visible toast started its own timer on arrival').toBe(false);

    // 'one' is gone; its turn passed to 'two'; 'three' was promoted into the free slot
    // — and 'three', not 'four', which is the FIFO drain.
    const afterFirst = result.afterFirst;
    expect(afterFirst.map(r => r.name)).toEqual(['two', 'three', 'four']);
    expect(afterFirst.find(r => r.name === 'two').running).toBe(true);
    expect(afterFirst.find(r => r.name === 'three').queued,
      'REGRESSION: the queue drained newest-first — a burst of toasts reads backwards').toBe(false);
    expect(afterFirst.find(r => r.name === 'three').started).toBe(false);
    expect(afterFirst.find(r => r.name === 'four').queued).toBe(true);

    const afterSecond = result.afterSecond;
    expect(afterSecond.map(r => r.name)).toEqual(['three', 'four']);
    expect(afterSecond.find(r => r.name === 'three').running).toBe(true);
    expect(afterSecond.find(r => r.name === 'four').started).toBe(false);

    // Everything drains. A turn that is never handed on is a permanently wedged stack.
    expect(result.atEnd, 'REGRESSION: toasts never drained — the countdown turn was '
      + 'taken by a toast that left without releasing it').toEqual([]);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  } finally {
    await closeApp(app);
  }
});
