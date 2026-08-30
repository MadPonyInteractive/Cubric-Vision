/**
 * multi-audio-card-label.test.cjs — MPI-663.
 *
 * The Stems flow lands FOUR audio cards from one run. Every one is the same op, the same
 * mediaType and the same duration, so `getFilePrefix(operation)` names all four "Stems"
 * and the user has to open each to find out which is the vocal. The only thing that knows
 * is the graph: its four saves carry `filename_prefix: stems/Bass … stems/Vocals`, so
 * ComfyUI writes `Bass_00001_.flac`, and `labelFromComfyOutputUrl` reads that back.
 *
 * Nothing about a wrong answer here is visible until a user is four cards deep in a DAW,
 * which is why the strip is pinned rather than eyeballed.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const esm = p => import('file://' + path.join(__dirname, '..', p).replace(/\\/g, '/'));

test('a stem card is named for the stem, not for the op', async () => {
    const { labelFromComfyOutputUrl } = await esm('js/utils/comfyOutputUrls.js');

    const view = (filename, subfolder = 'stems') =>
        `http://127.0.0.1:8188/view?filename=${encodeURIComponent(filename)}&type=output&subfolder=${subfolder}`;

    for (const stem of ['Bass', 'Drums', 'Other', 'Vocals']) {
        assert.equal(labelFromComfyOutputUrl(view(`${stem}_00001_.flac`)), stem);
    }
    // The counter keeps climbing across runs in the same output folder, and ComfyUI's
    // trailing underscore is part of the pattern, not of the name.
    assert.equal(labelFromComfyOutputUrl(view('Vocals_00147_.flac')), 'Vocals');
    assert.equal(labelFromComfyOutputUrl(view('Vocals_00147.flac')), 'Vocals');

    // No filename in the URL, or nothing left after the strip → null, and the caller
    // falls back to the op's own prefix rather than naming a card the empty string.
    assert.equal(labelFromComfyOutputUrl('http://127.0.0.1:8188/view?type=output'), null);
    assert.equal(labelFromComfyOutputUrl(view('_00001_.flac')), null);
    assert.equal(labelFromComfyOutputUrl(''), null);
    assert.equal(labelFromComfyOutputUrl(null), null);
});
