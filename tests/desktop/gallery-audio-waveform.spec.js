const { test, expect } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const sharp = require('sharp');
const { launchApp, closeApp } = require('./launch');
const { extractAudioWaveform } = require('../../services/ffmpegThumb');

/**
 * MPI-730 item 2 — an audio card paints its baked waveform and fills as it plays.
 *
 * Both halves of the fixture are REAL, and for the same reason each time: a src
 * that 404s takes the missing-media path, which empties the thumb, so a fake
 * fixture passes green against a broken build (docs/gallery.md, MPI-631).
 *
 *  - the audio is `voices/child_1.opus`, a shipped 11.1s voice sample. NOT
 *    `assets/sounds/notify.wav`, which is 319ms and has already ended by the time
 *    a settle finishes (media-picker-cards.spec.js records that trap).
 *  - the mask is baked HERE by the real `extractAudioWaveform()` off that same
 *    file, not a stand-in still. The whole mechanism is alpha: a mask with the
 *    wrong polarity, or a bake the CSS cannot consume, is invisible to any
 *    assertion about the URL. So this spec reads PIXELS out of the rendered card.
 *
 * What it pins:
 *  1. the thumb is an MpiWaveform carrying that mask, not the old icon tile;
 *  2. the card is laid out at 21:9, the aspect the mask is baked at;
 *  3. the mask actually PAINTS — wave ink is present against the fill;
 *  4. the played split is real — at 50% the left half carries the accent fill and
 *     the right half does not;
 *  5. the <audio> drives it: moving `currentTime` moves the fill;
 *  6. a click reports the fraction it landed on.
 */
// Electron boot (splash → local server → shell) runs past the 30s default.
test.setTimeout(120000);

const REPO = path.resolve(__dirname, '..', '..').replace(/\\/g, '/');
const SOUND = `${REPO}/voices/child_1.opus`;

const projectFileUrl = (abs) => `/project-file?path=${encodeURIComponent(abs)}`;

/** Mean channel values over a rectangle of a PNG buffer. */
async function meanOf(png, { left, top, width, height }) {
    const { data, info } = await sharp(png)
        .extract({ left, top, width, height })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const sums = [0, 0, 0];
    for (let i = 0; i < data.length; i += info.channels) {
        sums[0] += data[i]; sums[1] += data[i + 1]; sums[2] += data[i + 2];
    }
    const n = data.length / info.channels;
    return { r: sums[0] / n, g: sums[1] / n, b: sums[2] / n };
}

/** How rose a colour is. The accent is a rose lift, so played pixels run red-of-blue. */
const rednessOf = (c) => c.r - c.b;

