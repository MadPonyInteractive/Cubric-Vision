const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./launch');

/**
 * MPI-731 — the audio player, and the vertical slider its volume control mounts.
 *
 * This file grows with the card. The first test is item 1 on its own: a vertical
 * `MpiProgressBar`. It is here rather than on `js/pages/components.js` because that page
 * is another session's (MPI-739) — and because the thing that can actually break is
 * invisible to a DOM assertion.
 *
 * WHY A REAL WINDOW. `orientation: 'vertical'` does not rotate anything: it sets
 * `writing-mode: vertical-lr` + `direction: rtl` on a native `<input type="range">` so
 * CHROMIUM does the pointer maths bottom-to-top (Chromium 135+; Electron 41 ships ~142).
 * Whether that mapping actually holds under `appearance: none` is a rendering-engine fact,
 * not a source fact — so the assertions below click real pixels near the bottom and near
 * the top of the track and read the value back. A top-to-bottom mapping (the silent
 * failure) inverts them and this fails.
 *
 * There is no jsdom in the node suite, so a desktop spec is the only place a component can
 * be mounted at all.
 */

// Electron boot (splash → local server → shell) plus the settle waits runs past the 30s
// default.
test.setTimeout(90000);

/**
 * A fresh `CUBRIC_E2E_USER_DATA` profile has not acknowledged the 18+ gate, and Continue
 * CHAINS the changelog (MPI-333) — two `.mpi-modal-backdrop` layers over the whole window.
 * They swallow the clicks this spec needs. Same helper as
 * `gallery-audio-waveform.spec.js`, and the same reason.
 */
async function clearBootModals(window) {
    const backdrops = () => window.evaluate(
        () => document.querySelectorAll('.mpi-modal-backdrop').length);

    const cont = window.locator('.mpi-modal-backdrop button:has-text("Continue")').first();
    if (await cont.count()) await cont.click({ timeout: 5000 }).catch(() => {});

    for (let i = 0; i < 8 && await backdrops() > 0; i++) {
        await window.keyboard.press('Escape');
        await window.waitForTimeout(400);
    }
    expect(await backdrops(), 'the boot modals must be gone — they swallow every click').toBe(0);
}

