'use strict';

/**
 * MPI-394 — the Model Library grid must never go blank on a real state change.
 *
 * renderList() wipes bodySlot on install/uninstall/filter/search/draft, which destroys
 * every tile. When MpiTileSheet RE-CREATES the thumb, the replacement <img loading="lazy">
 * has no pixels and its load is deferred until after layout — so behind a busy main thread
 * the whole grid sat imageless for ~20s. The fix keeps the preview ELEMENTS alive in a
 * consumer-owned cache and re-parents them, so an already-decoded element paints in the
 * same frame.
 *
 * This is invisible at runtime when it breaks — nothing throws, the grid just blanks
 * again — so it is pinned here. There is no jsdom in this suite (see
 * settings-models-root-guard.test.cjs), so the renderer half is asserted on source text.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

const SHEET_JS = path.join(__dirname, '..', 'js', 'components', 'Primitives', 'MpiTileSheet', 'MpiTileSheet.js');
const MANAGER_JS = path.join(__dirname, '..', 'js', 'components', 'Compounds', 'LandingPages', 'MpiModelManager', 'MpiModelManager.js');

// Comments explain the OLD behaviour, so they must not satisfy or trip any assertion.
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('MpiTileSheet reuses cached thumb media instead of rebuilding it', async () => {
    const code = stripComments(await fs.readFile(SHEET_JS, 'utf8'));

    assert.match(code, /props\.previewCache/,
        'MpiTileSheet must accept a consumer-owned previewCache (MPI-394)');
    assert.match(code, /_previewCache\?\.get\(/,
        'the cache must be READ before a thumb element is built, or nothing is reused (MPI-394)');
    assert.match(code, /_previewCache\?\.delete\(/,
        'a preview that fires error must be evicted, else the placeholder never returns (MPI-394)');

    // Every thumb-media element must be built inside _previewMedia(). A second
    // construction site elsewhere is exactly the regression: that path would bypass
    // the cache and re-create the element on each rebuild.
    const helperAt = code.indexOf('function _previewMedia(');
    const builderAt = code.indexOf('function _buildTile(');
    assert.ok(helperAt > -1 && builderAt > helperAt,
        '_previewMedia must exist and precede _buildTile (MPI-394)');
    for (const m of code.matchAll(/mpi-tile__thumb-media/g)) {
        assert.ok(m.index > helperAt && m.index < builderAt,
            `thumb media is constructed outside _previewMedia at index ${m.index} — that site bypasses the cache (MPI-394)`);
    }

    assert.match(code, /\.poster\s*=/,
        'video previews need a poster: a 40MB mp4 must fetch its moov atom before it can show a frame (MPI-394)');
});

test('every Model Library tile sheet is handed the preview cache', async () => {
    const code = stripComments(await fs.readFile(MANAGER_JS, 'utf8'));

    assert.match(code, /const _previewCache = new Map\(\)/,
        'MpiModelManager owns the cache — the sheets are re-created on every render (MPI-394)');

    const mounts = [...code.matchAll(/MpiTileSheet\.mount\([\s\S]*?\);/g)];
    assert.ok(mounts.length > 0, 'expected at least one MpiTileSheet.mount in MpiModelManager');
    for (const m of mounts) {
        assert.match(m[0], /previewCache/,
            'a sheet mounted without previewCache rebuilds its previews and blanks that grid (MPI-394)');
    }
});

test('a whole-model uninstall registers itself so the toast does not say "updated"', async () => {
    const code = stripComments(await fs.readFile(MANAGER_JS, 'utf8'));

    // download:uninstalled carries no intent, so the whole-thing paths must mark
    // themselves; without this every uninstall reports the opposite of what happened.
    assert.match(code, /_wholeUninstalls\.add\(model\.id\)/,
        'the whole-model uninstall path must register its id (MPI-394)');
    assert.match(code, /_wholeUninstalls\.add\(pluginDepKey\(/,
        'the plugin uninstall path must register its key too (MPI-394)');
    assert.match(code, /_wholeUninstalls\.delete\(modelId\)/,
        'the download:uninstalled handler must consume-and-clear the marker (MPI-394)');
});
