const fs = require('fs');
const { test, expect, _electron: electron } = require('@playwright/test');
const { shellWindow, SHELL_URL_RE } = require('./shellWindow');

// MPI-644 — a flow must refuse to leave its input slide with nothing in it.
//
// Until this gate, every media slot rendered as optional (`upto` is the only media
// mode there is), so a user could walk the whole carousel with an empty slot and only
// meet the refusal at Generate, several slides later. The refusal itself already
// worked — `findMissingMediaSlot` runs at enqueue AND dispatch (MPI-607) — so this is
// about WHEN the user is told, not about learning what is missing.
//
// Both halves are pinned here, because a gate that only refuses is easy to write and
// wrong: a middle step can CREATE the media that fills the slot, at run time, AFTER
// the boundary being guarded. Scribble is exactly that — its slot reads "Drawing
// (optional)" and a blank canvas plus one stroke derives `image1` — so a naive
// "slot empty → block" check kills the flow's whole point. `_stepDerivesOwnMedia`
// (a step declaring `composite`) is the escape, and the second half below defends it.
test('a flow with an empty required slot refuses to advance, unless a step derives it', async ({}, testInfo) => {
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
      const { MpiBaseFlow } = await import('/js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js');
      const { getFlowById } = await import('/js/data/flowsRegistry.js');
      const { Events } = await import('/js/events.js');
      const { state } = await import('/js/state.js');

      const probe = async (flowId) => {
        // `seeded` prefers `state.s_flowInputs[flow.id]` over `initialInputs`, so a
        // stray persisted slot would fill the very thing this test needs empty.
        state.s_flowInputs = {};

        const warnings = [];
        const off = Events.on('ui:warning', p => warnings.push(p?.message));

        // MpiBaseFlow cannot be measured in a detached div, and the shell's `flow:open`
        // path gives a 0x0 overlay with no project open — mount, then append into a
        // fixed, fully sized host (same recipe as flow-clear-slot-advances.spec.js).
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:99999';
        document.body.appendChild(host);

        const inst = MpiBaseFlow.mount(document.createElement('div'), {
          flow: getFlowById(flowId),
          initialInputs: {},
        });
        host.appendChild(inst.el);
        inst.el.open?.();
        await new Promise(r => setTimeout(r, 400));

        const activeIdx = () => [...inst.el.querySelectorAll('[aria-current]')]
          .findIndex(t => t.getAttribute('aria-current') === 'step');

        const out = { start: activeIdx() };

        [...inst.el.querySelectorAll('button')]
          .find(b => /next/i.test(b.className) || /next/i.test(b.getAttribute('aria-label') || ''))
          ?.click();
        await new Promise(r => setTimeout(r, 400));

        out.afterNext = activeIdx();
        out.warnings = warnings;

        off?.();
        inst.el.destroy?.();
        host.remove();
        state.s_flowInputs = {};
        return out;
      };

      // Outpaint: `image1` is required and NO step derives it, so the advance is refused.
      // Scribble: `image1` is equally required, but its paint step is `composite` and
      // fills the slot at run time, so the advance must go through.
      return { gated: await probe('outpaint'), derives: await probe('scribble') };
    });

    // THE GATE. Still on the input slide, and told why.
    expect(result.gated.start).toBe(0);
    expect(result.gated.afterNext).toBe(0);
    // Generic by request (Fabio, 2026-08-28) — the flow surface must NOT name the media
    // type. `_warnMissingMediaSlot`'s "Add an image before generating…" is the PromptBox
    // copy, and seeing it here means the flow fell through to the dispatch guard instead.
    expect(result.gated.warnings).toEqual(['You need to add inputs to this flow.']);

    // THE ESCAPE. A blank-canvas Scribble is a legal run, so it advances and says nothing.
    expect(result.derives.start).toBe(0);
    expect(result.derives.afterNext).toBe(1);
    expect(result.derives.warnings).toEqual([]);
  } finally {
    await app.close();
  }
});
