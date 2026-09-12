const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

/**
 * MPI-727 — a Flow's result follows the user across steps, and it keeps playing.
 *
 * Fabio generated a song, pressed play on the last step, then stepped back to read his
 * lyrics while it played. The song stopped, and coming back the player was gone: the run
 * slide is rebuilt on every navigation, so the `<audio>` element left the DOM with it.
 *
 * THE SOURCE CONTRACTS IN `tests/flow-result-dock.test.cjs` CANNOT PROVE THIS ONE. The
 * fix works only because the SAME node is moved rather than a new one built, and a fresh
 * `<audio>` with the same `src` is indistinguishable from the old one in everything a
 * regex, a screenshot or an accessibility tree can see. Only identity tells you — so
 * that is what this stamps and follows, in the real renderer, across two navigations.
 *
 * Playback is asserted alongside it, because identity is the MEANS and the sound is the
 * POINT: a removed media element is paused "once a stable state is reached", so a sync
 * that ever slipped behind a rAF would keep identity and still lose the sound.
 *
 * Driven off a fixture flow for the same reason the roster spec is: nothing here is
 * Song-specific, and a fixture with one `fields` step gives the three slides the gate
 * needs (inputs / step / run) with no media to satisfy.
 */
// Electron boot (splash -> local server -> shell) plus the settle waits runs past the
// 30s default.
test.setTimeout(90000);

