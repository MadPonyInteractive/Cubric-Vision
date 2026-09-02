const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

/**
 * MPI-591 — a `hiddenWhen` on a STEP's field has to reach the DOM, not just the
 * pure function that computes it.
 *
 * Two units were already green and the control still showed. `hiddenFieldIds` was
 * right (tests/flow-field-constraints.test.cjs), the FlowDef declared the clause
 * (same file), and `_allDecls` deliberately walks step fields — but only
 * `_buildFlowFields` ever put its nodes in `_liveFields`, and the painter skips an
 * id it cannot find there IN SILENCE. So every `hiddenWhen` on a step field was a
 * no-op, and Extend Video shipped its `negative` box on the H3 arm, which is the
 * exact dead control the rule exists to remove. The Turbo toggle looked fine only
 * because it is declared flow-level.
 *
 * A synthetic FlowDef rather than `ltx-extend`, because filling the real one's media
 * slot needs a file on disk — but it copies the shape that matters EXACTLY: a GIZMO
 * step (`kind: 'preview'` with a role), not `kind: 'fields'`. That distinction is the
 * whole bug. A `fields`-kind step is rendered by `_buildFlowFields`, which always
 * registered its nodes, so a fixture built that way passes with the fix reverted —
 * measured, not assumed. Declaring no `inputSchema` is what keeps the media gate out
 * of it. The real declarations stay pinned by the unit test.
 */
// Electron boot (splash → local server → shell) plus the settle wait runs past the
// 30s default.
test.setTimeout(90000);

test('a step field obeys hiddenWhen, and the pick is what moves it', async ({}, testInfo) => {
  const { app, window } = await launchApp(testInfo);

  try {
    await window.waitForTimeout(6000);

    const result = await window.evaluate(async () => {
      const { MpiBaseFlow } = await import('/js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js');
      const { state } = await import('/js/state.js');

      const PICKED = 'model-alpha';
      const OTHER = 'model-beta';

      // No `inputSchema`, so slide 0 is "This flow needs no input media" and the
      // advance is ungated — the gate is not what this measures. The step still
      // carries a `kind` and a `role`, which is what routes its fields through
      // `_buildFieldsRow` rather than the flow-level stack.
      const flow = {
        id: 'mpi591-fixture',
        title: 'Fixture',
        description: 'Frame contract fixture.',
        requiredModels: [{ label: 'Model', models: [PICKED, OTHER] }],
        steps: [
          {
            kind: 'preview',
            role: 'video1',
            tickerLabel: 'Describe',
            title: 'Describe',
            fields: [
              { id: 'positive', type: 'text', rows: 2, label: 'Always here' },
              { id: 'negative', type: 'text', rows: 2, label: 'Only off the picked arm',
                hiddenWhen: { model: PICKED } },
            ],
          },
        ],
      };

      // MpiBaseFlow cannot be measured in a detached div (same recipe as
      // flow-step-gate.spec.js).
      const probe = async (installed) => {
        state.s_flowInputs = {};
        state.s_installedModelIds = installed;

        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:99999';
        document.body.appendChild(host);

        const inst = MpiBaseFlow.mount(document.createElement('div'), {
          flow, initialInputs: {},
        });
        host.appendChild(inst.el);
        inst.el.open?.();
        await new Promise(r => setTimeout(r, 400));

        [...inst.el.querySelectorAll('button')]
          .find(b => /next/i.test(b.className) || /next/i.test(b.getAttribute('aria-label') || ''))
          ?.click();
        await new Promise(r => setTimeout(r, 400));

        const row = inst.el.querySelector('.mpi-base-flow__fields');
        // `hidden` alone would pass on a node the painter never touched if the CSS
        // happened to collapse it, and offsetHeight alone cannot tell "hidden" from
        // "not rendered". Both, plus the count, or the assertion is weaker than the bug.
        const read = (label) => {
          const wrap = [...(row?.children || [])]
            .find(w => (w.textContent || '').includes(label));
          return wrap ? { hidden: wrap.hidden, h: wrap.offsetHeight } : null;
        };

        const out = {
          fields: row ? row.children.length : 0,
          always: read('Always here'),
          ruled: read('Only off the picked arm'),
        };

        inst.el.destroy?.();
        host.remove();
        state.s_flowInputs = {};
        return out;
      };

      return {
        onPicked: await probe([PICKED]),
        onOther: await probe([OTHER]),
      };
    });

    // Both fields mount either way — hiding is a paint, not a missing declaration.
    expect(result.onPicked.fields).toBe(2);
    expect(result.onOther.fields).toBe(2);

    // The picked arm: the ruled field is off screen, its sibling is not.
    expect(result.onPicked.ruled).toEqual({ hidden: true, h: 0 });
    expect(result.onPicked.always.hidden).toBe(false);
    expect(result.onPicked.always.h).toBeGreaterThan(0);

    // The other arm: the same field is back, so the rule tracks the pick rather than
    // hiding the control for good.
    expect(result.onOther.ruled.hidden).toBe(false);
    expect(result.onOther.ruled.h).toBeGreaterThan(0);
  } finally {
    await closeApp(app);
  }
});
