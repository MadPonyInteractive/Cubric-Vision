// MPI-378. Tab stopped opening the radial and became the workspace flipper.
// Two things can break silently here:
//   1. resolveFlipTarget — the whole "does nothing at all" contract lives in its
//      return of null. A wrong branch navigates to a card that isn't there.
//   2. The Tab handover itself — Hotkeys.bind() on an id that is no longer in the
//      registry logs a warning and returns a no-op, so a half-done handover leaves
//      Tab dead with nothing thrown anywhere.

const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const group = (id, type = 'image') => ({ id, type });

test('resolveFlipTarget', async () => {
    const { resolveFlipTarget } = await import('../js/data/projectModel.js');

    // Nothing to flip to — Tab must do nothing at all.
    assert.equal(resolveFlipTarget(null), null);
    assert.equal(resolveFlipTarget({ itemGroups: [] }), null);

    // Exactly one card = the only thing Tab could mean, remembered or not.
    assert.equal(resolveFlipTarget({ itemGroups: [group('a')] }), 'a');
    assert.equal(resolveFlipTarget({ itemGroups: [group('a')], lastGroupId: 'gone' }), 'a');

    // Many cards: only the remembered one, and only while it still exists.
    const many = [group('a'), group('b'), group('c')];
    assert.equal(resolveFlipTarget({ itemGroups: many, lastGroupId: 'b' }), 'b');
    assert.equal(resolveFlipTarget({ itemGroups: many, lastGroupId: 'deleted' }), null);
    assert.equal(resolveFlipTarget({ itemGroups: many }), null);
    assert.equal(resolveFlipTarget({ itemGroups: many, lastGroupId: null }), null);

    // The gallery refuses to open audio groups as a history workspace, so the
    // flipper must not either — including the single-card shortcut.
    assert.equal(resolveFlipTarget({ itemGroups: [group('a', 'audio')] }), null);
    assert.equal(resolveFlipTarget({ itemGroups: [group('a', 'audio'), group('b')] }), 'b');
});

test('Tab is bound to the flipper and nothing still binds the dead radial id', () => {
    const registry = read('js/managers/hotkeyRegistry.js');
    assert.match(registry, /id:\s*'workspace\.flip'/, 'workspace.flip missing from the registry');
    assert.ok(!registry.includes("'radialMenu.toggle'"), 'radialMenu.toggle should be gone');
    // Ctrl+Tab dev ring is explicitly out of scope and must survive.
    assert.match(registry, /id:\s*'radialMenu\.devToggle'/);

    const nav = read('js/shell/navigation.js');
    assert.match(nav, /Hotkeys\.bind\('workspace\.flip'/, 'navigation must bind the flipper');
    assert.ok(!nav.includes('RADIAL_ITEMS'), 'the workspace radial items should be gone');

    const radial = read('js/components/Primitives/MpiRadialMenu/MpiRadialMenu.js');
    assert.ok(!radial.includes("'radialMenu.toggle'"), 'the radial must not bind bare Tab any more');
    assert.match(radial, /Hotkeys\.bind\('radialMenu\.devToggle'/);
});

test('clear-on-delete lives in the service, not at the removeGroup call sites', () => {
    const service = read('js/services/projectService.js');
    assert.match(service, /lastGroupId: null/, 'removeGroup must clear the remembered card');

    // Four call sites; a fix patched into any of them is bypassable.
    for (const p of [
        'js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js',
        'js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js',
    ]) {
        assert.ok(!read(p).includes('lastGroupId'), `${p} must not touch lastGroupId`);
    }
});
