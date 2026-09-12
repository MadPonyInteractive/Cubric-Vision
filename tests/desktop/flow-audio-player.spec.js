const fs = require('fs');
const path = require('path');
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
 * class. It is mounted bare, in a host pinned near the bottom of the window with room
 * above it for the flyout; the next test drives it inside the real `MpiVideoControlBar`.
 */
test('MpiVolumeControl reveals its vertical volume on hover and reports, never owns, the state', async ({}, testInfo) => {
    const { app, window, pageErrors } = await launchApp(testInfo);

    try {
        await window.waitForTimeout(6000);
        await clearBootModals(window);

        const geo = await window.evaluate(async () => {
            const { MpiVolumeControl } = await import('/js/components/Compounds/MpiVolumeControl/MpiVolumeControl.js');

            const host = document.createElement('div');
            host.id = 'mpi731-volume-probe';
            host.style.cssText = 'position:fixed;right:40px;bottom:40px;z-index:99999';
            document.body.appendChild(host);

            const vc = MpiVolumeControl.mount(host, { value: 50, info: 'Mute/Unmute (M)' });
            const log = [];
            vc.on('input', ({ value }) => log.push(['input', value]));
            vc.on('change', ({ value }) => log.push(['change', value]));
            vc.on('mute-toggle', ({ muted }) => log.push(['mute-toggle', muted]));
            window.__mpi731v = { vc, log };

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
        // From a level above zero: at zero the speaker restores instead (asserted below).
        await window.evaluate(() => window.__mpi731v.vc.el.setValue(50));
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

        // The wheel is always on, over the button as well as the panel, and fast: 5 per tick
        // whatever the drag step — the gallery's speed (Fabio, 2026-09-12). Value is 30 here.
        const wheel = async (x, y, dy, ticks) => {
            await window.mouse.move(x, y);
            for (let i = 0; i < ticks; i++) {
                await window.mouse.wheel(0, dy);
                await window.waitForTimeout(60);
            }
            await window.waitForTimeout(150);
            return window.evaluate(() => {
                const { vc, log } = window.__mpi731v;
                return { value: vc.el.getValue(), log: log.slice() };
            });
        };

        await window.evaluate(() => { window.__mpi731v.log.length = 0; });
        const up = await wheel(geo.btn.x, geo.btn.y, -100, 1);
        expect(up.value, 'one wheel tick UP over the mute button is +5').toBe(35);
        expect(up.log, 'reported as input then change, like a drag').toEqual([['input', 35], ['change', 35]]);

        const down = await wheel(open.track.x, (open.track.top + open.track.bottom) / 2, 100, 2);
        expect(down.value, 'two ticks DOWN over the panel are -10').toBe(25);

        await window.evaluate(() => { window.__mpi731v.vc.el.setValue(98); window.__mpi731v.log.length = 0; });
        const top = await wheel(geo.btn.x, geo.btn.y, -100, 2);
        expect(top.value, 'the wheel clamps at 100').toBe(100);
        expect(top.log.filter(([k]) => k === 'input').length, 'and a tick that cannot move emits nothing')
            .toBe(1);

        // Zero reads as MUTED, and the speaker then brings the level back rather than
        // flipping a flag nobody would hear (Fabio, 2026-09-12).
        const btnState = () => window.evaluate(() => {
            const { vc, log } = window.__mpi731v;
            return {
                value: vc.el.getValue(),
                active: vc.el.querySelector('.mpi-btn').classList.contains('is-active'),
                log: log.slice(),
            };
        });
        await window.evaluate(() => window.__mpi731v.vc.el.setValue(10));
        await window.waitForTimeout(500); // past the wheel's gesture gap, so a new burst starts
        expect((await wheel(geo.btn.x, geo.btn.y, 100, 3)).value, 'wheeled down to zero').toBe(0);
        expect((await btnState()).active, 'the speaker shows MUTED at zero').toBe(true);

        await window.evaluate(() => { window.__mpi731v.log.length = 0; });
        await window.mouse.click(geo.btn.x, geo.btn.y);
        await window.waitForTimeout(150);
        const restored = await btnState();
        expect(restored.value, 'clicking it brings back the level the gesture started from').toBe(10);
        expect(restored.active, 'and shows sound again').toBe(false);
        expect(restored.log, 'reported as a value, never a mute-toggle')
            .toEqual([['input', 10], ['change', 10]]);

        await window.evaluate(() => window.__mpi731v.vc.el.setValue(0));
        expect((await btnState()).active, 'a consumer setting zero shows muted too').toBe(true);
        await window.evaluate(() => window.__mpi731v.vc.el.setValue(40));
        expect((await btnState()).active, 'and any level above it shows sound').toBe(false);

        // Away from the control, it closes again.
        await window.mouse.move(5, 5);
        await window.waitForTimeout(350);
        expect((await probe()).visibility, 'leaving closes the flyout').toBe('hidden');

        await window.evaluate(() => {
            window.__mpi731v.vc.destroy();
            document.getElementById('mpi731-volume-probe')?.remove();
            delete window.__mpi731v;
        });

        expect(pageErrors, 'no renderer errors').toEqual([]);
    } finally {
        await closeApp(app);
    }
});

/**
 * Item 5 — `MpiVideoControlBar` mounts `MpiVolumeControl` in place of its own mute button and
 * horizontal slider. Driven against a REAL `MpiVideoSurface`: neither the bar nor the control
 * owns the media, so the only proof the swap kept the wiring is the `<video>` element's own
 * `volume` / `muted` moving — from the button, the wheel, `M` and the arrow keys — and the
 * control following the element back. A `<video>` with no `src` still takes both properties
 * and still fires `volumechange`, so no fixture is needed.
 */
test('MpiVideoControlBar drives a real video through MpiVolumeControl: click, wheel, M and the arrows', async ({}, testInfo) => {
    const { app, window, pageErrors } = await launchApp(testInfo);

    try {
        await window.waitForTimeout(6000);
        await clearBootModals(window);

        const layout = await window.evaluate(async () => {
            const { MpiVideoSurface } = await import('/js/components/Compounds/MpiVideoSurface/MpiVideoSurface.js');
            const { MpiVideoControlBar } = await import('/js/components/Compounds/MpiVideoControlBar/MpiVideoControlBar.js');

            const host = document.createElement('div');
            host.id = 'mpi731-bar-probe';
            host.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#000';
            const surfaceHost = document.createElement('div');
            surfaceHost.style.cssText = 'width:160px;height:90px';
            const barHost = document.createElement('div');
            host.append(surfaceHost, barHost);
            document.body.appendChild(host);

            const surface = MpiVideoSurface.mount(surfaceHost, { volume: 0.5 });
            const bar = MpiVideoControlBar.mount(barHost, { showTrim: true });
            bar.el.attachSurface(surface);
            window.__mpi731b = { surface, bar };

            const right = bar.el.querySelector('.mpi-video-control-bar__right');
            const btns = [...right.querySelectorAll('.mpi-btn')];
            const gap = parseFloat(getComputedStyle(right).columnGap) || 0;
            const btn = right.querySelector('.mpi-volume-control .mpi-btn').getBoundingClientRect();
            return {
                btn: { x: btn.x + btn.width / 2, y: btn.y + btn.height / 2 },
                oldPairGone: !bar.el.querySelector('.mpi-video-control-bar__volume, .mpi-video-control-bar__volume-slider'),
                rightSliders: [...right.querySelectorAll('.mpi-progress')]
                    .map(p => p.classList.contains('mpi-progress--vertical')),
                rightButtons: btns.length,
                leftButtons: bar.el.querySelectorAll('.mpi-video-control-bar__left .mpi-btn').length,
                rightSlack: right.getBoundingClientRect().width
                    - btns.reduce((s, b) => s + b.getBoundingClientRect().width, 0)
                    - gap * (btns.length - 1),
                trimMounted: bar.el.querySelector('.mpi-video-control-bar__trim').children.length > 0,
            };
        });

        // The swap reached exactly its slot: one vertical slider, the buttons all still there.
        expect(layout.oldPairGone, 'the bar\'s own volume pair is gone').toBe(true);
        expect(layout.rightSliders, 'its right cluster holds ONE slider, the vertical one').toEqual([true]);
        expect(layout.rightButtons, 'frames, loop, mute, fullscreen').toBe(4);
        expect(layout.leftButtons, 'play and both frame steps untouched').toBe(3);
        expect(layout.trimMounted, 'the trim bar still mounts').toBe(true);
        expect(layout.rightSlack, 'the cluster is only its buttons now — no slider width left in it')
            .toBeLessThan(24);

        await window.waitForFunction(() => getComputedStyle(
            document.querySelector('#mpi731-bar-probe .mpi-volume-control__flyout')).position === 'absolute');

        const state = () => window.evaluate(() => {
            const { surface, bar } = window.__mpi731b;
            const v = surface.el.getVideoElement();
            const vc = bar.el.querySelector('.mpi-volume-control');
            return {
                volume: Math.round(v.volume * 100),
                muted: v.muted,
                slider: parseFloat(vc.querySelector('.mpi-progress__input').value),
                btnActive: vc.querySelector('.mpi-btn').classList.contains('is-active'),
            };
        });

        expect(await state(), 'attachSurface paints the element\'s volume into the control')
            .toEqual({ volume: 50, muted: false, slider: 50, btnActive: false });

        // The button.
        await window.mouse.move(layout.btn.x, layout.btn.y);
        await window.mouse.click(layout.btn.x, layout.btn.y);
        await window.waitForTimeout(200);
        expect(await state(), 'clicking mute mutes the VIDEO').toMatchObject({ muted: true, btnActive: true });
        await window.mouse.click(layout.btn.x, layout.btn.y);
        await window.waitForTimeout(200);
        expect(await state(), 'and again unmutes it').toMatchObject({ muted: false, btnActive: false });

        // The wheel, over the button: 5 per tick, all the way to the element.
        await window.mouse.wheel(0, -100);
        await window.waitForTimeout(100);
        await window.mouse.wheel(0, -100);
        await window.waitForTimeout(200);
        expect(await state(), 'two ticks up put the video at 60%').toMatchObject({ volume: 60, slider: 60 });

        // The hotkeys, with the pointer away and nothing focused.
        await window.mouse.move(5, 5);
        await window.evaluate(() => document.activeElement?.blur());
        await window.keyboard.press('m');
        await window.waitForTimeout(200);
        expect(await state(), 'M mutes, and the control follows the element')
            .toMatchObject({ muted: true, btnActive: true });
        await window.keyboard.press('m');
        await window.waitForTimeout(200);
        expect(await state(), 'M again unmutes').toMatchObject({ muted: false, btnActive: false });

        await window.keyboard.press('ArrowDown');
        await window.waitForTimeout(200);
        expect(await state(), 'arrow down is -10, and the slider follows').toMatchObject({ volume: 50, slider: 50 });
        await window.keyboard.press('ArrowUp');
        await window.waitForTimeout(200);
        expect(await state(), 'arrow up is +10').toMatchObject({ volume: 60, slider: 60 });

        // Zero reads as MUTED on the real bar too, and the speaker brings the sound back.
        await window.waitForTimeout(500);
        await window.mouse.move(layout.btn.x, layout.btn.y);
        for (let i = 0; i < 12; i++) {
            await window.mouse.wheel(0, 100);
            await window.waitForTimeout(40);
        }
        await window.waitForTimeout(250);
        expect(await state(), 'wheeled to zero: silent, NOT muted, and the speaker shows muted')
            .toEqual({ volume: 0, muted: false, slider: 0, btnActive: true });
        await window.mouse.click(layout.btn.x, layout.btn.y);
        await window.waitForTimeout(250);
        expect(await state(), 'clicking it brings the video back to 60%')
            .toEqual({ volume: 60, muted: false, slider: 60, btnActive: false });

        await window.evaluate(() => {
            window.__mpi731b.bar.destroy();
            window.__mpi731b.surface.destroy();
            document.getElementById('mpi731-bar-probe')?.remove();
            delete window.__mpi731b;
        });

        expect(pageErrors, 'no renderer errors').toEqual([]);
    } finally {
        await closeApp(app);
    }
});

/**
 * Item 5b — in the video workspace the transport bar lives BELOW the PromptBox.
 *
 * It used to be the block's last grid row: the bottom of `#tool-container`, which sits directly
 * on top of the shell-level `#prompt-box-mount`. Everything the PromptBox opens upward (the
 * expand toggle at `top: -10px`, the op strip, the media strip) hangs off `bottom: 100%` of that
 * mount — so it landed on the bar's buttons. The bar now mounts in `#controls-mount`, the shell
 * slot after the PromptBox. Geometry and hit-testing in a real window, because the bug was paint.
 */
test('video Group History: the transport bar sits below the PromptBox and nothing covers it', async ({}, testInfo) => {
    const { app, window, pageErrors } = await launchApp(testInfo);

    // A real folder: a fake path 500s the settings writes (docs/testing-desktop-specs.md).
    const folderPath = testInfo.outputPath('project');
    fs.mkdirSync(folderPath, { recursive: true });
    const project = {
        id: 'p731', name: 'MPI-731', folderPath, modelSettings: {},
        itemGroups: [
            { id: 'gVid', type: 'video', name: 'Video', selectedIndex: 0,
                history: [{ id: 'v1', type: 'video', filePath: '', displayName: 'v1' }] },
            { id: 'gImg', type: 'image', name: 'Image', selectedIndex: 0, history: [] },
        ],
    };
    fs.writeFileSync(path.join(folderPath, 'project.json'), JSON.stringify(project, null, 2));

    try {
        await window.waitForTimeout(6000);
        await clearBootModals(window);

        await window.evaluate(async (project) => {
            const { state } = await import('/js/state.js');
            const { navigate, PAGE_GROUP_HISTORY } = await import('/js/router.js');
            const reg = await import('/js/data/modelRegistry.js');
            // A runner has no weights: a dependency-free i2v model is what makes the video
            // workspace mount its PromptBox at all (same trick as mask-persist-roundtrip).
            reg.MODELS.push({
                id: 'e2e-i2v', name: 'E2E I2V', mediaType: 'video', supportedOps: ['i2v'], installed: true,
            });
            state.currentProject = project;
            await navigate(PAGE_GROUP_HISTORY, { groupId: 'gVid' });
        }, project);

        await window.waitForSelector('#controls-mount .mpi-video-control-bar', { timeout: 15000 });
        await window.waitForSelector('#prompt-box-mount .mpi-prompt-box', { state: 'visible', timeout: 15000 });
        await window.waitForTimeout(500);

        // Every PromptBox node whose box lands on the bar, and every bar button whose centre does
        // not hit-test to itself. Both empty = nothing covers it.
        const probe = () => window.evaluate(() => {
            const bar = document.querySelector('#controls-mount .mpi-video-control-bar');
            const b = bar.getBoundingClientRect();
            const overlaps = (r) => r.width > 0 && r.height > 0
                && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
            const btns = [...bar.querySelectorAll('.mpi-btn')];
            return {
                barTop: b.top,
                promptBottom: document.getElementById('prompt-box-mount').getBoundingClientRect().bottom,
                buttons: btns.length,
                painting: [...document.querySelectorAll('#prompt-box-mount *')]
                    .filter(n => getComputedStyle(n).visibility !== 'hidden' && overlaps(n.getBoundingClientRect()))
                    .map(n => n.getAttribute('class')),
                blocked: btns.filter(btn => {
                    const r = btn.getBoundingClientRect();
                    return !btn.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
                }).map(btn => btn.getAttribute('class')),
            };
        });

        const after = await probe();
        expect(after.buttons, 'play, both frame steps, frames, loop, mute, fullscreen').toBeGreaterThanOrEqual(7);
        expect(after.barTop, 'the bar starts at the PromptBox\'s bottom edge, not above it')
            .toBeGreaterThanOrEqual(after.promptBottom - 1);
        expect(after.painting, 'no PromptBox node lands on the bar').toEqual([]);
        expect(after.blocked, 'every bar button takes its own click').toEqual([]);

        // The probe can see the bug: put the slot back ABOVE the PromptBox, where the old grid row
        // sat, and the same probe must find the PromptBox on the bar. Then restore it.
        await window.evaluate(() => {
            const slot = document.getElementById('controls-mount');
            slot.parentNode.insertBefore(slot, document.getElementById('prompt-box-mount'));
        });
        await window.waitForTimeout(200);
        expect((await probe()).painting.length, 'above the PromptBox, its upward chrome lands on the bar')
            .toBeGreaterThan(0);
        await window.evaluate(() => {
            const slot = document.getElementById('controls-mount');
            slot.parentNode.insertBefore(slot, document.getElementById('shell-info-bar'));
        });
        await window.waitForTimeout(200);

        // The volume flyout still opens whole, and over the PromptBox.
        await window.waitForFunction(() => getComputedStyle(
            document.querySelector('#controls-mount .mpi-volume-control__flyout')).position === 'absolute');
        const vol = await window.evaluate(() => {
            const r = document.querySelector('#controls-mount .mpi-volume-control .mpi-btn').getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        await window.mouse.move(vol.x, vol.y);
        await window.waitForTimeout(400);
        const flyout = await window.evaluate(() => {
            const slider = document.querySelector('#controls-mount .mpi-volume-control__slider');
            const f = document.querySelector('#controls-mount .mpi-volume-control__flyout').getBoundingClientRect();
            const t = slider.getBoundingClientRect();
            return {
                height: f.height,
                clipped: f.top < document.querySelector('.main-area').getBoundingClientRect().top,
                overPrompt: f.top < document.getElementById('prompt-box-mount').getBoundingClientRect().bottom,
                reachable: slider.contains(document.elementFromPoint(t.x + t.width / 2, t.y + t.height / 2)),
            };
        });
        expect(flyout.height, 'the flyout opened').toBeGreaterThan(50);
        expect(flyout.clipped, 'and nothing clips it').toBe(false);
        expect(flyout, 'it rises across the PromptBox and its slider takes the pointer there')
            .toMatchObject({ overPrompt: true, reachable: true });

        // An image group mounts no bar: the slot is empty, takes no room, and the grid is two rows.
        await window.mouse.move(5, 5);
        await window.evaluate(async () => {
            const { navigate, PAGE_GROUP_HISTORY } = await import('/js/router.js');
            await navigate(PAGE_GROUP_HISTORY, { groupId: 'gImg' });
        });
        await window.waitForFunction(() => document.querySelector('.mpi-group-history-block')
            && !document.querySelector('.mpi-video-viewer'), null, { timeout: 15000 });
        expect(await window.evaluate(() => ({
            slotEmpty: document.getElementById('controls-mount').children.length === 0,
            slotHeight: document.getElementById('controls-mount').getBoundingClientRect().height,
            rows: getComputedStyle(document.querySelector('.mpi-group-history-block')).gridTemplateRows.split(' ').length,
        })), 'leaving the video group took the bar with it').toEqual({ slotEmpty: true, slotHeight: 0, rows: 2 });

        expect(pageErrors, 'no renderer errors').toEqual([]);
    } finally {
        await closeApp(app);
    }
});
