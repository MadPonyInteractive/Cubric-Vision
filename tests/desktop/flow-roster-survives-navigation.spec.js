const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

/**
 * MPI-664 — a voice ROSTER must survive leaving the flow and coming back.
 *
 * Fabio, 2026-09-11, mid-Song: he created two voices, typed his lyrics, pressed Tab and
 * landed in the gallery (a separate bug, since fixed). *"When I came back, my singers
 * were gone, but I still had the lyrics on."* He then generated on a one-voice roster,
 * which is why the run came back with a single male singer and proved nothing about the
 * cast the enhancer had just been taught to read.
 *
 * THE ASYMMETRY IS THE WHOLE CLUE, so this fixture reproduces it rather than the roster
 * alone: a `voices` field and a `text` field in the SAME step, both filled, both carried
 * through one destroy/remount. A string round-trips through anything; the roster is the
 * one field type whose UI value (rows, so Reuse can rebuild the control) is not its graph
 * value (one `Voice N (Type)` string, via `serialiseVoices`). That serialiser has no
 * inverse, and `_seedField` reads `persisted ?? root ?? default` where `root` is
 * `injectionParams[id]` for any `Input_*` id — the flattened string. If the raw rows in
 * `stepValues` ever fail to win that race, `declaredFields.js` gets handed a string,
 * `Array.isArray(cur)` is false, and the branch falls to `f.default` AND writes that
 * default back over the user's cast.
 *
 * Destroy + remount from `state.s_flowInputs` IS what navigation does — the shell
 * destroys the instance and the next open seeds from session scratch. So this is the real
 * path, not an approximation of it.
 */
// Electron boot (splash -> local server -> shell) plus the settle wait runs past the
// 30s default.
test.setTimeout(90000);

test('a voice roster and a text field both survive a close and reopen', async ({}, testInfo) => {
  const { app, window } = await launchApp(testInfo);

  try {
    await window.waitForTimeout(6000);

    const result = await window.evaluate(async () => {
      const { MpiBaseFlow } = await import('/js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js');
      const { state } = await import('/js/state.js');

      // A `fields`-kind step with no `inputSchema`, so nothing gates the mount on a
      // media file. Both ids are `Input_*` on purpose: that prefix is what routes a
      // value into `injectionParams`, and the injectionParams copy is the flattened
      // one. A non-prefixed id would dodge the very path under test.
      const flow = {
        id: 'mpi664-roster-fixture',
        title: 'Roster fixture',
        description: 'Frame contract fixture.',
        steps: [
          {
            kind: 'fields',
            role: 'song',
            tickerLabel: 'Write',
            title: 'Write',
            fields: [
              {
                id: 'Input_Voices', type: 'voices', label: 'Voices',
                default: [{ type: 'Any' }],
                options: [
                  { v: 'Any', label: 'Any' },
                  { v: 'Female', label: 'Female' },
                  { v: 'Male', label: 'Male' },
                ],
              },
              { id: 'Input_Lyrics', type: 'text', rows: 4, label: 'Lyrics', default: '' },
            ],
          },
        ],
      };

      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:99999';
      document.body.appendChild(host);

      const open = async () => {
        const inst = MpiBaseFlow.mount(document.createElement('div'), { flow, initialInputs: {} });
        host.appendChild(inst.el);
        inst.el.open?.();
        await new Promise(r => setTimeout(r, 500));
        // Slide 0 is the flow's own intro; the declared step is the next one. Same
        // advance the hiddenWhen spec makes.
        [...inst.el.querySelectorAll('button')]
          .find(b => /next/i.test(b.className) || /next/i.test(b.getAttribute('aria-label') || ''))
          ?.click();
        await new Promise(r => setTimeout(r, 500));
        return inst;
      };

      // The roster is DROPDOWNS now, one per row, so the observable is each row's
      // selected type rather than a typed name (MPI-664, 2026-09-12). MpiDropdown is a
      // Primitive, not a native select, so the trigger label IS the selection.
      const rosterTypes = root => [...root.querySelectorAll(
        '.mpi-base-flow__field-voices .mpi-dropdown__label',
      )].map(n => (n.textContent || '').trim());

      state.s_flowInputs = {};

      // ── first visit: cast two voices and write a line ──────────────────────
      let inst = await open();

      const addBtn = [...inst.el.querySelectorAll('button')]
        .find(b => /add a voice/i.test(b.textContent || ''));
      addBtn?.click();
      await new Promise(r => setTimeout(r, 250));

      // Cast the second voice the way he did, now through its dropdown. Open the
      // trigger, click the option: the widget reports on `change` and mutates the row
      // in place without repainting, so this is the real user path.
      const rows = [...inst.el.querySelectorAll('.mpi-base-flow__field-voices .mpi-dropdown')];
      if (rows[1]) {
        rows[1].querySelector('.mpi-dropdown__trigger')?.click();
        await new Promise(r => setTimeout(r, 150));
        const female = [...document.querySelectorAll('.mpi-dropdown__list [role="option"], .mpi-dropdown__option')]
          .find(o => /^female$/i.test((o.textContent || '').trim()));
        female?.click();
        await new Promise(r => setTimeout(r, 150));
      }

      const lyrics = inst.el.querySelector('textarea');
      if (lyrics) {
        lyrics.value = '[Intro]\nI keep on going on.';
        lyrics.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await new Promise(r => setTimeout(r, 300));

      const before = { types: rosterTypes(inst.el), lyrics: lyrics ? lyrics.value : null };

      // ── navigation: destroy flushes the snapshot, exactly as the shell does ──
      inst.el.destroy?.();
      inst.el.remove();
      await new Promise(r => setTimeout(r, 300));

      const snapshot = JSON.parse(JSON.stringify(state.s_flowInputs?.[flow.id] ?? null));

      // ── second visit: the flow reopens and seeds from session scratch ───────
      inst = await open();
      const after = {
        types: rosterTypes(inst.el),
        lyrics: (inst.el.querySelector('textarea') || {}).value ?? null,
      };

      inst.el.destroy?.();
      host.remove();
      state.s_flowInputs = {};

      return { before, after, snapshot };
    });

    // The fixture has to have worked, or the assertions below prove nothing.
    expect(result.before.types).toEqual(['Any', 'Female']);

    // 🔴 THE SNAPSHOT IS WHERE THE DIAGNOSIS LIVES, so it is asserted rather than logged.
    // The step store holds the SEEDED DEFAULTS and never the live edits, because a
    // FRAME-kind step (`fields`) puts its ids in the flow store and `_writeDeclaredField`
    // then skips `_stepValues` entirely - while the seeding loop populates it regardless.
    // So `stepValues` is a write-once shadow, and the value that actually comes back is
    // the `injectionParams` one: SERIALISED. That is the shape the widget must cope with.
    expect(result.snapshot.injectionParams.Input_Voices).toBe('Voice 1\nVoice 2 (Female)');
    expect(result.snapshot.stepValues.song.fields.Input_Voices)
      .toEqual([{ type: 'Any' }]);

    // The text field is the CONTROL in this experiment - a string is its own restore
    // shape, so it was never at risk. If it ever stops surviving, the bug is not
    // roster-specific and this line says so before the next one misleads anyone.
    expect(result.after.lyrics).toBe(result.before.lyrics);

    // THE BUG: before the fix this came back as the one-voice default and the default was
    // written back over the cast. Fabio then generated on it and heard a single singer.
    expect(result.after.types).toEqual(['Any', 'Female']);
  } finally {
    await closeApp(app);
  }
});
