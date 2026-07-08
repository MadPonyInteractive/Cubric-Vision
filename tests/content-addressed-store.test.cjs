'use strict';

// MPI-227 Phase 1 — content-addressed preview-assets store.
// placeContentAsset(sourceUrl, ext, mediaDir, projectRoot) must:
//   - hash bytes → land at Media/.preview-assets/<sha256><ext>
//   - dedup: same bytes placed twice → ONE file, identical returned path
//   - different bytes → two distinct files
//   - leave no .tmp-* scratch behind

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs-extra');
const path = require('node:path');
const os = require('node:os');

const { placeContentAsset, computeFileSha256, migratePreviewAssetsStore } = require('../routes/projects.js');

function dataUrlPng(bytes) {
    return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

test('placeContentAsset dedups identical bytes to one file', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mpi227-'));
    const mediaDir = path.join(root, 'Media');
    await fs.ensureDir(mediaDir);
    try {
        const src = dataUrlPng([1, 2, 3, 4, 5]);

        const a = await placeContentAsset(src, '.png', mediaDir, root);
        const b = await placeContentAsset(src, '.png', mediaDir, root);

        assert.equal(a.absPath, b.absPath, 'same bytes → same flat path');
        assert.equal(a.sha256, b.sha256, 'same bytes → same hash');
        assert.ok(await fs.pathExists(a.absPath), 'placed file exists');

        const storeDir = path.join(mediaDir, '.preview-assets');
        const entries = await fs.readdir(storeDir);
        const real = entries.filter(f => !f.startsWith('.tmp-'));
        assert.equal(real.length, 1, 'dedup: exactly one content file on disk');
        assert.equal(entries.filter(f => f.startsWith('.tmp-')).length, 0, 'no temp scratch left');

        // filename is the sha, path is flat (no per-item subfolder)
        assert.equal(path.basename(a.absPath), `${a.sha256}.png`);
        assert.equal(path.dirname(a.absPath), storeDir);

        // hash matches an independent read of the placed file
        assert.equal(await computeFileSha256(a.absPath), a.sha256);
    } finally {
        await fs.remove(root);
    }
});

test('placeContentAsset writes two files for different bytes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mpi227-'));
    const mediaDir = path.join(root, 'Media');
    await fs.ensureDir(mediaDir);
    try {
        const a = await placeContentAsset(dataUrlPng([1, 1, 1]), '.png', mediaDir, root);
        const b = await placeContentAsset(dataUrlPng([2, 2, 2]), '.png', mediaDir, root);

        assert.notEqual(a.absPath, b.absPath, 'different bytes → different paths');
        const store = await fs.readdir(path.join(mediaDir, '.preview-assets'));
        assert.equal(store.filter(f => !f.startsWith('.tmp-')).length, 2, 'two content files');
    } finally {
        await fs.remove(root);
    }
});

// MPI-227 Phase 3 — migration flattens+dedups legacy per-item folders and rewrites
// sidecar refs. Builds a synthetic project with two per-item folders holding the
// SAME bytes (must collapse to one flat file) + a sidecar referencing the old path.
test('migratePreviewAssetsStore flattens, dedups, rewrites refs, is idempotent', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mpi227-'));
    const mediaDir = path.join(root, 'Media');
    const store = path.join(mediaDir, '.preview-assets');
    const metaDir = path.join(mediaDir, '.meta');
    const projFileUrl = (p) => `/project-file?path=${encodeURIComponent(p)}`;
    const idA = 'aaaaaaaa-1111-2222-3333-444444444444';
    const idB = 'bbbbbbbb-1111-2222-3333-444444444444';
    try {
        const bytes = Buffer.from([9, 9, 9, 9, 9]);
        const oldA = path.join(store, idA, 'startFrame.png');
        const oldB = path.join(store, idB, 'startFrame.png');
        await fs.ensureDir(path.dirname(oldA)); await fs.writeFile(oldA, bytes);
        await fs.ensureDir(path.dirname(oldB)); await fs.writeFile(oldB, bytes);

        // sidecar referencing the old per-item path in all three ref shapes
        await fs.ensureDir(metaDir);
        await fs.writeJson(path.join(metaDir, `${idA}.json`), {
            id: idA,
            previewAssets: { snapshots: [{ role: 'startFrame', mediaType: 'image', filename: 'startFrame.png', relativePath: `Media/.preview-assets/${idA}/startFrame.png`, filePath: projFileUrl(oldA), status: 'available' }] },
            generationSettings: { mediaItems: [{ id: 'x', source: 'previewAsset', role: 'startFrame', mediaType: 'image', url: projFileUrl(oldA), filePath: projFileUrl(oldA) }] },
        });

        const r1 = await migratePreviewAssetsStore(root);
        assert.equal(r1.migrated, true, 'migration ran');

        const after = await fs.readdir(store);
        const content = after.filter(f => /^[0-9a-f]{64}\.png$/.test(f));
        assert.equal(content.length, 1, 'identical frames dedup to ONE flat file');
        assert.equal(after.filter(f => f === idA || f === idB).length, 0, 'per-item folders removed');
        assert.ok(after.includes('.migrated-v1'), 'marker written');

        // sidecar refs now resolve to the flat file
        const decode = (v) => { const m = String(v).match(/[?&]path=([^&]+)/); return m ? decodeURIComponent(m[1]) : null; };
        const j = await fs.readJson(path.join(metaDir, `${idA}.json`));
        const snap = j.previewAssets.snapshots[0];
        assert.ok(await fs.pathExists(decode(snap.filePath)), 'snapshot.filePath resolves');
        assert.match(snap.filename, /^[0-9a-f]{64}\.png$/, 'filename is now the sha');
        const gi = j.generationSettings.mediaItems[0];
        assert.ok(await fs.pathExists(decode(gi.url)), 'mediaItem.url resolves');
        assert.ok(await fs.pathExists(decode(gi.filePath)), 'mediaItem.filePath resolves');

        const r2 = await migratePreviewAssetsStore(root);
        assert.equal(r2.migrated, false, 're-run is a no-op');
    } finally {
        await fs.remove(root);
    }
});
