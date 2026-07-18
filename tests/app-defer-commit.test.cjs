/**
 * app-defer-commit.test.cjs — MPI-306.
 *
 * Hold-until-Apply was BUILT (bcbe161f) and REMOVED after the UX pass: app
 * results now commit on completion and the pane just says so. What survives is
 * the plumbing that outlived the feature and the bug the feature exposed.
 *
 * `deferCommit` stays on startGeneration — it is correct, proven, and the only
 * thing standing between a caller and an uncommitted generation. No caller uses
 * it today; these tests keep it honest for the one that will.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('the gallery addGroup loop is guarded by deferCommit', () => {
    const src = read('js/services/generationService.js');
    assert.match(
        src,
        /if \(!opts\.deferCommit\) \{\s*\n\s*for \(const g of groups\) await addGroup\(g\);/,
        'the ONLY project write in the gallery branch must be behind !opts.deferCommit',
    );
    assert.strictEqual((src.match(/await addGroup\(/g) || []).length, 1);
});

test('built groups reach onComplete so a deferred caller can commit them', () => {
    const src = read('js/services/generationService.js');
    assert.match(src, /callbacks\.onComplete\?\.\(\{ item: firstItem, group: firstGroup, items: builtItems, groups \}\)/);
    assert.match(src, /deferred: !!opts\.deferCommit/, 'the complete event must declare whether it persisted');
});

test('app runs commit on completion and send NO gallery placeholder', () => {
    const src = read('js/services/appService.js');
    assert.ok(!/deferCommit/.test(src), 'apps commit on completion — Apply was removed');
    assert.ok(!/placeholderGroup/.test(src), 'the app pane shows the run; a gallery placeholder is noise');
    assert.ok(!/mkPlaceholder/.test(src), 'orphaned placeholder builder must be gone');
});

test('the Apply affordance is fully gone from the app frame', () => {
    const src = read('js/components/Organisms/MpiBaseApp/MpiBaseApp.js');
    // Orphans left behind by a half-revert would still render or still be declared.
    assert.ok(!/_pendingGroups/.test(src), '_pendingGroups must be gone');
    assert.ok(!/_applyRow/.test(src), '_applyRow must be gone');
    assert.ok(!/function _apply\b/.test(src), '_apply must be gone');
    assert.ok(!/from '\.\.\/\.\.\/\.\.\/services\/projectService\.js'/.test(src),
        'the addGroup import was only for Apply');
    assert.match(src, /Saved to your gallery/, 'the pane must report the save');
});

test('the gallery repaints when a group is ADDED, not only when a gen completes', () => {
    const src = read('js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js');
    // Found via hold-until-Apply: the grid repainted only via generation:complete,
    // which worked by accident because addGroup ran inside that handler. The
    // listener outlives the feature that exposed it — any out-of-band commit
    // (import, undo, a future deferred caller) repaints for free.
    assert.match(src, /Events\.on\('project:group-added'/, 'gallery must listen for project:group-added');
});
