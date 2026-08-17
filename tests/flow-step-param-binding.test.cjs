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
    assert.match(src, /const v = stepValueToParam\(step\.kind, _stepValues\[step\.role\]\);\s*\n\s*if \(v !== null\) declaredParams\[step\.param\] = v;/,
        'a null must be OMITTED, not sent as null — that is what preserves the baked default');
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
