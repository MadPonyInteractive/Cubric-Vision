'use strict';

/**
 * MPI-633 — the image rendition ladder.
 *
 * Two halves of one rule, and they have to agree: the CLIENT picks a rendition from
 * the card's rendered box, the SERVER decides what file that name lands on. A test
 * of only the picker would stay green while the server wrote `.1280.webp` somewhere
 * the picker never looks.
 *
 * `MpiGalleryGrid.js` cannot be imported here — it reaches `/js/utils/dom.js` by
 * absolute browser path, which Node resolves against the drive root — which is why
 * the rule lives in `js/utils/galleryRenditions.js` and not in the component.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { imageThumbPath, IMAGE_RENDITION_PX } = require('../services/ffmpegThumb');

const SMALL = '/project-file?path=x.thumb.webp';
const LARGE = '/project-file?path=x.thumb.1280.webp';
const FULL  = '/project-file?path=x.png';

let pickImageRendition;
let LARGE_RENDITION_MIN_BOX_PX;

test.before(async () => {
    const url = pathToFileURL(path.join(__dirname, '..', 'js', 'utils', 'galleryRenditions.js'));
    ({ pickImageRendition, LARGE_RENDITION_MIN_BOX_PX } = await import(url.href));
});

test('a small box takes the small rendition, a large box takes the large one', () => {
    const item = { thumbPath: SMALL, thumbPathLg: LARGE, filePath: FULL };
    assert.strictEqual(pickImageRendition(item, 253), SMALL, 'slider level 1 box');
    assert.strictEqual(pickImageRendition(item, 775), LARGE, 'slider level 4 box');
});

test('the boundary is exclusive — a box EQUAL to the small tier is covered by it', () => {
    const item = { thumbPath: SMALL, thumbPathLg: LARGE, filePath: FULL };
    const b = LARGE_RENDITION_MIN_BOX_PX;
    assert.strictEqual(pickImageRendition(item, b), SMALL, '512 pixels cover a 512 box');
    assert.strictEqual(pickImageRendition(item, b + 1), LARGE);
});

test('box 0 is how an off-screen card asks for the cheap rendition back', () => {
    // The demote path. Without this the ladder rests at 238 MB after a scroll to the
    // bottom instead of the 23.7 MB the visible band actually needs (validation.md M2).
    const item = { thumbPath: SMALL, thumbPathLg: LARGE, filePath: FULL };
    assert.strictEqual(pickImageRendition(item, 0), SMALL);
});

test('clamped to source: no large rendition means the ORIGINAL is that tier', () => {
    // A 1280x800 asset — most of them — never gets a `.1280.webp` written, because
    // that file would BE the original. A big card must land on filePath, not fall
    // back to the 512 thumb it is visibly upscaling.
    const item = { thumbPath: SMALL, thumbPathLg: null, filePath: FULL };
    assert.strictEqual(pickImageRendition(item, 775), FULL);
});

test('an item with no renditions at all falls back to filePath at every box', () => {
    const item = { filePath: FULL };
    assert.strictEqual(pickImageRendition(item, 0), FULL);
    assert.strictEqual(pickImageRendition(item, 2000), FULL);
});

test('a missing item never throws and never yields undefined', () => {
    assert.strictEqual(pickImageRendition(null, 775), '');
    assert.strictEqual(pickImageRendition({}, 775), '');
});

test('the server writes the names the picker looks for', () => {
    // The seam. `extractImageThumb` is handed `<id>.thumb.jpg` and the width; these
    // are the paths it returns, and the sidecar URLs are built from them.
    const asked = path.join('meta', 'abc.thumb.jpg');
    assert.strictEqual(
        path.basename(imageThumbPath(asked)),
        'abc.thumb.webp',
        'default width is the small tier and keeps the pre-MPI-633 name',
    );
    assert.strictEqual(
        path.basename(imageThumbPath(asked, { width: IMAGE_RENDITION_PX.small })),
        'abc.thumb.webp',
    );
    assert.strictEqual(
        path.basename(imageThumbPath(asked, { width: IMAGE_RENDITION_PX.large })),
        'abc.thumb.1280.webp',
    );
});

test('both rendition names survive the GC prefix match', () => {
    // `removeItemThumbs` in routes/projects.js sweeps `<id>.thumb.`, and the orphan
    // pass matches `^(.*)\.thumb\..+$`. A tier that fails either one outlives its
    // asset — which is what `(jpg|webp)` did to `.1280.webp` before MPI-633.
    const orphan = /^(.*)\.thumb\..+$/;
    for (const name of ['abc.thumb.jpg', 'abc.thumb.webp', 'abc.thumb.1280.webp']) {
        assert.ok(name.startsWith('abc.thumb.'), `${name} misses the delete prefix`);
        assert.strictEqual(orphan.exec(name)?.[1], 'abc', `${name} misses the orphan sweep`);
    }
});
