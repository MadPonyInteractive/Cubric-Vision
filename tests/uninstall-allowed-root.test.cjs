// MPI-682 — the uninstall containment rail must be aimed at the root each dep class is
// actually anchored to.
//
// The uninstall loop resolves three classes of dep against three different roots, but
// the rail tested them all against `managedModelsRoot`. A `targetPath` dep is
// engine-anchored ON PURPOSE (MPI-222) and so is never inside that root: every one of
// them was undeletable, and the refusal reached the user as the reassuring "model files
// kept on disk; still installed". Measured 2026-09-02 on the user's own app —
// uninstalling Text to Speech freed 0 of 5.96GB behind 11 refusal warnings.
//
// If assertion 1 or 2 fails, a legitimate uninstall is silently refused again. If
// assertion 5 fails, the rail has been WIDENED instead of aimed and an uninstall can
// delete outside the area it manages — that is the one that destroys data.
const assert = require('assert');
const { pathToFileURL } = require('url');
const path = require('path');

const imp = (p) => import(pathToFileURL(path.resolve(p)).href);

(async () => {
    const { DEPS } = await imp('js/data/modelConstants/dependencies.js');
    const { _uninstallAllowedRoot: rootFor, _isInsidePath: inside } = require('../routes/downloadManager.js');
    const { getComfyPath, getEngineRoot } = require('../routes/platformEngine.js');

    const roots = {
        managedModelsRoot: path.join('G:', 'CubricModels'),
        defaultCustomNodesRoot: getComfyPath(getEngineRoot(), 'custom_nodes'),
    };
    const engineRoot = getComfyPath(getEngineRoot());

    // 1 — the bug itself, against a REAL registry dep rather than a fixture. Text to
    // Speech's transformer is the 2GB weight the user's uninstall could not free.
    const weightInNode = DEPS['chatterbox-t3'];
    assert.ok(weightInNode, 'chatterbox-t3 missing from DEPS');
    assert.ok(weightInNode.targetPath, 'chatterbox-t3 must be a targetPath dep for this test to mean anything');
    assert.strictEqual(
        rootFor(weightInNode, roots), engineRoot,
        'a targetPath weight is engine-anchored (MPI-222); testing it against the models root refuses every delete',
    );
    assert.notStrictEqual(
        rootFor(weightInNode, roots), roots.managedModelsRoot,
        'regression pin: this is exactly the root the old rail used, and it can never contain an engine-anchored path',
    );

    // 2 — every targetPath dep in the registry, not just the one that was reported.
    const targetPathDeps = Object.values(DEPS).filter(d => d && d.targetPath);
    assert.ok(targetPathDeps.length >= 2, 'expected the registry to carry several targetPath deps');
    for (const dep of targetPathDeps) {
        assert.strictEqual(rootFor(dep, roots), engineRoot, `targetPath dep ${dep.id} must be engine-anchored`);
    }

    // 3 — an ordinary weight still answers the managed models root, custom or default.
    const plainWeight = Object.values(DEPS).find(d => d && !d.targetPath && d.type !== 'custom_nodes');
    assert.ok(plainWeight, 'expected at least one plain weight dep');
    assert.strictEqual(rootFor(plainWeight, roots), roots.managedModelsRoot);

    // 4 — a custom_nodes dep still answers the custom nodes root. targetPath wins over
    // type: the rife ckpts declare `custom_nodes/...` as a targetPath and are weights.
    const node = Object.values(DEPS).find(d => d && d.type === 'custom_nodes' && !d.targetPath);
    assert.ok(node, 'expected at least one custom_nodes dep');
    assert.strictEqual(rootFor(node, roots), roots.defaultCustomNodesRoot);

    // 5 — THE RAIL IS AIMED, NOT WIDENED. A path that escapes the chosen root is still
    // refused, for every class. Without this the fix trades a stuck uninstall for a
    // delete that can walk out of the area the app manages.
    for (const [label, dep] of [['targetPath', weightInNode], ['weight', plainWeight], ['custom_nodes', node]]) {
        const root = rootFor(dep, roots);
        assert.ok(inside(root, path.join(root, 'inside.safetensors')), `${label}: a path in its own root must pass`);
        assert.ok(
            !inside(root, path.join(root, '..', '..', 'escaped.safetensors')),
            `${label}: a path outside its root must still be refused`,
        );
    }

    console.log('uninstall-allowed-root: 5 assertions passed');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
