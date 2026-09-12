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

/**
 * Item 2 — `MpiVolumeControl`, the mute button with the volume hiding above it.
 *
 * Its reveal is CSS alone (`:hover, :focus-within` on the root), which is exactly the kind
 * a specificity accident leaves permanently open or permanently shut — so visibility is
 * MEASURED here (computed style plus what the pointer actually hits), never read off a
 * class. It is mounted in the right cluster of a real `MpiVideoControlBar`, standing in
 * for the bar's own volume pair, because that is where item 5 puts it and the height of
 * the flyout only means something next to the bar it rises out of.
 */
test('MpiVolumeControl reveals its vertical volume on hover and reports, never owns, the state', async ({}, testInfo) => {
    const { app, window, pageErrors } = await launchApp(testInfo);

    try {
        await window.waitForTimeout(6000);
        await clearBootModals(window);

        const geo = await window.evaluate(async () => {
            const { MpiVideoControlBar } = await import('/js/components/Compounds/MpiVideoControlBar/MpiVideoControlBar.js');
            const { MpiVolumeControl } = await import('/js/components/Compounds/MpiVolumeControl/MpiVolumeControl.js');

            const host = document.createElement('div');
            host.id = 'mpi731-volume-probe';
            host.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999';
            document.body.appendChild(host);

            const bar = MpiVideoControlBar.mount(host, { showTrim: false });
            // Stand-in for item 5: the bar's own horizontal pair out, the compound in.
            const oldPair = bar.el.querySelector('.mpi-video-control-bar__volume');
            const slot = document.createElement('div');
            oldPair.after(slot);
            oldPair.style.display = 'none';

            const vc = MpiVolumeControl.mount(slot, { value: 50, info: 'Mute/Unmute (M)' });
            const log = [];
            vc.on('input', ({ value }) => log.push(['input', value]));
            vc.on('change', ({ value }) => log.push(['change', value]));
            vc.on('mute-toggle', ({ muted }) => log.push(['mute-toggle', muted]));
            window.__mpi731v = { bar, vc, log };

            const btn = vc.el.querySelector('.mpi-btn').getBoundingClientRect();
            return { btn: { x: btn.x + btn.width / 2, y: btn.y + btn.height / 2 } };
        });

        const probe = () => window.evaluate(() => {
            const { vc } = window.__mpi731v;
            const flyout = vc.el.querySelector('.mpi-volume-control__flyout');
            const track = vc.el.querySelector('.mpi-progress__track-container').getBoundingClientRect();
            const btn = vc.el.querySelector('.mpi-btn').getBoundingClientRect();
            const cx = track.x + track.width / 2;
            const cy = track.y + track.height / 2;
            const hit = document.elementFromPoint(cx, cy);
            return {
                visibility: getComputedStyle(flyout).visibility,
                opacity: parseFloat(getComputedStyle(flyout).opacity),
                pointerReachesSlider: !!hit && vc.el.querySelector('.mpi-volume-control__slider').contains(hit),
                track: { x: cx, top: track.y, bottom: track.bottom, h: track.height },
                btnTop: btn.y,
            };
        });

        // The factory injects a component's stylesheet as a `<link>` on first mount, and it
        // loads async: measured before it lands, the flyout is an unstyled, visible div. So
        // wait for the sheet, then past the `--t-fast` fade it triggers on the way in.
        await window.waitForFunction(() => getComputedStyle(
            window.__mpi731v.vc.el.querySelector('.mpi-volume-control__flyout')).position === 'absolute');
        await window.waitForTimeout(350);

        // Closed until asked: not painted, and the pointer passes straight through it.
        const closed = await probe();
        expect(closed.visibility, 'the flyout is hidden before any hover').toBe('hidden');
        expect(closed.pointerReachesSlider, 'and a closed flyout catches no pointer').toBe(false);

        await window.mouse.move(geo.btn.x, geo.btn.y);
        await window.waitForTimeout(350);
        const open = await probe();
        expect(open.visibility, 'hovering the mute button opens it').toBe('visible');
        expect(open.opacity).toBeGreaterThan(0.95);
        expect(open.pointerReachesSlider, 'and the slider is now what the pointer hits').toBe(true);
        expect(open.track.bottom, 'it rises ABOVE the button').toBeLessThanOrEqual(open.btnTop);
        expect(open.track.h, 'with a usable length of travel').toBeGreaterThan(90);

        // The travel from the button up into the slider must not close it on the way.
        await window.mouse.move(open.track.x, open.track.top + 4, { steps: 12 });
        await window.waitForTimeout(150);
        expect((await probe()).visibility, 'still open after the pointer travels up into it')
            .toBe('visible');

        await window.screenshot({ path: testInfo.outputPath('volume-flyout-open.png') });

        // It reports the gesture — top of the track is loud, bottom is quiet.
        await window.mouse.click(open.track.x, open.track.top + 4);
        await window.waitForTimeout(150);
        await window.mouse.click(open.track.x, open.track.bottom - 4);
        await window.waitForTimeout(150);
        const afterDrag = await window.evaluate(() => {
            const { vc, log } = window.__mpi731v;
            return { log: log.slice(), value: vc.el.getValue() };
        });
        const inputs = afterDrag.log.filter(([k]) => k === 'input').map(([, v]) => v);
        expect(inputs.length, 'a click on the slider emits input').toBeGreaterThanOrEqual(2);
        expect(inputs[0], 'near the top reads LOUD').toBeGreaterThan(80);
        expect(inputs[inputs.length - 1], 'near the bottom reads QUIET').toBeLessThan(20);
        expect(afterDrag.value).toBeLessThan(20);

        // Mute is a REQUEST. The compound says what was asked; setters never echo back.
        await window.mouse.move(geo.btn.x, geo.btn.y);
        await window.mouse.click(geo.btn.x, geo.btn.y);
        const muted = await window.evaluate(() => {
            const { vc, log } = window.__mpi731v;
            const last = log[log.length - 1];
            const btn = vc.el.querySelector('.mpi-btn');
            const activeAfterClick = btn.classList.contains('is-active');
            const before = log.length;
            vc.el.setMuted(false);
            vc.el.setValue(30);
            return {
                last, activeAfterClick,
                activeAfterSet: btn.classList.contains('is-active'),
                value: vc.el.getValue(),
                echoed: log.length - before,
            };
        });
        expect(muted.last, 'clicking mute asks for muted: true').toEqual(['mute-toggle', true]);
        expect(muted.activeAfterClick, 'and shows it').toBe(true);
        expect(muted.activeAfterSet, 'setMuted(false) puts it back').toBe(false);
        expect(muted.value, 'setValue lands').toBe(30);
        expect(muted.echoed, 'and neither setter emits — the consumer is the truth').toBe(0);

        // Away from the control, it closes again.
        await window.mouse.move(5, 5);
        await window.waitForTimeout(350);
        expect((await probe()).visibility, 'leaving closes the flyout').toBe('hidden');

        await window.evaluate(() => {
            window.__mpi731v.vc.destroy();
            window.__mpi731v.bar.destroy();
            document.getElementById('mpi731-volume-probe')?.remove();
            delete window.__mpi731v;
        });

        expect(pageErrors, 'no renderer errors').toEqual([]);
    } finally {
        await closeApp(app);
    }
});
