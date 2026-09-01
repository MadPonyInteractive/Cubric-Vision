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

test('add-from-cards re-points splatPath at the copy, never the source project', async (t) => {
    const express = require('express');
    const projectsRouter = require('../routes/projects.js');

    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mpi623-copy-'));
    const app = express();
    app.use(express.json());
    app.use(projectsRouter);
    const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });

    // A Scene card in the SOURCE project: the still is the card, the `.ply` its companion.
    const srcRoot = path.join(root, 'src');
    const srcMeta = path.join(srcRoot, 'Media', '.meta');
    const dstRoot = path.join(root, 'dst');
    const dstMeta = path.join(dstRoot, 'Media', '.meta');
    await fs.ensureDir(srcMeta);
    await fs.ensureDir(dstMeta);
    await fs.writeJson(path.join(dstRoot, 'project.json'), { id: 'dst', itemGroups: [] });

    const url = (p) => `/project-file?path=${encodeURIComponent(p)}`;
    const srcStill = path.join(srcRoot, 'Media', 'scene_001.png');
    const srcPly = path.join(srcMeta, `${ID}.splat.ply`);
    await fs.writeFile(srcStill, 'still-bytes');
    await fs.writeFile(srcPly, 'ply-bytes-387mb-in-real-life');
    await fs.writeJson(path.join(srcMeta, `${ID}.json`),
        { id: ID, type: 'image', filePath: url(srcStill), splatPath: url(srcPly) });

    const copy = async () => {
        const res = await fetch(
            `http://127.0.0.1:${server.address().port}/project-media/dst/add-from-cards`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    folderPath: dstRoot,
                    cards: [{ type: 'image', name: 'Scene', item: { id: ID, filePath: url(srcStill), splatPath: url(srcPly) } }],
                }),
            });
        return res.json();
    };
    // The copy is the sidecar carrying a freshly-minted id, never the source's.
    const copiedMeta = async () => {
        const written = (await fs.readdir(dstMeta)).filter(f => f.endsWith('.json') && !f.startsWith(ID));
        assert.equal(written.length, 1, 'exactly one sidecar per copied card');
        return fs.readJson(path.join(dstMeta, written[0]));
    };
    const destOf = (fileUrl) => decodeURIComponent(String(fileUrl).replace(/^.*[?&]path=/, ''));

    try {
        await t.test('the .ply travels and the copy owns it', async () => {
            assert.deepEqual(await copy(), { success: true, added: 1 });

            const meta = await copiedMeta();
            assert.notEqual(meta.id, ID, 'the copy is a new item, not the source id');

            const landed = destOf(meta.splatPath);
            assert.equal(landed, path.join(dstMeta, `${meta.id}.splat.ply`),
                'splatPath must name the DESTINATION companion, on the id the copy was given');
            assert.equal(await fs.readFile(landed, 'utf8'), 'ply-bytes-387mb-in-real-life',
                'the .ply was copied, not merely re-pointed at');
            // The failure this whole test exists for: a path that reads as perfectly
            // valid right up until the source project is deleted.
            assert.equal(landed.startsWith(srcRoot), false,
                'the copy must not point back into the source project');
            assert.equal(await fs.pathExists(srcPly), true, 'copy, not move — the source keeps its .ply');
        });

        await t.test('a splatPath whose .ply is gone is dropped, not inherited', async () => {
            await fs.emptyDir(dstMeta);
            await fs.remove(srcPly);

            assert.deepEqual(await copy(), { success: true, added: 1 });

            const meta = await copiedMeta();
            assert.equal('splatPath' in meta, false,
                'an unreachable .ply must leave no URL behind — the sidecar is cloned wholesale');
        });
    } finally {
        await new Promise(r => server.close(r));
        await fs.remove(root);
    }
});

test('only an image item carries splatPath', async () => {
    const { createImageItem, createVideoItem, createAudioItem } =
        await import('../js/data/projectModel.js');

    assert.equal(createImageItem().splatPath, null, 'declared, so it survives a spread');
    assert.equal('splatPath' in createVideoItem(), false);
    assert.equal('splatPath' in createAudioItem(), false);
});

// ── The ingest (MPI-623 Phase 2) ──────────────────────────────────────────────
//
// `Output_Splat` reports the TRAINER's own path, not a save node's file dict, so
// the `.ply` is not in the project until this route fetches it. Everything here
// fails silently too: no fetch and the Scene card is just a still with no scene
// behind it; a `splatPath` written when the fetch failed is a card that looks
// right until it is opened, three hours after the bake that produced it.

// A real 1x1 PNG: the still goes through ffmpeg's thumbnailer, and fake bytes
// make it fail loudly (it recovers, but buries the run in decode errors).
const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64');

