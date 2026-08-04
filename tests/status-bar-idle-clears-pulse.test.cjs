// MPI-421 — reaching idle must stop the fill animating.
//
// `setIndeterminate(true)` adds `shell-info__fill--indeterminate` for a job with no
// progress signal (ESRGAN upscale, a mask detect). Only `complete()` ever removed it,
// on its way to the 100% flash — `cancel()` did not. So a STOPPED no-progress job left
// the bar sweeping under an `IDLE` label until the next job's `_beginActiveCycle()`
// happened to clear it, which is why it went unnoticed: pressing Cue "fixed" it.
//
// The fix is at the funnel, not the caller: `_setIdle()` is the one path every
// terminal reaches (complete, cancel, the MPI-208 store self-heal), the same reason
// the MPI-111 timer hard-stop lives there. This test holds it there.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js/shell/statusBar.js'), 'utf8');

/** Body of a top-level `function <name>() { … }` in statusBar.js. */
function body(name) {
    const at = SRC.indexOf(`function ${name}(`);
    assert.ok(at > 0, `${name}() is gone — re-anchor this test`);
    const open = SRC.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < SRC.length; i++) {
        if (SRC[i] === '{') depth++;
        else if (SRC[i] === '}' && --depth === 0) return SRC.slice(open, i + 1);
    }
    throw new Error(`unbalanced braces in ${name}()`);
}

test('_setIdle clears the indeterminate pulse', () => {
    assert.ok(/--indeterminate/.test(body('_setIdle')),
        'reaching idle leaves the fill animating — a Stopped detect/upscale sweeps forever under an IDLE label');
});

test('idle clears exactly what starting a cycle clears', () => {
    // The two must not drift: a class cleared only on the way IN survives at idle,
    // which is the bug above wearing a different name.
    const classes = (fn) => [...body(fn).matchAll(/'(shell-info__fill--[a-z]+)'/g)].map(m => m[1]).sort();
    assert.deepStrictEqual(classes('_setIdle'), classes('_beginActiveCycle'),
        'the enter/exit class lists disagree');
});

test('cancel still routes through idle', () => {
    // If cancel ever stops calling _setIdle, the fix above silently stops applying
    // to the Stop button that motivated it.
    const at = SRC.indexOf('cancel() {');
    assert.ok(at > 0, 'progress.cancel() is gone');
    assert.ok(SRC.slice(at, SRC.indexOf('\n        },', at)).includes('_setIdle()'),
        'cancel() no longer funnels through _setIdle');
});