test('a vertical MpiProgressBar fills from the bottom and reads bottom-to-top', async ({}, testInfo) => {
    const { app, window, pageErrors } = await launchApp(testInfo);

    try {
        await window.waitForTimeout(6000);
        await clearBootModals(window);

        // Mount one of each, in a fixed host over everything else, and hand back the
        // track's box so the clicks below are aimed at real pixels.
        const box = await window.evaluate(async () => {
            const { MpiProgressBar } = await import('/js/components/Primitives/MpiProgressBar/MpiProgressBar.js');

            const host = document.createElement('div');
            host.id = 'mpi731-probe';
            host.style.cssText = 'position:fixed;left:40px;top:40px;height:240px;'
                + 'display:flex;gap:40px;z-index:99999;background:#000;padding:8px';
            document.body.appendChild(host);

            const vBox = document.createElement('div');
            vBox.style.cssText = 'height:200px';
            const hBox = document.createElement('div');
            hBox.style.cssText = 'width:200px;align-self:center';
            host.append(vBox, hBox);

            const vertical = MpiProgressBar.mount(vBox, {
                orientation: 'vertical', min: 0, max: 100, step: 1, value: 50,
                interactive: true, handle: true, info: '',
            });
            // The control case: the same props with no orientation must be untouched.
            const horizontal = MpiProgressBar.mount(hBox, {
                min: 0, max: 100, step: 1, value: 50,
                interactive: true, handle: true, info: '',
            });

            window.__mpi731 = { vertical, horizontal };

            const track = vertical.el.querySelector('.mpi-progress__track-container');
            const r = track.getBoundingClientRect();
            const hTrack = horizontal.el.querySelector('.mpi-progress__track-container');
            const hr = hTrack.getBoundingClientRect();
            return {
                v: { x: r.x, y: r.y, w: r.width, h: r.height },
                h: { w: hr.width, h: hr.height },
            };
        });

        // Geometry first: the vertical track is TALL and thin, the horizontal one wide and
        // thin. If the CSS block never applied, the vertical one is 4px tall and every
        // click below lands outside it.
        expect(box.v.h, 'the vertical track is as tall as its host').toBeGreaterThan(150);
        expect(box.v.w, 'and stays a thin rail').toBeLessThan(12);
        expect(box.h.w, 'the horizontal control is unchanged — wide').toBeGreaterThan(150);
        expect(box.h.h, 'and thin').toBeLessThan(12);

        const read = () => window.evaluate(() => {
            const { vertical } = window.__mpi731;
            const input = vertical.el.querySelector('.mpi-progress__input');
            const fill = vertical.el.querySelector('.mpi-progress__track-fill');
            const handle = vertical.el.querySelector('.mpi-progress__handle');
            const tr = vertical.el.querySelector('.mpi-progress__track-container')
                .getBoundingClientRect();
            const fr = fill.getBoundingClientRect();
            const hr = handle.getBoundingClientRect();
            return {
                value: parseFloat(input.value),
                // How far the fill's own box sits from the track's bottom, and its height.
                fillBottomGap: tr.bottom - fr.bottom,
                fillHeight: fr.height,
                trackHeight: tr.height,
                handleCentreFromBottom: tr.bottom - (hr.y + hr.height / 2),
            };
        });

        // At the mounted value of 50 the fill is anchored at the bottom and covers half.
        const mid = await read();
        expect(mid.value, 'mounts at the value it was given').toBe(50);
        expect(Math.abs(mid.fillBottomGap), 'the fill is anchored at the BOTTOM').toBeLessThan(2);
        expect(mid.fillHeight / mid.trackHeight, 'and covers half the track at 50')
            .toBeGreaterThan(0.4);
        expect(mid.fillHeight / mid.trackHeight).toBeLessThan(0.6);
        expect(mid.handleCentreFromBottom / mid.trackHeight, 'the handle sits at the value')
            .toBeGreaterThan(0.35);

        // THE ASSERTION THIS SPEC EXISTS FOR. Click near the BOTTOM of the track: a
        // bottom-to-top control reads that as a LOW value. A silently top-to-bottom one
        // reads it as high, which is the whole failure mode and is invisible in the DOM.
        const cx = box.v.x + box.v.w / 2;
        await window.mouse.click(cx, box.v.y + box.v.h - 6);
        await window.waitForTimeout(200);
        const low = await read();
        expect(low.value, 'a click near the bottom is a LOW value, not a high one')
            .toBeLessThan(20);
        expect(low.fillHeight, 'and the fill shrinks with it').toBeLessThan(mid.fillHeight);

        await window.mouse.click(cx, box.v.y + 6);
        await window.waitForTimeout(200);
        const high = await read();
        expect(high.value, 'a click near the top is a HIGH value').toBeGreaterThan(80);
        expect(high.fillHeight, 'and the fill grows from the bottom to meet it')
            .toBeGreaterThan(low.fillHeight);
        expect(Math.abs(high.fillBottomGap), 'still anchored at the bottom').toBeLessThan(2);

        // The horizontal control must be untouched by all of this — it is the same
        // Primitive and ~23 live mounts depend on it.
        const hz = await window.evaluate(() => {
            const { horizontal } = window.__mpi731;
            const fill = horizontal.el.querySelector('.mpi-progress__track-fill');
            const tr = horizontal.el.querySelector('.mpi-progress__track-container')
                .getBoundingClientRect();
            const fr = fill.getBoundingClientRect();
            return { leftGap: fr.x - tr.x, widthRatio: fr.width / tr.width, inlineHeight: fill.style.height };
        });
        expect(Math.abs(hz.leftGap), 'horizontal still fills from the LEFT').toBeLessThan(2);
        expect(hz.widthRatio, 'and by width, at half').toBeGreaterThan(0.4);
        expect(hz.widthRatio).toBeLessThan(0.6);
        expect(hz.inlineHeight, 'no vertical inline style leaked onto it').toBe('');

        await window.evaluate(() => {
            window.__mpi731.vertical.destroy?.();
            window.__mpi731.horizontal.destroy?.();
            document.getElementById('mpi731-probe')?.remove();
            delete window.__mpi731;
        });

        expect(pageErrors, 'no renderer errors').toEqual([]);
    } finally {
        await closeApp(app);
    }
});
