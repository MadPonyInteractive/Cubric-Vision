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

// MPI-565 (second half) — revoking a frame whose preload is in flight kills that
// load: net::ERR_FILE_NOT_FOUND for a frame nobody else ever held. A burst
// previewer appends faster than a decode, so the ring evicts the frame the play
// head just started on — measured at 1ms apart on a live run. Every revoke must
// abort a matching in-flight preload FIRST.
test('_revokePreviewUrl aborts a matching in-flight preload before revoking', () => {
    const body = SRC.match(/function _revokePreviewUrl\(url\) \{([\s\S]*?)\n {12}\}/);
    assert.ok(body, '_revokePreviewUrl is not defined');
    const abortAt = body[1].indexOf('_abortPendingPreload(url)');
    const revokeAt = body[1].indexOf('URL.revokeObjectURL(url)');
    assert.ok(abortAt !== -1, 'revoke does not abort the pending preload');
    assert.ok(abortAt < revokeAt, 'the abort must run before the revoke, not after');
    assert.match(SRC, /_pendingPreload = next;/, 'the preloader is never registered as pending');
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
