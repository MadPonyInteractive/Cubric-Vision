/**
 * flow-result-dock.test.cjs — MPI-727.
 *
 * A Flow's result used to exist only while the user stood on the last step: the run
 * slide is rebuilt on every navigation, so stepping back to re-read an input took the
 * `<audio>` element out of the DOM and the song stopped. It now rides in a floating
 * window (`MpiFlowResultDock`) off the last step, and a reused gallery card opens its
 * flow with that card's result already loaded.
 *
 * Two things in that fix are silent when they break, and both are pinned here.
 *
 *   1. THE ELEMENT IS MOVED, NEVER RE-CREATED. A media element removed from the
 *      document is paused "once a stable state is reached" — after the current task,
 *      not during it. So the same `<audio>` node re-appended inside one synchronous
 *      `_renderSlide` pass keeps playing, while a fresh element with the same `src`
 *      restarts from zero. A fresh element LOOKS right in every screenshot and in the
 *      accessibility tree; only the sound tells you, and only if you were listening.
 *
 *   2. A RESULT LOADED ON REUSE IS SOMETHING TO LOOK AT, NOT AN INPUT. It goes in
 *      `s_flowResults`; writing it into `s_flowInputs` would corrupt the snapshot
 *      Reuse restores, which is frozen at Run by design
 *      (docs/playbooks/add-flow/03-storage-and-reuse.md § "Snapshot at Run").
 *
 * `MpiBaseFlow.setup`'s closure cannot be imported in bare Node (`/js/utils/icons.js`
 * is an absolute browser path) and has no DOM to mount into, so the frame half is a
 * source contract, in the same style as flow-frame.test.cjs and
 * flow-enhance-ownership.test.cjs. The sound itself is Fabio's to judge — the card is
 * `verify: user-ux`.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const repo = p => path.join(__dirname, '..', p);
const read = p => fs.readFileSync(repo(p), 'utf8');
const frame = () => read('js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js');

test('the dock is synced synchronously, never behind the rAF', () => {
    const src = frame();

    // The whole fix lives in this ordering: the slide swap detaches a playing element
    // and `_syncDock()` re-attaches it, and the two must share one task. Deferring the
    // sync — behind the rAF right below it, a promise, or a timeout — hands the browser
    // a stable state in between, which is exactly when the pause steps run.
    assert.match(
        src,
        /slidesEl\.appendChild\(slide\);[\s\S]{0,600}?_syncDock\(\);\s*\n\s*\/\/[^\n]*\n\s*requestAnimationFrame\(/,
        '_renderSlide must call _syncDock() after the slide is appended and BEFORE the '
        + 'requestAnimationFrame — a deferred sync pauses a playing result',
    );

    // And never from inside the rAF callback.
    assert.ok(
        !/requestAnimationFrame\(\([^)]*\)\s*=>\s*\{[\s\S]*?_syncDock\(/.test(src),
        '_syncDock() must not be called from inside a requestAnimationFrame callback',
    );
});

test('the audio element is shared and keyed by url, never re-pointed', () => {
    const src = frame();

    // Same url → the SAME node handed back. This is what survives the move.
    assert.match(
        src,
        /function _sharedAudioEl\(url\)\s*\{\s*\n\s*if \(_audioEl && _audioEl\.dataset\.src === url\) return _audioEl;/,
        '_sharedAudioEl must return the existing element when the url is unchanged',
    );

    // Re-assigning `src` on the live element is the same restart a fresh element is,
    // so there must be exactly one place a src is set: construction.
    assert.ok(
        !/_audioEl\.src\s*=/.test(src),
        'never re-assign _audioEl.src — a new file gets a new element, not a re-point',
    );

    // The run slide APPENDS the shared element rather than building its own. This is
    // the move back out of the floating window.
    assert.match(
        src,
        /_resultMediaEl\.appendChild\(withPath\.length === 1\s*\n?\s*\?\s*_sharedAudioEl\(url\)/,
        '_paintPlainResults must append the shared audio element for a single result',
    );
});

test('the gate is one predicate: a result, an open flow, and not the last step', () => {
    const src = frame();
    const body = src.slice(src.indexOf('function _syncDock()'));
    const fn = body.slice(0, body.indexOf('\n        }') + 10);

    assert.match(fn, /_lastResults \|\| \[\]/, '_syncDock must read the remembered result');
    assert.match(fn, /_current === _lastIndex\(\)/, '_syncDock must close on the last step');
    // "The flow is open" is structural — the dock is mounted inside the flow's own
    // stage, so closing or suspending the flow takes it off screen. If that ever moves
    // to document.body, this test is the reminder that the third condition became real.
    assert.match(
        src,
        /qs\('#flow-stage', el\)\.appendChild\(_dock\.el\)/,
        'the dock must mount inside the flow stage — that IS the "flow is open" condition',
    );
});

test('the dock outlives every slide and dies with the flow', () => {
    const src = frame();

    // _teardownSlide runs on every navigation. If it dropped either of these, the
    // result would be rebuilt per step and the card would be back where it started.
    const teardown = src.slice(src.indexOf('function _teardownSlide()'));
    const teardownBody = teardown.slice(0, teardown.indexOf('\n        }'));
    assert.ok(
        !/_audioEl|_dock\b/.test(teardownBody),
        '_teardownSlide must not touch the dock or the shared audio element',
    );

    // el.destroy is where they both go — a window that outlives its flow, or audio
    // still playing into a torn-down tree, are the two failure modes.
    const destroy = src.slice(src.indexOf('el.destroy = () => {'));
    const destroyBody = destroy.slice(0, destroy.indexOf('\n        };'));
    assert.match(destroyBody, /_dock\?\.el\?\.destroy\?\.\(\)/, 'el.destroy must destroy the dock');
    assert.match(destroyBody, /_dropSharedAudio\(\)/, 'el.destroy must stop the shared audio');
});

test('the dock component only ever DETACHES what it was handed', () => {
    const src = read('js/components/Compounds/MpiFlowResultDock/MpiFlowResultDock.js');

    // The node in the box is the caller's, and on the way back to the last step it has
    // already been re-appended to the run slide. Anything that destroys rather than
    // detaches would take the live player with it.
    assert.match(src, /el\.setContent = \(node\) =>/, 'setContent is the content API');
    assert.ok(
        !/\.innerHTML\s*=/.test(src),
        'MpiFlowResultDock must not wipe with innerHTML — replaceChildren detaches, and says so',
    );
    // `hidden` loses to a component's own display (.claude/rules/components.md).
    assert.match(
        src,
        /classList\.toggle\('mpi-flow-result-dock--open'/,
        'visibility is a modifier class, never the `hidden` attribute',
    );

    assert.ok(
        read('js/shell/preloadStyles.js').includes(
            'js/components/Compounds/MpiFlowResultDock/MpiFlowResultDock.css',
        ),
        'a new component MUST register its CSS in preloadStyles.js',
    );
});

test('Reuse loads the card result as a RESULT, never as an input', async () => {
    const src = read('js/services/flowService.js');
    const fn = src.slice(src.indexOf('export function openFlowFromReuse(item)'));
    const body = fn.slice(0, fn.indexOf('\n}'));

    assert.match(
        body,
        /state\.s_flowResults = \{\s*\n?\s*\.\.\.state\.s_flowResults,\s*\n?\s*\[flowId\]: \{ items: \[item\]/,
        'openFlowFromReuse must seed s_flowResults with the reused card',
    );
    // `s_flowInputs` is written exactly once, from `flowInputs` — never from the item
    // itself. The snapshot Reuse restores is frozen at Run and a loaded-in result must
    // not leak into it.
    const inputWrites = body.match(/state\.s_flowInputs = /g) || [];
    assert.strictEqual(inputWrites.length, 1, 's_flowInputs must be written once, from flowInputs only');
    assert.match(body, /\[flowId\]: savedInputs/, 's_flowInputs takes the saved snapshot, nothing else');

    // The shape must be the one MpiBaseFlow seeds from, or the pane silently stays empty.
    const flowFrame = frame();
    assert.match(
        flowFrame,
        /state\.s_flowResults\?\.\[flow\.id\] \|\| null/,
        'MpiBaseFlow still seeds its result from s_flowResults[flow.id]',
    );
    assert.match(flowFrame, /_seededResult\?\.items \|\| null/, 'the seed reads `items`');
});
