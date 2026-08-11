'use strict';

// The release-notes approval preview must be byte-for-byte what the overlay renders.
//
// That promise is the entire point of the gate: the user reads the preview, approves
// it, and a hash of that text unlocks the build. It was broken for any escaped
// character — the extractor regex hands back the RAW source between the quotes, so a
// changelog line written as 'the video\'s speed' previewed (and hashed) as
// "the video\'s speed", backslash included, while the app — which imports the module
// and lets the JS engine resolve the escape — shows "the video's speed".
//
// Caught on the 1.4.1 approval, 2026-08-11. This pins the two halves against each
// other: what the script extracts, and what an import actually yields.

const test = require('node:test');
const assert = require('node:assert/strict');

test('the approval preview matches what the app imports, escapes and all', async () => {
    const [{ extractNotesForVersion }, { RELEASE_NOTES }] = await Promise.all([
        import('../scripts/release-notes-approval.mjs'),
        import('../js/data/releaseNotes.js'),
    ]);

    const versions = Object.keys(RELEASE_NOTES);
    assert.ok(versions.length, 'no release notes to check');

    for (const version of versions) {
        const extracted = await extractNotesForVersion(version);
        const real = RELEASE_NOTES[version];
        assert.ok(extracted, `${version}: the extractor found no entry the app can see`);

        for (const key of ['whatIsNew', 'fixes', 'breakingChanges', 'importantChanges', 'engineNotes']) {
            assert.deepEqual(
                extracted[key] || [], real[key] || [],
                `REGRESSION in ${version}.${key}: the approval preview is not the text the app `
                + 'renders. Whatever the user approves is then not what ships — and the hash '
                + 'locks in the wrong string.',
            );
        }
    }
});

test('an escaped apostrophe survives extraction as a plain apostrophe', async () => {
    // The specific defect, pinned directly: deepEqual above only catches it while a
    // release entry happens to contain an escape. This one always does.
    const { RELEASE_NOTES } = await import('../js/data/releaseNotes.js');
    const all = Object.values(RELEASE_NOTES)
        .flatMap(r => [...(r.whatIsNew || []), ...(r.fixes || []), ...(r.breakingChanges || []),
            ...(r.importantChanges || []), ...(r.engineNotes || [])]);

    for (const line of all) {
        assert.ok(
            !line.includes('\\'),
            `REGRESSION: a release-note line carries a literal backslash — "${line.slice(0, 80)}…". `
            + 'Users see it verbatim; the overlay renders these as plain text.',
        );
    }
});