/** A stand-in for ComfyUI's authed `/view` proxy: two files, one 404. */
async function serveViews(files) {
    const http = require('node:http');
    const server = http.createServer((req, res) => {
        const name = new URL(req.url, 'http://x').searchParams.get('filename');
        const body = files[name];
        if (body === undefined) { res.statusCode = 404; res.end('nope'); return; }
        res.end(body);
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}/view?filename=`;
    return { server, url: (n) => base + encodeURIComponent(n) };
}

test('save-generation fetches the .ply into the project and stamps splatPath', async (t) => {
    const express = require('express');
    const projectsRouter = require('../routes/projects.js');

    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mpi623-ingest-'));
    const metaDir = path.join(root, 'Media', '.meta');
    await fs.ensureDir(metaDir);
    await fs.writeJson(path.join(root, 'project.json'), { id: 'p', itemGroups: [] });

    const views = await serveViews({
        'scene_001.png': TINY_PNG,
        'scene.ply': 'ply-bytes-387mb-in-real-life',
    });
    const app = express();
    app.use(express.json());
    app.use(projectsRouter);
    const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });

    const save = (splatViewUrl, itemId) => fetch(
        `http://127.0.0.1:${server.address().port}/project/save-generation`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folderPath: root,
                comfyViewUrl: views.url('scene_001.png'),
                splatViewUrl,
                itemId,
                operation: 'flow3dSceneBake',
                mediaType: 'image',
                // Supplied so the sharp probe is skipped — the still is fake bytes.
                pixelDimensions: { w: 1024, h: 512 },
            }),
        }).then(r => r.json());

    const destOf = (fileUrl) => decodeURIComponent(String(fileUrl).replace(/^.*[?&]path=/, ''));

    try {
        await t.test('the .ply lands as the item-owned companion', async () => {
            const res = await save(views.url('scene.ply'), ID);
            assert.equal(res.success, true);

            const landed = path.join(metaDir, `${ID}.splat.ply`);
            assert.equal(await fs.readFile(landed, 'utf8'), 'ply-bytes-387mb-in-real-life',
                'the bytes must be fetched, not merely referenced on the engine');

            // The naming is not cosmetic: DERIVATIVE_RE is what sweeps this file on
            // delete, and it matches on `<id>.splat.`.
            assert.equal(DERIVATIVE_RE.exec(`${ID}.splat.ply`)?.[1], ID);

            const meta = await fs.readJson(path.join(metaDir, `${ID}.json`));
            assert.equal(destOf(meta.splatPath), landed,
                'the sidecar must point at the companion inside THIS project');
            assert.equal(res.splatPath, meta.splatPath,
                'the response carries it too — the live card must open without a reload');
        });

        await t.test('a .ply that cannot be fetched leaves no splatPath and no stub', async () => {
            const id2 = OTHER;
            const res = await save(views.url('gone.ply'), id2);

            // The still is worth keeping: the bake ran, and the card is the evidence.
            assert.equal(res.success, true, 'a failed .ply must not fail the whole save');
            assert.equal(res.splatPath, null);

            const meta = await fs.readJson(path.join(metaDir, `${id2}.json`));
            assert.equal('splatPath' in meta, false,
                'a half-set splatPath is a card that 404s when opened — it must be absent');
            assert.equal(await fs.pathExists(path.join(metaDir, `${id2}.splat.ply`)), false,
                'the truncated download must be removed, not left for the GC to inherit');
        });

        await t.test('a run with no Output_Splat writes an ordinary image card', async () => {
            const id3 = '33333333-3333-3333-3333-333333333333';
            const res = await save(null, id3);

            assert.equal(res.success, true);
            assert.equal(res.splatPath, null);
            const meta = await fs.readJson(path.join(metaDir, `${id3}.json`));
            assert.equal('splatPath' in meta, false, 'every other op must be untouched by this');
        });
    } finally {
        await new Promise(r => server.close(r));
        await new Promise(r => views.server.close(r));
        await fs.remove(root);
    }
});

test('the splat URL is threaded to the first item only, and only for an image', () => {
    // Wiring, not maths — but it cannot run headless (it needs a live bake), and
    // each of these branches fails silently in its own way.
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'js/services/generationService.js'), 'utf8');

    assert.match(src, /splatViewUrl: \(i === 0\) \? \(outputInfo\.splatUrl \|\| null\) : null/,
        'a bake produces ONE scene: the .ply belongs to the first item, not to each');
    // Handed to every item, N cards would each fetch the same hundreds of MB.
    assert.match(src, /if \(!isVideo && !isAudio && savedData\?\.splatPath\) baseProps\.splatPath = savedData\.splatPath;/,
        'the live item must carry splatPath, and only an image item may carry it');

    const client = fs.readFileSync(
        path.join(__dirname, '..', 'js/services/projectService.js'), 'utf8');
    // The hop that silently drops it: present in the signature, missing from the body.
    assert.match(client, /body: JSON\.stringify\(\{[^}]*splatViewUrl/,
        'saveGeneration must actually POST splatViewUrl, not just accept it');
});