/**
 * Clear the boot modals before reading any pixel.
 *
 * A fresh `CUBRIC_E2E_USER_DATA` profile has not acknowledged the 18+ gate, so
 * `_maybeShowMaturityWarning` fires on every run — and Continue deliberately
 * CHAINS the changelog (MPI-333). Both sit behind `.mpi-modal-backdrop`, which
 * dims the entire window: the first run of this spec measured the waveform at
 * r≈11 against a real r≈140 and read as "the mask never painted". Specs that
 * only assert DOM never noticed, because `evaluate` sees straight through it.
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
    expect(await backdrops(), 'the boot modals must be gone — they dim every pixel').toBe(0);
}

test('an audio card paints its baked waveform and fills as it plays', async ({}, testInfo) => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mpi730-'));
    let app, window;

    try {
        // Bake the real derivative off the real clip, exactly as a sidecar writer
        // does. `extractAudioWaveform` returns the `.webp` path it chose.
        const maskPath = await extractAudioWaveform(SOUND, path.join(tmpDir, 'wave.thumb.jpg'));
        expect(maskPath, 'the waveform bake must produce a file').toBeTruthy();
        expect(maskPath.endsWith('.webp'), 'the mask lands as .webp').toBe(true);

        ({ app, window } = await launchApp(testInfo));
        await window.waitForTimeout(6000); // shell boot settles
        await clearBootModals(window);

        await window.evaluate(async ({ sound, mask }) => {
            const { MpiGalleryGrid } = await import('/js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js');

            const host = document.createElement('div');
            host.id = 'mpi730-host';
            host.style.cssText = 'position:fixed;top:0;left:0;width:1200px;height:800px;z-index:9000;background:#000;';
            document.body.appendChild(host);

            const groups = [{
                id: 'mpi730-group',
                type: 'audio',
                name: 'a voice line',
                selectedIndex: 0,
                history: [{
                    id: 'mpi730-item',
                    type: 'audio',
                    filePath: sound,
                    thumbPath: mask,
                    duration: 11.1,
                }],
            }];

            window.__mpi730 = { grid: MpiGalleryGrid.mount(host, { groups }), host };
        }, { sound: projectFileUrl(SOUND), mask: projectFileUrl(maskPath) });

        // The justified layout lands on its own schedule — wait for the card
        // rather than reading the DOM in the same tick as the mount.
        await window.waitForSelector('#mpi730-host .mpi-waveform', { timeout: 15000 });

        const mounted = await window.evaluate(() => {
            const host = document.getElementById('mpi730-host');
            const wave = host.querySelector('.mpi-waveform');
            const row  = host.querySelector('.mpi-gallery-grid__row-wrap');
            return {
                isWaveform: !!wave,
                hasOldIcon: !!host.querySelector('.mpi-group-card__audio-icon'),
                isThumb: wave.classList.contains('mpi-group-card__thumb--audio'),
                draggable: wave.draggable,
                maskProp: getComputedStyle(wave).getPropertyValue('--mpi-waveform-mask').trim(),
                rowW: parseFloat(row?.style.width || '0'),
                rowH: parseFloat(row?.style.height || '0'),
            };
        });

        // 1 — the thumb IS the component, and the icon tile is gone.
        expect(mounted.isWaveform, 'the audio thumb mounts MpiWaveform').toBe(true);
        expect(mounted.hasOldIcon, 'the centred play icon is removed').toBe(false);
        expect(mounted.isThumb, 'it still carries the card thumb class, so drag-out binds').toBe(true);
        expect(mounted.draggable, 'drag-into-prompt survives').toBe(true);
        expect(mounted.maskProp, 'the baked mask reached the element').toContain('project-file');

        // 2 — 21:9, the aspect the mask is baked at. One card on the row, so the
        // row box IS the card box.
        expect(mounted.rowW / mounted.rowH).toBeCloseTo(21 / 9, 1);

        const waveEl = await window.waitForSelector('#mpi730-host .mpi-waveform');
        const setProgress = (f) => window.evaluate(
            (v) => document.querySelector('#mpi730-host .mpi-waveform').setProgress(v), f);

        // 3 — the mask PAINTS. Unplayed, the wave ink (--ink-2, near-white) sits on
        // the fill (--surface-3, a mid grey): the centre band where the waveform
        // lives must be brighter than the top edge, which the envelope never reaches.
        await setProgress(0);
        const box = await waveEl.boundingBox();
        const W = Math.floor(box.width), H = Math.floor(box.height);
        const restPng = await waveEl.screenshot();
        const centreBand = await meanOf(restPng, { left: 0, top: Math.floor(H * 0.45), width: W, height: Math.floor(H * 0.1) });
        const topBand    = await meanOf(restPng, { left: 0, top: 2, width: W, height: Math.floor(H * 0.08) });
        expect(centreBand.r, 'the waveform mask must actually paint ink in the middle of the card')
            .toBeGreaterThan(topBand.r + 10);

        // 4 — the played split is real, and it fills the BACKGROUND, not just the
        // strokes. Sample the top band, which is pure fill with no wave in it.
        await setProgress(0.5);
        const halfPng = await waveEl.screenshot();
        const leftFill  = await meanOf(halfPng, { left: 2, top: 2, width: Math.floor(W * 0.4), height: Math.floor(H * 0.08) });
        const rightFill = await meanOf(halfPng, { left: Math.floor(W * 0.55), top: 2, width: Math.floor(W * 0.4), height: Math.floor(H * 0.08) });
        expect(rednessOf(leftFill), 'the played half tints the card background toward the accent')
            .toBeGreaterThan(rednessOf(rightFill) + 8);

        // 5 — the <audio> drives the fill. Not a synthesised call: move the real
        // element's playhead and let `timeupdate` do the wiring.
        const driven = await window.evaluate(async () => {
            const card = document.querySelector('#mpi730-host .mpi-group-card');
            const audio = card.querySelector('audio');
            const wave = document.querySelector('#mpi730-host .mpi-waveform');
            wave.setProgress(0);
            await new Promise((res) => {
                if (audio.readyState >= 1) return res();
                audio.addEventListener('loadedmetadata', res, { once: true });
                setTimeout(res, 5000);
            });
            const duration = audio.duration;
            await new Promise((res) => {
                audio.addEventListener('timeupdate', res, { once: true });
                audio.currentTime = duration * 0.75;
                setTimeout(res, 3000);
            });
            return { duration, progress: wave.getProgress() };
        });
        expect(Number.isFinite(driven.duration) && driven.duration > 5,
            'the fixture must be long enough to still be playing — not a 319ms blip').toBe(true);
        expect(driven.progress, 'timeupdate moves the fill').toBeCloseTo(0.75, 1);

        // 6 — a click reports where it landed. The card does not act on it yet
        // (that is item 3); the component's contract is what is pinned here.
        const seek = await window.evaluate(() => new Promise((resolve) => {
            const wave = document.querySelector('#mpi730-host .mpi-waveform');
            wave.addEventListener('mpiwaveform:seek', (e) => resolve(e.detail), { once: true });
            const r = wave.getBoundingClientRect();
            wave.dispatchEvent(new MouseEvent('click', {
                bubbles: true, clientX: r.left + r.width * 0.75, clientY: r.top + r.height / 2,
            }));
            setTimeout(() => resolve(null), 3000);
        }));
        expect(seek, 'a click on the waveform emits seek').not.toBeNull();
        expect(seek.fraction).toBeCloseTo(0.75, 1);
        expect(seek.time).toBeCloseTo(11.1 * 0.75, 0);
    } finally {
        if (app) await closeApp(app);
        await fs.remove(tmpDir).catch(() => {});
    }
});

