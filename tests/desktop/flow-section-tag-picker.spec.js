const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

/**
 * MPI-664 — typing `@` in the Lyrics box offers MiniMax's nine section tags.
 *
 * 🔴 THE DOM HALF IS WHERE THIS BREAKS, WHICH IS WHY IT IS DRIVEN FOR REAL. The unit
 * tests cover `spliceMentionTag` and the declaration; neither would have caught what
 * actually shipped to Fabio's screen last time this popup was wired — `MpiButton` was
 * handed `label` instead of `text`, `label` belongs to the icon mode, and the picker
 * opened with three real, styled, EMPTY rows. So this spec asserts the rows have TEXT,
 * not merely that they exist.
 *
 * The list is read from the SHIPPED FlowDef rather than retyped here: a fixture list
 * would pass while the real declaration was empty.
 *
 * The two things a section tag must get right, both of them silent when wrong:
 *   - SQUARE brackets. The picker this replaced inserted `<Singer A>`, and
 *     `Strip_Voice_Markers` cuts every `<…>` run before the encoder — two live runs
 *     followed that hint for nothing.
 *   - ITS OWN LINE. Every line outside a `[section]` tag is sung, so a tag sharing a
 *     line with words changes what the encoder is handed.
 */
// Electron boot (splash -> local server -> shell) plus the settle wait runs past the
// 30s default.
test.setTimeout(90000);

test('typing @ in the Lyrics box inserts a bracketed section tag on its own line', async ({}, testInfo) => {
  const { app, window } = await launchApp(testInfo);

  try {
    await window.waitForTimeout(6000);

    const result = await window.evaluate(async () => {
      const { MpiBaseFlow } = await import('/js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js');
      const { state } = await import('/js/state.js');
      const flowsMod = await import('/js/data/flowsRegistry.js');

      // The REAL declaration, so an empty or renamed `tags` fails here rather than
      // passing against a copy of itself.
      const flows = flowsMod.FLOWS || flowsMod.flows || flowsMod.default;
      const song = flows.find(f => f.id === 'minimax-music');
      const songStep = (song.steps || []).find(s => (s.fields || []).some(f => f.id === 'Input_Lyrics'));
      const tags = (songStep.fields || []).find(f => f.id === 'Input_Lyrics').tags;

      // A `fields`-kind step with no `inputSchema`, so nothing gates the mount on a
      // media file or on 13GB of weights being installed. Same fixture shape the roster
      // spec uses.
      const flow = {
        id: 'mpi664-tag-picker-fixture',
        title: 'Tag picker fixture',
        description: 'Frame contract fixture.',
        steps: [
          {
            kind: 'fields',
            role: 'song',
            tickerLabel: 'Write',
            title: 'Write',
            fields: [{ id: 'Input_Lyrics', type: 'text', rows: 6, label: 'Lyrics', default: '', tags }],
          },
        ],
      };

      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:99999';
      document.body.appendChild(host);

      state.s_flowInputs = {};
      const inst = MpiBaseFlow.mount(document.createElement('div'), { flow, initialInputs: {} });
      host.appendChild(inst.el);
      inst.el.open?.();
      await new Promise(r => setTimeout(r, 500));
      // Slide 0 is the flow's own intro; the declared step is the next one.
      [...inst.el.querySelectorAll('button')]
        .find(b => /next/i.test(b.className) || /next/i.test(b.getAttribute('aria-label') || ''))
        ?.click();
      await new Promise(r => setTimeout(r, 500));

      const ta = inst.el.querySelector('textarea');
      if (!ta) return { error: 'no textarea mounted' };

      // Half a tag, typed mid-line, with a trailing space before the `@` — the case
      // that has to lose the space AND gain a newline.
      ta.focus();
      ta.value = 'hold me close @pre';
      ta.setSelectionRange(ta.value.length, ta.value.length);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 250));

      const picker = inst.el.querySelector('.mpi-base-flow__mention-picker');
      const rows = [...inst.el.querySelectorAll('.mpi-base-flow__mention-picker-item')];
      const open = { hidden: !picker || picker.classList.contains('hide') };
      // The `label`-vs-`text` bug rendered rows with no text and no height.
      const rowText = rows.map(b => (b.textContent || '').trim());
      const rowHeights = rows.map(b => b.getBoundingClientRect().height);

      // mousedown, not click: the picker listens on mousedown because the textarea
      // blurs on click and blur closes it first.
      rows[0]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await new Promise(r => setTimeout(r, 250));

      const inserted = ta.value;
      const closedAfterPick = inst.el
        .querySelector('.mpi-base-flow__mention-picker')?.classList.contains('hide');

      // ── the popup follows the caret (Fabio, 2026-09-12) ────────────────────
      // Two `@` on DIFFERENT LINES at different columns. The popup must move between
      // them; pinned to the box's corner it would report the same box twice, which is
      // exactly what the old `bottom: 100%; left: 0` did.
      const anchorAt = async (text) => {
        ta.value = text;
        ta.setSelectionRange(text.length, text.length);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 200));
        const p = inst.el.querySelector('.mpi-base-flow__mention-picker');
        const box = p.getBoundingClientRect();
        return { hidden: p.classList.contains('hide'), x: Math.round(box.left), y: Math.round(box.top) };
      };
      const anchorA = await anchorAt('@ver');
      const anchorB = await anchorAt('one\ntwo\nthree\nfour\nfive and a longer line here @ver');

      // A word the model does not know must not open a popup at all.
      ta.value = 'hold me close @zzz';
      ta.setSelectionRange(ta.value.length, ta.value.length);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 250));
      const unknownOpens = !inst.el
        .querySelector('.mpi-base-flow__mention-picker')?.classList.contains('hide');

      inst.el.destroy?.();
      host.remove();
      state.s_flowInputs = {};

      return {
        declared: tags.map(t => t.tag), open, rowText, rowHeights, inserted,
        closedAfterPick, unknownOpens, anchorA, anchorB,
      };
    });

    expect(result.error).toBeUndefined();

    // The fixture has to have worked, or nothing below proves anything.
    expect(result.declared).toContain('Pre-Chorus');
    expect(result.open.hidden).toBe(false);

    // `@pre` narrows the nine to the one. If this ever returns every tag, the query is
    // no longer filtering and the picker is a nine-row menu the user must read.
    expect(result.rowText).toEqual(['Pre-Chorus']);

    // 🔴 THE BUG THAT SHIPPED. Real buttons, real classes, zero text and zero height.
    expect(result.rowHeights.every(h => h > 0)).toBe(true);

    // SQUARE brackets, own line, trailing space before the `@` dropped.
    expect(result.inserted).toBe('hold me close\n[Pre-Chorus]\n');

    expect(result.closedAfterPick).toBe(true);

    // 🔴 THE POPUP FOLLOWS THE CARET. Pinned to the box corner both anchors would be the
    // same point — which is what shipped first, and why a popup could open metres from the
    // `@` on a 16-row Lyrics box. Both coordinates must move: five lines down and far along.
    expect(result.anchorA.hidden).toBe(false);
    expect(result.anchorB.hidden).toBe(false);
    expect(result.anchorB.y).toBeGreaterThan(result.anchorA.y);
    expect(result.anchorB.x).toBeGreaterThan(result.anchorA.x);

    expect(result.unknownOpens).toBe(false);
  } finally {
    await closeApp(app);
  }
});
