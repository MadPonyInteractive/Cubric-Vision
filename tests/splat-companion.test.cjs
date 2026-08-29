'use strict';

// MPI-623 Phase 1 — a 3D Scene card is an IMAGE card carrying a `.ply`.
//
// The `.ply` is ~387MB and lives at `.meta/<id>.splat.ply`, riding the same
// item-owned-companion convention as the thumbs and the video proxy. Everything
// this test guards fails SILENTLY:
//   - drop `splat` from DERIVATIVE_RE and every deleted Scene leaks 387MB forever,
//     with no error and nothing in the UI to notice;
//   - widen it carelessly and it eats the item's own sidecar or media file, which
//     deletes cards that were never asked to be deleted;
//   - forget the companion copy in `add-from-cards` and the copied card carries a
//     `splatPath` into the SOURCE project — fine until that project is deleted.

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs-extra');
const path = require('node:path');
const os = require('node:os');

const { DERIVATIVE_RE, removeItemThumbs } = require('../routes/projects.js');

const ID = '11111111-2222-3333-4444-555555555555';
const OTHER = '99999999-8888-7777-6666-555555555555';

test('DERIVATIVE_RE claims a splat without swallowing the item itself', () => {
    const owns = (name) => DERIVATIVE_RE.exec(name)?.[1];

    assert.equal(owns(`${ID}.splat.ply`), ID, 'the .ply is owned by its item id');
    // The pre-existing companions must still match — this regex is the ONLY list.
    assert.equal(owns(`${ID}.thumb.jpg`), ID);
    assert.equal(owns(`${ID}.thumb.webp`), ID);
    assert.equal(owns(`${ID}.thumb.1280.webp`), ID);
    assert.equal(owns(`${ID}.proxy.mp4`), ID);

    // Anything that is not a companion must NOT match: matching here means the
    // delete sweep and the orphan GC would remove a live card's own files.
    assert.equal(owns(`${ID}.json`), undefined, 'the sidecar is not a companion');
    assert.equal(owns(`${ID}.ply`), undefined, 'a bare .ply is not the naming we write');
    assert.equal(owns('scene_001.png'), undefined, 'a media file is not a companion');
});

test('deleting an item sweeps its splat and leaves every other item alone', async () => {
    const metaDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mpi623-'));
    try {
        const files = [
            `${ID}.json`,
            `${ID}.splat.ply`,
            `${ID}.thumb.webp`,
            `${OTHER}.splat.ply`,
            `${OTHER}.json`,
        ];
        for (const f of files) await fs.writeFile(path.join(metaDir, f), 'x');

        removeItemThumbs(metaDir, ID);
        const left = (await fs.readdir(metaDir)).sort();

        // The sidecar is removed by the caller, not by this sweep.
        assert.deepEqual(left, [`${ID}.json`, `${OTHER}.json`, `${OTHER}.splat.ply`].sort());
    } finally {
        await fs.remove(metaDir);
    }
});

test('add-from-cards re-points splatPath at the copy, never the source project', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'projects.js'), 'utf8');
    const route = src.slice(src.indexOf("add-from-cards', async"));
    const block = route.slice(0, route.indexOf('newGroups.push'));

    // The sidecar is cloned wholesale, so a missing rewrite is not a missing field —
    // it is a stale absolute path into another project that reads as valid.
    assert.match(block, /srcSplat/, 'the copy loop handles the splat companion');
    assert.match(block, /meta\.splatPath = `\/project-file\?path=\$\{encodeURIComponent\(destSplat\)\}`/,
        'splatPath is rewritten to the destination copy');
    assert.match(block, /delete meta\.splatPath/,
        'a card with no reachable .ply must not inherit the source URL');
});

test('only an image item carries splatPath', async () => {
    const { createImageItem, createVideoItem, createAudioItem } =
        await import('../js/data/projectModel.js');

    assert.equal(createImageItem().splatPath, null, 'declared, so it survives a spread');
    assert.equal('splatPath' in createVideoItem(), false);
    assert.equal('splatPath' in createAudioItem(), false);
});
