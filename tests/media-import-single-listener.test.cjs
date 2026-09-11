/**
 * tests/media-import-single-listener.test.cjs — MPI-723.
 *
 * `media:imported` is emitted by four ingest surfaces, and exactly one listener
 * turns it into an ItemGroup. That listener must be app-lifetime: until MPI-723
 * it lived inside MpiGalleryBlock, and since navigation destroys the outgoing
 * Block before mounting the next, only one Block is ever mounted — so an import
 * from the history workspace wrote the file and its sidecar to disk and never
 * became a card. A silent orphan, with nothing on screen to say so.
 *
 * The regression is invisible from inside the gallery (where it still works),
 * which is why it is asserted statically instead.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** Every `.js` under js/, recursively, repo-relative with forward slashes. */
function jsFiles(dir = 'js') {
    const abs = path.join(ROOT, dir);
    return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) return jsFiles(rel);
        return e.name.endsWith('.js') ? [rel] : [];
    });
}

/** Files holding an `Events.on('media:imported'` subscription. */
function listenerFiles() {
    return jsFiles().filter((rel) =>
        /Events\.on\(\s*['"]media:imported['"]/.test(
            fs.readFileSync(path.join(ROOT, rel), 'utf8'),
        ),
    );
}

test('the media:imported -> ItemGroup build has exactly one listener, and it is a service', () => {
    const files = listenerFiles();

    // projectStatsService only refreshes a byte count off the same event — it
    // builds nothing, so it is a legitimate second subscriber.
    assert.deepStrictEqual(
        files.sort(),
        ['js/services/mediaImportService.js', 'js/services/projectStatsService.js'],
        `unexpected media:imported listeners: ${files.join(', ')}`,
    );
});

test('no Block or component listens for media:imported', () => {
    const offenders = listenerFiles().filter((rel) => rel.startsWith('js/components/'));
    assert.deepStrictEqual(
        offenders,
        [],
        `a component subscribes to media:imported and will miss every import made from another workspace: ${offenders.join(', ')}`,
    );
});

test('the service is started from the shell, not from a Block', () => {
    const shell = fs.readFileSync(path.join(ROOT, 'js/shell.js'), 'utf8');
    assert.match(shell, /from\s+'\.\/services\/mediaImportService\.js'/);
    assert.match(shell, /startMediaImport\(\)/);
});
