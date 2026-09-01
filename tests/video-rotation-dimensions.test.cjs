// MPI-670. probeVideo reports DISPLAY dimensions, not coded ones.
//
// A phone clip is coded landscape and carries a quarter-turn display matrix; every
// ffmpeg filter downstream applies that turn before it sees a frame, so a
// `scale=-2:'min(720,ih)'` proxy of a 3840x2160/rotation:-90 clip comes out 406x720.
// The sidecar was the one place still writing the coded pair, which put a portrait
// clip in the gallery as landscape whenever the renderer could not measure it
// itself — the HEVC case, where a renderer that cannot decode returns {0,0}.
//
// The fixture is generated rather than committed: it is the real ffprobe parse that
// can break, and the two rotation spellings ffprobe uses disagree in sign on the
// same file (a clip tagged `rotate: 90` reports `side_data.rotation: -90`), which is
// exactly the kind of thing a hand-written fake would get wrong and never catch.

const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const { probeVideo } = require('../services/ffprobeVideo.js');
const { ffmpegPath } = require('../services/ffmpegBinary.js');

const execFileP = promisify(execFile);

const CODED_W = 64;
const CODED_H = 32;

let tempDir;

test.before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi-rotation-'));
});

test.after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
});

/**
 * A 64x32 clip, optionally stamped with a display rotation. `-display_rotation` is
 * the input-side option; `-metadata:s:v rotate=` is silently dropped by current
 * ffmpeg and would produce a fixture with no rotation at all — a test that passes
 * for the wrong reason.
 */
async function makeClip(name, degrees) {
    const plain = path.join(tempDir, 'plain.mp4');
    if (!fs.existsSync(plain)) {
        await execFileP(ffmpegPath, [
            '-v', 'error', '-y',
            '-f', 'lavfi', '-i', `testsrc=size=${CODED_W}x${CODED_H}:rate=10:duration=1`,
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', plain,
        ], { windowsHide: true });
    }
    if (degrees === 0) return plain;

    const out = path.join(tempDir, name);
    await execFileP(ffmpegPath, [
        '-v', 'error', '-y',
        '-display_rotation', String(degrees),
        '-i', plain, '-c', 'copy', out,
    ], { windowsHide: true });
    return out;
}

test('a quarter turn swaps the reported dimensions', async () => {
    for (const degrees of [90, 270]) {
        const clip = await makeClip(`rot${degrees}.mp4`, degrees);
        const probe = await probeVideo(clip);
        assert.ok(probe, `probeVideo returned null for a ${degrees}deg clip`);
        assert.ok(probe.rotation === 90 || probe.rotation === 270,
            `a ${degrees}deg turn normalised to ${probe.rotation}, which is not a quarter turn`);
        assert.strictEqual(probe.width, CODED_H,
            `a ${degrees}deg clip should report the coded HEIGHT as its display width`);
        assert.strictEqual(probe.height, CODED_W,
            `a ${degrees}deg clip should report the coded WIDTH as its display height`);
    }
});

test('an unrotated clip is left alone', async () => {
    const probe = await probeVideo(await makeClip('plain.mp4', 0));
    assert.ok(probe, 'probeVideo returned null for an unrotated clip');
    assert.strictEqual(probe.rotation, 0);
    assert.strictEqual(probe.width, CODED_W);
    assert.strictEqual(probe.height, CODED_H);
});

test('a half turn does not swap — the viewer sees the same box', async () => {
    const probe = await probeVideo(await makeClip('rot180.mp4', 180));
    assert.ok(probe, 'probeVideo returned null for a 180deg clip');
    assert.strictEqual(probe.rotation, 180);
    assert.strictEqual(probe.width, CODED_W);
    assert.strictEqual(probe.height, CODED_H);
});