test('an audio result rides the floating window across steps and never stops', async ({}, testInfo) => {
  const { app, window, pageErrors } = await launchApp(testInfo);

  try {
    await window.waitForTimeout(6000);

    const result = await window.evaluate(async () => {
      const { MpiBaseFlow } = await import('/js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js');
      const { state } = await import('/js/state.js');

      // Two seconds of a real tone as a data: URL — `resolveMediaUrl` passes `data:`
      // through untouched, so the element gets something that genuinely decodes and
      // genuinely plays. A fake src would make every `paused` assertion meaningless.
      const tone = (() => {
        const rate = 8000;
        const n = rate * 2;
        const buf = new ArrayBuffer(44 + n * 2);
        const dv = new DataView(buf);
        const w = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
        w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt ');
        dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
        dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true);
        dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
        w(36, 'data'); dv.setUint32(40, n * 2, true);
        for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.sin(i * 0.05) * 8000, true);
        let bin = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return 'data:audio/wav;base64,' + btoa(bin);
      })();

      // MpiBaseFlow HEAD-probes a seeded result on mount and forgets it when the file is
      // gone. `fetch` refuses any non-GET to a `data:` URL by spec, so without this the
      // fixture's result would be dropped before the first slide renders. Scoped to that
      // probe and restored at the end — nothing else in the app is redirected.
      const realFetch = window.fetch.bind(window);
      window.fetch = (url, opts) => (
        opts?.method === 'HEAD' && String(url).startsWith('data:')
          ? Promise.resolve({ ok: true })
          : realFetch(url, opts)
      );

      const flow = {
        id: 'mpi727-result-fixture',
        title: 'Result fixture',
        description: 'Frame contract fixture.',
        steps: [{
          kind: 'fields',
          role: 'song',
          tickerLabel: 'Write',
          title: 'Write',
          fields: [{ id: 'Input_Lyrics', type: 'text', rows: 4, label: 'Lyrics', default: '' }],
        }],
      };

      // Seeded the way Reuse seeds it — this is the card's second half in the same
      // breath as the first: the flow opens ALREADY holding a result.
      state.s_flowResults = {
        ...state.s_flowResults,
        [flow.id]: {
          items: [{ type: 'audio', mediaType: 'audio', url: tone }],
          mode: null, status: '', pending: false,
        },
      };
      state.s_flowInputs = {};

      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:99999';
      document.body.appendChild(host);

      const inst = MpiBaseFlow.mount(document.createElement('div'), { flow, initialInputs: {} });
      host.appendChild(inst.el);
      inst.el.open?.();
      await new Promise(r => setTimeout(r, 600));

      const dockAudio = () => inst.el.querySelector('.mpi-flow-result-dock__media audio');
      const paneAudio = () => inst.el.querySelector('.mpi-base-flow__result-media audio');
      const dockOpen = () => !!inst.el.querySelector('.mpi-flow-result-dock--open');
      const step = async (id) => {
        inst.el.querySelector(id)?.click();
        await new Promise(r => setTimeout(r, 400));
      };

      // ── step 0: the seeded result is already in the floating window ─────────
      const onOpen = { dockOpen: dockOpen(), hasDockAudio: !!dockAudio(), hasPaneAudio: !!paneAudio() };

      // Stamp the node and start it. Everything below follows this exact object.
      const stamped = dockAudio();
      if (stamped) stamped.dataset.mpi727 = 'the-one';
      let playError = null;
      try { await stamped?.play(); } catch (e) { playError = String(e); }
      await new Promise(r => setTimeout(r, 300));
      const afterPlay = { paused: stamped ? stamped.paused : null, t: stamped ? stamped.currentTime : null };

      // ── forward to the run slide: the window closes, the PANE takes the node ─
      await step('#flow-next');
      await step('#flow-next');
      const onRunSlide = {
        dockOpen: dockOpen(),
        hasDockAudio: !!dockAudio(),
        // IDENTITY. Not "an audio element is present" — the SAME one.
        sameNode: !!paneAudio() && paneAudio() === stamped,
        stamp: paneAudio()?.dataset.mpi727 ?? null,
        paused: stamped ? stamped.paused : null,
        t: stamped ? stamped.currentTime : null,
      };

      // ── back off the last step: the window takes it again, same node ────────
      await step('#flow-prev');
      const backOnStep = {
        dockOpen: dockOpen(),
        sameNode: !!dockAudio() && dockAudio() === stamped,
        hasPaneAudio: !!paneAudio(),
        paused: stamped ? stamped.paused : null,
        t: stamped ? stamped.currentTime : null,
      };

      // ── the window dies with the flow, and takes the sound with it ──────────
      const dockIsInsideFlow = inst.el.contains(inst.el.querySelector('.mpi-flow-result-dock'));
      inst.el.destroy?.();
      inst.el.remove();
      await new Promise(r => setTimeout(r, 200));
      const afterDestroy = {
        dockIsInsideFlow,
        dockInDom: !!document.querySelector('.mpi-flow-result-dock'),
        paused: stamped ? stamped.paused : null,
      };

      host.remove();
      window.fetch = realFetch;
      delete state.s_flowResults[flow.id];

      return { onOpen, playError, afterPlay, onRunSlide, backOnStep, afterDestroy };
    });

    // Half two: a seeded result is there the moment the flow opens, in the window,
    // because step 0 is not the last step.
    expect(result.onOpen.dockOpen, 'the floating window opens on a seeded result').toBe(true);
    expect(result.onOpen.hasDockAudio, 'an audio result shows the player, not a still').toBe(true);
    expect(result.onOpen.hasPaneAudio, 'there is no result pane off the last step').toBe(false);

    // The premise of every playback assertion below.
    expect(result.playError, 'the fixture tone must actually play').toBeNull();
    expect(result.afterPlay.paused, 'the tone is playing before the first navigation').toBe(false);

    // Half one, and the whole card: the node is MOVED.
    expect(result.onRunSlide.sameNode, 'the run slide must adopt the SAME audio node').toBe(true);
    expect(result.onRunSlide.stamp, 'the stamp proves it is not a rebuilt element').toBe('the-one');
    expect(result.onRunSlide.dockOpen, 'the window closes on the last step').toBe(false);
    expect(result.onRunSlide.hasDockAudio, 'the window gives the player up, it does not copy it').toBe(false);
    expect(result.onRunSlide.paused, 'THE SOUND NEVER BREAKS — this is the bug').toBe(false);
    expect(result.onRunSlide.t, 'playback carried on across the step change')
      .toBeGreaterThanOrEqual(result.afterPlay.t);

    // And back the other way, which is the direction Fabio hit it in.
    expect(result.backOnStep.dockOpen, 'leaving the last step reopens the window').toBe(true);
    expect(result.backOnStep.sameNode, 'the window takes the same node back').toBe(true);
    expect(result.backOnStep.hasPaneAudio, 'the pane is gone with its slide').toBe(false);
    expect(result.backOnStep.paused, 'still playing on the way back too').toBe(false);

    // A window that outlives its flow is the teardown failure to watch for.
    expect(result.afterDestroy.dockIsInsideFlow, 'the window lives inside the flow').toBe(true);
    expect(result.afterDestroy.dockInDom, 'the window dies with the flow').toBe(false);
    expect(result.afterDestroy.paused, 'and takes the sound with it').toBe(true);

    expect(pageErrors, 'no renderer errors').toEqual([]);
  } finally {
    await closeApp(app);
  }
});
