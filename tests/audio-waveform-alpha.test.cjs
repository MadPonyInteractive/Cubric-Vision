'use strict';
// MPI-730 — an audio card's waveform is an alpha MASK, not a picture.
//
// The card paints it twice with `mask-image` and two different CSS vars, so the only
// thing that makes it work is the alpha channel: white where the wave is, transparent
// everywhere else. A file that decodes, lands at the right name and looks fine in a
// viewer can still be a solid opaque rectangle — which paints as a filled block of
// accent colour, not a waveform. So this asserts on PIXELS, never on the extension.
//
// Same reasoning and same read-back trick as `image-thumb-alpha.test.cjs` (MPI-627).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { ffmpegPath } = require('../services/ffmpegBinary');
const { extractAudioWaveform, imageThumbPath, AUDIO_WAVEFORM_PX } = require('../services/ffmpegThumb');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi-wave-'));

/** The alpha plane as raw gray bytes. */
function alphaBytes(file) {
    return execFileSync(ffmpegPath, [
        '-v', 'error', '-i', file,
        '-vf', 'alphaextract',
        '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-',
    ], { maxBuffer: 64 * 1024 * 1024 });
}

// Real, decodable audio — amplitude-modulated so the drawn envelope varies across the
// frame instead of being one flat band. 6s keeps the test quick; the shape is what
// matters, not the length.
//
// The `volume=` gain is not decoration: ffmpeg's `sine` source peaks at about
// -18 dBFS, so a bare sine draws a thin band and every envelope assertion below reads
// as a broken filter when the filter is fine. Drive it to roughly a real master.
const wav = path.join(tmp, 'tone.wav');
execFileSync(ffmpegPath, [
    '-y', '-v', 'error',
    '-f', 'lavfi', '-i', 'sine=f=440:d=6',
    '-af', 'volume=7.0*abs(sin(2*PI*t/3))+0.05:eval=frame',
    wav,
]);

(async () => {
    // 1. It lands at the WebP path, whatever extension the caller asked for — the
    //    `<id>.thumb.webp` name is what makes it inherit DERIVATIVE_RE and the GC.
    const asked = path.join(tmp, 'x.thumb.jpg');
    const out = await extractAudioWaveform(wav, asked);
    assert.strictEqual(out, imageThumbPath(asked), 'waveform did not land at the .webp path');
    assert.strictEqual(out, path.join(tmp, 'x.thumb.webp'));
    assert.ok(fs.existsSync(out), 'no waveform file was written');
    assert.ok(!fs.existsSync(asked), 'a JPG was written alongside the WebP');

    // 2. THE REGRESSION: it is a mask. Both a transparent pixel and an opaque one
    //    must survive the encode — all-opaque paints a solid block, all-transparent
    //    paints nothing, and either one passes a file-exists check.
    const alpha = alphaBytes(out);
    assert.ok(alpha.some(b => b <= 2), 'waveform has no transparent pixel — it is a picture, not a mask');
    assert.ok(alpha.some(b => b >= 253), 'waveform has no opaque pixel — nothing would paint');

    // 3. 21:9, one rendition. The card's aspect branch assumes this shape.
    assert.strictEqual(alpha.length, AUDIO_WAVEFORM_PX.w * AUDIO_WAVEFORM_PX.h, 'waveform is not the baked size');
    assert.ok(Math.abs(AUDIO_WAVEFORM_PX.w / AUDIO_WAVEFORM_PX.h - 21 / 9) < 0.01, 'baked size is not 21:9');

    // 4. The envelope actually varies, and it FILLS the card. A mask drawn from
    //    silence, or one squeezed into a thin band at the centre line, passes (2)
    //    while telling the user nothing — which is exactly what the default
    //    `scale=lin` does to a quiet clip (4% of card height, measured).
    const { w, h } = AUDIO_WAVEFORM_PX;
    const extent = (x) => {
        let top = -1, bottom = -1;
        for (let y = 0; y < h; y++) if (alpha[y * w + x] > 8) { if (top < 0) top = y; bottom = y; }
        return top < 0 ? 0 : bottom - top + 1;
    };
    const heights = Array.from({ length: w }, (_, x) => extent(x));
    const loudest = Math.max(...heights);
    assert.ok(loudest > h * 0.5, `waveform is squashed — peak drew ${loudest}px of ${h}`);
    assert.ok(loudest - Math.min(...heights) > h * 0.1, 'waveform is flat — the envelope did not draw');

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log('audio waveform: mask alpha, name, aspect and envelope all hold');
})();
