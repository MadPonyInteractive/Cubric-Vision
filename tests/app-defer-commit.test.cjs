/**
 * app-defer-commit.test.cjs — MPI-306 Phase 3 (hold-until-Apply).
 *
 * An App result must not enter the project until the user applies it. The commit
 * is a single `addGroup` per built group in generationService's gallery branch;
 * `deferCommit` skips exactly that and hands the groups to the caller instead.
 *
 * Asserting the source contract rather than booting the renderer: the branch sits
 * mid-way through a 600-line async completion handler that needs ComfyUI, a live
 * project and the DOM. These checks fail if the guard is removed or the groups
 * stop reaching the caller — which is the regression that matters.
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
    // Exactly one addGroup call site in the gallery branch — a second, unguarded
    // one would commit behind the hold.
    assert.strictEqual((src.match(/await addGroup\(/g) || []).length, 1);
});

test('built groups reach onComplete so Apply can commit them', () => {
    const src = read('js/services/generationService.js');
    assert.match(src, /callbacks\.onComplete\?\.\(\{ item: firstItem, group: firstGroup, items: builtItems, groups \}\)/);
    assert.match(src, /deferred: !!opts\.deferCommit/, 'the complete event must declare it did not persist');
});

test('app runs defer and send NO gallery placeholder', () => {
    const src = read('js/services/appService.js');
    assert.match(src, /deferCommit: true/);
    assert.ok(!/placeholderGroup/.test(src), 'a placeholder would show a gallery card for an uncommitted run');
    assert.ok(!/mkPlaceholder/.test(src), 'orphaned placeholder builder must be gone');
});

test('Apply commits via addGroup and clears the pending groups first', () => {
    const src = read('js/components/Organisms/MpiBaseApp/MpiBaseApp.js');
    assert.match(src, /import \{ addGroup \} from '\.\.\/\.\.\/\.\.\/services\/projectService\.js'/);
    // Cleared BEFORE the await → a double-click cannot commit the same groups twice.
    assert.match(
        src,
        /const groups = _pendingGroups;\s*\n\s*_pendingGroups = null;/,
        'Apply must take-and-clear before awaiting',
    );
    assert.match(src, /for \(const g of groups\) await addGroup\(g\)/);
    // A re-run supersedes an unapplied result.
    assert.match(src, /_pendingGroups = null;[\s\S]{0,200}_paintPending\(\);/);
});
