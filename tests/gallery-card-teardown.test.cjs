// MPI-565 — a removed gallery card must be torn down, not just detached.
//
// A card's latent-preview playback is a setInterval and its mascot flip re-arms
// itself with setTimeout. Removing the wrapper from the DOM stops neither. A
// detached card therefore keeps painting its clip forever — including the blob
// URLs its own generation revoked when it ended — which the browser reports as
// net::ERR_FILE_NOT_FOUND at the clip rate, one stream per removed card, for the
// rest of the session.
//
// The card is built inside a closure in MpiGalleryGrid.js and the module graph
// only resolves in a browser (absolute /js/... imports), so this is a source
// check: it fails the moment a new removal path detaches a card without
// destroying it, which is exactly how the bug was introduced.

const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'components', 'Compounds', 'MpiGalleryGrid', 'MpiGalleryGrid.js'),
    'utf8',
);

test('the card element exposes destroy(), stopping both of its timers', () => {
    const body = SRC.match(/cardEl\.destroy = \(\) => \{([\s\S]*?)\n {12}\};/);
    assert.ok(body, 'cardEl.destroy is not defined');
    assert.match(body[1], /_stopPreviewPlayback\(\)/, 'destroy leaves the preview interval running');
    assert.match(body[1], /_stopMascotFlip\(\)/, 'destroy leaves the mascot timer re-arming');
});

test('every path that detaches a card destroys it first', () => {
    const lines = SRC.split('\n');
    const detaches = [];
    lines.forEach((line, i) => {
        if (/^\s*entry\.el\.remove\(\);\s*$/.test(line)) detaches.push(i);
    });
    assert.ok(detaches.length >= 2, `expected the known removal paths, found ${detaches.length}`);
    for (const i of detaches) {
        assert.match(
            lines[i - 1],
            /entry\.card\.el\.destroy\?\.\(\)/,
            `card detached without teardown at MpiGalleryGrid.js:${i + 1}`,
        );
    }
});
