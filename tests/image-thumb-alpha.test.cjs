'use strict';
// MPI-627 — a gallery thumb of a background-removed image must keep its cut-out.
//
// The bug was NOT "a white backdrop appears behind the subject". Background removal
// writes the mask into the ALPHA channel and leaves the source RGB untouched, so
// flattening that PNG into the 512px JPG thumb restored the ORIGINAL image whole —
// backdrop, drop-shadow and all. The gallery card looked like the pre-removal
// import, which is exactly how it was first reported.
//
// The check that matters is therefore not the file extension but whether a
// transparent pixel survives the thumb. Everything else here (the synthetic source,
// the alphaextract read-back) exists only to ask that one question without a fixture.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { ffmpegPath } = require('../services/ffmpegBinary');
const { extractImageThumb, imageThumbPath } = require('../services/ffmpegThumb');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mpi-thumb-'));

/** true when at least one pixel is non-opaque */
function hasTransparency(file) {
    const raw = execFileSync(ffmpegPath, [
        '-v', 'error', '-i', file,
        '-vf', 'alphaextract,scale=64:64',
        '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-',
    ], { maxBuffer: 8 * 1024 * 1024 });
    return raw.some(b => b < 250);
}

// A stand-in for a background-removed output: opaque RGB everywhere (so a flatten
// would show a full frame), transparent everywhere outside a centred box.
const cutout = path.join(tmp, 'cutout.png');
execFileSync(ffmpegPath, [
    '-y', '-v', 'error',
    '-f', 'lavfi', '-i', 'color=c=red:s=600x600',
    '-f', 'lavfi', '-i', 'color=c=black:s=600x600',
    '-f', 'lavfi', '-i', 'color=c=white:s=300x300',
    '-filter_complex', '[1][2]overlay=150:150[a];[0][a]alphamerge',
    '-frames:v', '1', cutout,
]);
assert.ok(hasTransparency(cutout), 'fixture is not actually transparent');

// 1. The written path is the WebP one, whatever extension the caller asked for.
const asked = path.join(tmp, 'x.thumb.jpg');
const written = extractImageThumb(cutout, asked);

(async () => {
    const out = await written;
    assert.strictEqual(out, imageThumbPath(asked), 'thumb did not land at the .webp path');
    assert.strictEqual(out, path.join(tmp, 'x.thumb.webp'));
    assert.ok(fs.existsSync(out), 'no thumb file was written');
    assert.ok(!fs.existsSync(asked), 'a JPG was written alongside the WebP');

    // 2. THE REGRESSION: the cut-out survives the downscale. A JPG thumb fails here
    //    by showing the untouched source, not by showing white.
    assert.ok(hasTransparency(out), 'thumb lost the cut-out — it is showing the original image');

    // 3. An opaque source still thumbs fine (no alpha required to succeed).
    const opaque = path.join(tmp, 'opaque.png');
    execFileSync(ffmpegPath, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=600x600', '-frames:v', '1', opaque]);
    const opaqueThumb = await extractImageThumb(opaque, path.join(tmp, 'y.thumb.jpg'));
    assert.ok(opaqueThumb && fs.existsSync(opaqueThumb), 'opaque source produced no thumb');

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log('image-thumb-alpha: all assertions passed');
})();
