/**
 * flow-step-param-binding.test.cjs — MPI-572.
 *
 * A step that declares `param` binds its gizmo's value to an injection param.
 * This is what replaced `MpiFlowHeadSwap.getInputs({ stepValues })` — the last
 * thing a FlowDef needed a JS component for, and therefore the last thing
 * blocking MPI-531's acceptance clause ("the FlowDef is fully expressible as a
 * third-party manifest").
 *
 * The coord contract is the fragile half: `MpiStepBox` reports absolute TOP-LEFT
 * SOURCE PIXELS and `Mpi Box` consumes exactly that, so the key rename is the
 * ONLY permitted transform. Arithmetic here is the centre-anchor bug
 * (box-gizmo.md § Coord contract).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const repo = p => path.join(__dirname, '..', p);
const read = p => fs.readFileSync(repo(p), 'utf8');
const kinds = () => import('file://' + repo('js/components/Organisms/MpiBaseFlow/stepKinds.js').replace(/\\/g, '/'));

test('the box adapter renames w/h and passes coords unconverted', async () => {
    const { stepValueToParam } = await kinds();
    const reported = { box: { x: 37, y: 412, w: 256, h: 256 }, fields: { ratio: '1' } };

    assert.deepStrictEqual(
        stepValueToParam('box', reported),
        { x: 37, y: 412, width: 256, height: 256 },
        'the rename is the only transform — any arithmetic is the centre-anchor bug',
    );
});

test('nothing to send yields null, so the node keeps its baked default', async () => {
    const { stepValueToParam } = await kinds();

    assert.strictEqual(stepValueToParam('box', null), null, 'no value at all');
    assert.strictEqual(stepValueToParam('box', { fields: {} }), null, 'step visited, never boxed');
    assert.strictEqual(stepValueToParam('preview', { any: 1 }), null, 'a kind that reports nothing');
    assert.strictEqual(stepValueToParam('nope', { box: {} }), null, 'an unregistered kind');
});

test('the frame binds declared params and omits the nulls', () => {
    const src = read('js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js');

    assert.match(src, /if \(!step\?\.param \|\| !step\.role\) return;/,
        'a step with no `param` must contribute nothing');
    // A null must be OMITTED, not sent as null — that is what preserves the baked
    // default. Both forms of `param` have to honour it: the whole value for a string,
    // and each named key for a map (MPI-596).
    assert.match(src, /if \(v === null \|\| v === undefined\) return;/,
        'a null value must be omitted whole');
    assert.match(src, /if \(typeof step\.param === 'string'\) \{\s*\n\s*declaredParams\[step\.param\] = v;/,
        'the string form still binds the whole value');
    assert.match(src, /if \(v\[key\] === null \|\| v\[key\] === undefined\) continue;\s*\n\s*declaredParams\[name\] = v\[key\];/,
        'the map form must skip a null key rather than send it');
});

test('the place adapter reports BOTH the region and the mode (MPI-596)', async () => {
    const { stepValueToParam } = await kinds();
    const placed = { mode: 'manual', place: { cx: 300, cy: 200, halfW: 128, halfH: 128 } };

    assert.deepStrictEqual(
        stepValueToParam('place', placed),
        { region: { x: 172, y: 72, width: 256, height: 256 }, mode: 2 },
        'the region is absolute top-left source pixels, same unit as box; mode is the 1-based MpiAnySwitch selector',
    );
    // The MODE SURVIVES AN EMPTY GIZMO, and that is the point: it decides which arm of
    // the graph runs whether or not the user has drawn a region yet. Auto is 1.
    assert.deepStrictEqual(stepValueToParam('place', null), { region: null, mode: 1 });
    assert.deepStrictEqual(stepValueToParam('place', { mode: 'auto' }), { region: null, mode: 1 });
});

test('a step whose kind reports a MAP must declare an object param (MPI-596)', () => {
    const src = read('js/data/flowsRegistry.js');
    // A `place` step bound with the string form would assign the whole `{region, mode}`
    // object to one node, which the injector writes as [object Object] — silently, and
    // the run still finishes. Only the map form is correct for this kind.
    const placeSteps = src.match(/kind: 'place'[^\n]*/g) || [];
    assert.ok(placeSteps.length > 0, 'expected at least one place step');
    for (const decl of placeSteps) {
        assert.ok(!/param: '/.test(decl),
            `a place step must not use the string param form: ${decl}`);
    }
    assert.match(src, /param: \{ region: 'box1', mode: 'Input_Mode' \}/,
        'Object Stamp binds the region to the box node and the mode to the switch selector');
});

test('Head Swap declares both box bindings, so it needs no component to translate', () => {
    const src = read('js/data/flowsRegistry.js');

    assert.match(src, /kind: 'box', role: 'image1', param: 'box1'/);
    assert.match(src, /kind: 'box', role: 'image2', param: 'box2'/);
    assert.ok(
        !/uiComponent:/.test(src),
        'no flow may carry a uiComponent — a component is the one thing a manifest cannot express',
    );
});

test('a step hint renders as LINES, and a mode-keyed one never shows the wrong mode (MPI-596)', () => {
    const frame = read('js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js');

    // The hint was ONE centred <p> fed by textContent, so a step with anything to say
    // rendered as an unbroken wall (Fabio, 2026-08-27). Lines now, one <p> each.
    assert.match(frame, /if \(typeof h === 'string'\) return \[h\];/,
        'a plain string hint must still work — every other flow uses one');
    assert.match(frame, /if \(Array\.isArray\(h\)\) return h\.filter\(Boolean\);/,
        'an array hint is one paragraph per entry');
    assert.match(frame, /\.\.\.asLines\(h\.base\), \.\.\.asLines\(h\[value\?\.mode\]\)/,
        'an object hint is base plus the entry matching the gizmo mode');
    // The mode radio lives inside the gizmo, so the frame has to repaint on report —
    // and only on an actual CHANGE, because onChange fires on every drag frame.
    assert.match(frame, /if \(prev\.mode !== _stepValues\[step\.role\]\.mode\)/,
        'the hint must repaint when the gizmo mode changes, and only then');

    const flows = read('js/data/flowsRegistry.js');
    const placeHint = flows.match(/hint: \{[\s\S]*?\n {16}\},/);
    assert.ok(placeHint, 'the place step must declare a mode-keyed hint');
    const [, autoPart = "", manualPart = ""] = placeHint[0].split(/^\s*(?:auto|manual):/m);

    // THE ACTUAL BUG: Manual's redraw trade-off was on screen while the user sat in
    // Auto, where none of it applies. And ALT-rotate is Auto-only — Manual squares the
    // box off, so offering rotation there describes a gesture that does nothing.
    assert.ok(!/re-draws|redraw is a redraw/.test(autoPart),
        "Auto must not carry Manual's redraw trade-off");
    assert.ok(!/ALT/.test(manualPart),
        'Manual has no rotation, so it must not mention ALT');
    assert.match(autoPart, /ALT/,
        'Auto must name the ALT-rotate gesture — nothing else in the UI does');
});
