/**
 * audio-mix-levels.test.cjs — MPI-663.
 *
 * `mixAudioFiles` sums stems back together for Stems' "Combine into one file". The
 * failure it exists to stop is silent and sounds almost right: ffmpeg's `amix`
 * NORMALIZES by default, dividing every input by N, so a combined drums+vocals would
 * come back at half the level it had in the track and all four at a quarter. Nothing
 * errors, nothing logs, and the file plays — it is just quiet, which reads as "the
 * separator lost energy" rather than as a filter flag.
 *
 * So the assertion is on the LEVEL, measured off a real encode: mixing a tone with an
 * identical copy of itself must come back exactly **+6.02 dB** louder (2x amplitude).
 * Normalized, it would come back at +0.00 dB — the same level it went in at, which is
 * both the bug and the thing that is impossible to hear as wrong without a reference.
 *
 * The gain is asserted RELATIVE to the measured input, not against an absolute dBFS
 * number: lavfi's `sine` does not generate at full scale, so an absolute expectation
 * would be pinning ffmpeg's generator rather than our filter.
 *
 * `volumedetect`, not `ebur128`: loudness normalisation reads the silence floor on
 * short synthetic tones and would pass whatever happened.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileP = promisify(execFile);
const { ffmpegPath } = require('../services/ffmpegBinary');
const { mixAudioFiles } = require('../services/ffmpegMux');

/** Peak level of a file in dBFS, via ffmpeg's volumedetect. */
async function peakDb(file) {
    // volumedetect reports on stderr and the null muxer writes nothing.
    const { stderr } = await execFileP(ffmpegPath,
        ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'],
        { maxBuffer: 4 * 1024 * 1024 })
        .catch(err => ({ stderr: err.stderr || '' }));
    const m = /max_volume:\s*(-?[\d.]+) dB/.exec(stderr);
    assert.ok(m, `volumedetect reported no max_volume for ${file}`);
    return Number(m[1]);
}

test('combining stems sums them, it does not average them', async (t) => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cubric-mix-'));
    try {
        // Two identical in-phase tones — the one input pair whose correct sum is known
        // exactly, whatever level the generator happens to produce.
        const inputs = [];
        for (const name of ['a', 'b']) {
            const p = path.join(dir, `${name}.flac`);
            await execFileP(ffmpegPath, [
                '-y', '-hide_banner',
                '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1:sample_rate=44100',
                '-af', 'volume=0.25', '-c:a', 'flac', p,
            ]);
            inputs.push(p);
        }
        const inputPeak = await peakDb(inputs[0]);

        const out = path.join(dir, 'mixed.flac');
        await mixAudioFiles(inputs, out);

        const gain = await peakDb(out) - inputPeak;
        assert.ok(Math.abs(gain - 6.02) < 0.5,
            `mixing a tone with itself must be +6.02 dB (2x amplitude); got ${gain.toFixed(2)} dB. `
            + `+0 dB means amix normalized — every stem came back divided by N.`);

        // Lossless out. The source is already lossy from the music model; a lossy
        // re-encode on the way to a DAW stacks artifacts.
        const { stderr } = await execFileP(ffmpegPath, ['-hide_banner', '-i', out], { maxBuffer: 1 << 20 })
            .catch(err => ({ stderr: err.stderr || '' }));
        assert.match(stderr, /Audio: flac/, 'the combined file stays FLAC');
    } finally {
        await fs.promises.rm(dir, { recursive: true, force: true });
    }
});

test('a sum that would clip is trimmed to fit, not hard-clipped', async (t) => {
    // Measured on a real MiniMax track: drums+vocals summed to +0.63 dB over full scale.
    // The instinct that says this cannot happen — "the stems came out of one file" — holds
    // only for ALL of them; drop one and you remove whatever was pulling the waveform DOWN
    // at some peaks. FLAC hard-clips the overshoot, and this flow's entire purpose is to
    // hand clean material to a DAW.
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cubric-clip-'));
    try {
        // Two loud tones. `+17dB` because lavfi's `sine` does NOT generate at full scale
        // (it lands near -18 dBFS), so the obvious "volume=-3dB" makes a pair that sums to
        // -15 and never tests anything — which is exactly how this test first passed
        // vacuously. The premise is asserted below rather than assumed.
        const inputs = [];
        for (const name of ['a', 'b']) {
            const p = path.join(dir, `${name}.flac`);
            await execFileP(ffmpegPath, [
                '-y', '-hide_banner',
                '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1:sample_rate=44100',
                '-af', 'volume=17dB', '-c:a', 'flac', p,
            ]);
            inputs.push(p);
        }
        const inputPeak = await peakDb(inputs[0]);
        assert.ok(inputPeak + 6.02 > 0.5,
            `test setup: the pair must actually overshoot, but sums to ${(inputPeak + 6.02).toFixed(2)} dBFS`);

        const out = path.join(dir, 'mixed.flac');
        await mixAudioFiles(inputs, out);

        // Measured in FLOAT, where an overshoot is still visible. `volumedetect` reads the
        // clamped integer and would report a tidy 0.0 dB for a file being destroyed, which
        // is exactly the reading that would let this regress unnoticed.
        const { stderr } = await execFileP(ffmpegPath,
            ['-hide_banner', '-i', out, '-af', 'aformat=sample_fmts=fltp,astats=metadata=1:reset=0',
             '-f', 'null', '-'], { maxBuffer: 4 * 1024 * 1024 })
            .catch(err => ({ stderr: err.stderr || '' }));
        const peaks = [...stderr.matchAll(/Peak level dB:\s*(-?[\d.]+)/g)]
            .map(m => Number(m[1])).filter(Number.isFinite);
        assert.ok(peaks.length, 'astats reported no peak');
        const peak = Math.max(...peaks);
        assert.ok(peak <= 0.01, `the written file must not exceed full scale; got ${peak} dBFS`);

        // Trimmed, not squashed: still within a hair of the ceiling it was pulled down to,
        // so the fix is a static gain rather than a limiter eating the peaks.
        assert.ok(peak > -1.0, `the trim must be the overshoot and no more; got ${peak} dBFS`);
    } finally {
        await fs.promises.rm(dir, { recursive: true, force: true });
    }
});

test('a combine of fewer than two files is refused, not silently passed through', async () => {
    await assert.rejects(() => mixAudioFiles(['only-one.flac'], 'out.flac'), /at least two/);
    await assert.rejects(() => mixAudioFiles([], 'out.flac'), /at least two/);
});
