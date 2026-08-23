/**
 * flow-frame.test.cjs — MPI-606.
 *
 * Six bugs that hit EVERY flow because they live in the shared frame, not in any
 * one flow. What can be asserted here varies by bug, and the split is deliberate:
 *
 *   - `promptRequired` and the hotkey registry are DATA — imported and checked as
 *     data, so a new flow that declares a prompt under a different id, or a
 *     registry entry that would fire while the user is typing, fails here.
 *   - the rest are wiring inside `MpiBaseFlow.setup`'s closure, which cannot be
 *     imported in bare Node (`/js/utils/icons.js` is an absolute browser path) and
 *     has no DOM to mount into. Those are pinned as source contracts, the same way
 *     flow-step-param-binding.test.cjs pins the frame's param binding.
 *
 * NOT TESTABLE HERE, stated rather than skipped in silence: that Space no longer
 * ACTIVATES a focused nav button, and that ArrowLeft actually moves a step. Both
 * are native browser behaviours over a real focus ring — they belong to Fabio's
 * eyes (plan.md § Verification) or to a desktop spec, not to a bare-Node harness.
 * What is pinned here is that the handlers exist and are wired to every button.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const repo = p => path.join(__dirname, '..', p);
const read = p => fs.readFileSync(repo(p), 'utf8');
const esm = p => import('file://' + repo(p).replace(/\\/g, '/'));

const frame = () => read('js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js');

// ── Bug 1 — inputs are persisted on CHANGE, not only at dispatch ─────────────

test('the session snapshot has ONE writer, and it is not _run', () => {
    const src = frame();

    // Scoped to THIS FILE deliberately. `flowService.js:163` also assigns the key —
    // it seeds a saved snapshot on the Reuse path before the flow opens, which is a
    // legitimate second writer and not what this pins. What must stay singular is the
    // frame's own live-state writer; two of those is how it drifted into being
    // dispatch-only. (The card text called it the only site in the codebase. It is not.)
    const writes = src.match(/state\.s_flowInputs\s*=/g) || [];
    assert.strictEqual(writes.length, 1,
        'MpiBaseFlow.js must hold exactly one assignment, inside _persistInputs');
    assert.match(src, /function _persistInputs\(inputs\) \{[\s\S]*?state\.s_flowInputs = \{\s*\n\s*\.\.\.state\.s_flowInputs,/,
        'top-level replace — s_flowInputs is a Proxy key, mutating the sub-object fires nothing');
    assert.match(src, /_persistInputs\(inputs\);/,
        '_run persists the snapshot it dispatches, through the same helper');
});

test('every input surface reports a change', () => {
    const src = frame();

    // Media: one choke point — a drop, a pick and a cleared slot all reach onDirty.
    assert.match(src, /_buildSlot\(entry, i, \(\) => \{\s*\n\s*_persistInputs\(\);/,
        'media changes persist immediately: losing a dropped photo to navigation is the bug');
    // Gizmo reports and field edits trail, because they fire per pointer-move/keystroke.
    assert.match(src, /_stepValues\[step\.role\] = \{ \.\.\.prev, \.\.\.val \};\s*\n\s*_touchInputs\(\);/,
        'a gizmo report is a change');
    assert.match(src, /function _writeDeclaredField\(id, val\) \{[\s\S]*?_touchInputs\(\);\s*\n\s*\}/,
        'a declared field edit is a change, on either surface');
});

test('a trailing persist is flushed before the closure dies', () => {
    const src = frame();
    assert.match(src, /el\.destroy = \(\) => \{[\s\S]{0,400}?if \(_persistTimer\) _persistInputs\(\);/,
        'destroy IS the navigation path (MPI-345) — an unflushed timer loses the last edit');
});

// ── Bug 2 — spacebar must not activate the nav chrome ────────────────────────

test('every navigation button swallows Space, and only the nav chrome does', () => {
    const src = frame();

    assert.match(src, /const _killSpace = \(btn\) => \{[\s\S]*?e\.key === ' ' \|\| e\.code === 'Space'[\s\S]*?e\.preventDefault\(\);/,
        'preventDefault on keydown is what cancels the native activation on keyup');

    // The three surfaces that navigate: the back button, both arrows, every ticker tick.
    assert.match(src, /backBtn\.id = 'flow-back';\s*\n\s*_killSpace\(backBtn\);/);
    assert.match(src, /btn\.setAttribute\('aria-label', aria\);\s*\n\s*_killSpace\(btn\);/,
        'both arrows come from the same _arrow factory');
    assert.match(src, /on\(btn, 'click', \(\) => _goTo\(i\)\)\);\s*\n\s*_killSpace\(btn\);/,
        'a ticker tick jumps a stage too — clicking one then pressing Space jumped again');

    // …and the media drop zones keep theirs: Space on a focused slot is a real affordance.
    const slotSpace = src.match(/if \(e\.key === 'Enter' \|\| e\.key === ' '\) \{/g) || [];
    assert.strictEqual(slotSpace.length, 2,
        'both slot keydown handlers (empty + filled) must survive — the fix is at the '
        + 'nav chrome, never a global swallow');
});

// ── Bug 3 — ArrowLeft / ArrowRight navigate, through the registry ────────────

test('the flow step hotkeys are registered, and cannot fire while typing', async () => {
    const { HOTKEY_REGISTRY, KEY_TYPE } = await esm('js/managers/hotkeyRegistry.js');
    const byId = id => HOTKEY_REGISTRY.find(e => e.id === id);

    for (const [id, key] of [['flow.step.back', 'arrowleft'], ['flow.step.forward', 'arrowright']]) {
        const entry = byId(id);
        assert.ok(entry, `${id} must exist — Hotkeys.bind resolves the key through the registry`);
        assert.strictEqual(entry.key, key);
        assert.strictEqual(entry.type ?? KEY_TYPE.DOWN, KEY_TYPE.DOWN);
        assert.strictEqual(entry.allowWhileTyping, false,
            'true here would let the step change while the caret should be moving — and '
            + 'the manager fires ALL handlers on a key when ANY entry allows it, so it '
            + 'would unblock the video ones too');
    }
});

test('the frame binds them through Hotkeys, never a raw window listener', () => {
    const src = frame();

    assert.match(src, /Hotkeys\.bind\('flow\.step\.back', \(\) => _goTo\(_current - 1\)\)/);
    assert.match(src, /Hotkeys\.bind\('flow\.step\.forward', \(\) => _goTo\(_current \+ 1\)\)/);
    assert.doesNotMatch(src, /window\.addEventListener\(\s*'keydown'/,
        'house rule: hotkeys go through the registry');
});

test('the arrows are NOT gated on the result surfaces', () => {
    const src = frame();

    // A gate on `_videoBar || _compareView` was written and removed. `_compareView`
    // is non-null for an IMAGE compare too — MpiCompareView only BINDS a hotkey when
    // a side is video — so a replayed image result (MPI-587) killed ArrowLeft on the
    // Generate slide and the user could not go back. Re-adding it reintroduces that.
    assert.doesNotMatch(src, /_videoBar \|\| _compareView/,
        'the arrows must not yield to a surface that may bind nothing');
});

test('the compare view only claims the arrows for video, which is why the gate was wrong', () => {
    const src = read('js/components/Compounds/MpiCompareView/MpiCompareView.js');
    assert.match(src, /if \(isVideoA \|\| isVideoB\) \{\s*\n\s*_canvas\.el\.setCompareLoop\(true\);\s*\n\s*_bindHotkeys\(\);/,
        'if this ever binds unconditionally the reasoning above changes');
});

test('the comment claiming there is deliberately no arrow-key hotkey is gone', () => {
    const src = frame();
    assert.doesNotMatch(src, /No arrow-key hotkey/,
        'a comment contradicting the code is how the next agent re-litigates this');
});

// ── Bug 4 — the colour picker must not close the overlay hosting it ──────────

test('the picker announces itself as opening ON TOP, using the established reason', () => {
    const src = read('js/components/Primitives/MpiColorPicker/MpiColorPicker.js');

    assert.match(src, /Events\.emit\('ui:close-all-popups', \{ reason: 'overlay-open' \}\)/,
        'a BARE emit takes the full-page Flow overlay down and lands the user on the gallery');
    // The emit still has to happen: another dropdown or picker already open must go.
    assert.match(src, /_unsubs\.push\(Events\.on\('ui:close-all-popups', closePopup\)\)/,
        'the picker\'s own listener stays unconditional, so a second picker still closes');
});

test('the reason string matches what every long-lived surface actually exempts', () => {
    const exemptors = [
        'js/components/Primitives/MpiOverlay/MpiOverlay.js',
        'js/components/Compounds/MpiSlideOver/MpiSlideOver.js',
        'js/components/Organisms/MpiPromptBox/MpiPromptBox.js',
        'js/managers/overlayManager.js',
    ];
    for (const f of exemptors) {
        assert.match(read(f), /'overlay-open'/,
            `${f} must speak the same reason string — a private one would be silently ignored`);
    }
});

test('positionPopup cannot deref a popup that closed before its frame ran', () => {
    const src = read('js/components/Primitives/MpiColorPicker/MpiColorPicker.js');

    assert.match(src, /const measured = popup;\s*\n\s*requestAnimationFrame\(\(\) => \{\s*\n\s*if \(measured !== popup\) return;/,
        'the rAF closes over an OUTER binding; any close in between made it null and '
        + 'threw at getBoundingClientRect');
    assert.doesNotMatch(src, /requestAnimationFrame\(\(\) => \{\s*\n\s*const popupRect = popup\./,
        'the unguarded read is the crash');
});

// ── Bug 5 — promptRequired is honoured, in the flow frame ────────────────────

test('the frame refuses a run whose op declares promptRequired with no prompt', () => {
    const src = frame();

    assert.match(src, /if \(getCommand\(flow\.operation\)\?\.promptRequired && !hasPrompt\) \{[\s\S]*?Events\.emit\('ui:warning'[\s\S]*?return;/,
        'declared on fifteen-odd ops and read by nothing until this');
    // The pre-existing empty-run guard is a different, weaker test and must stay.
    assert.match(src, /if \(_mediaGroups\.length > 0 && mediaItems\.length === 0 && !hasPrompt\)/,
        'that one fires only when there is NEITHER media NOR a prompt');
});

test('every flow op that declares promptRequired names its prompt field `positive`', async () => {
    const { COMMANDS } = await esm('js/data/commandRegistry.js');
    const mod = await esm('js/data/flowsRegistry.js');
    const flows = mod.FLOWS || mod.flows || mod.default;
    assert.ok(Array.isArray(flows), 'flowsRegistry must export an array of FlowDefs');

    // The guard reads `inputs.positive`, which a field reaches by declaring that id.
    // A flow whose prompt is declared under any other id would sail past the guard
    // with the flag still reading as enforced — the exact failure this card exists for.
    const checked = [];
    for (const flow of flows) {
        if (!COMMANDS[flow.operation]?.promptRequired) continue;
        const ids = [
            ...(flow.fields || []),
            ...(flow.steps || []).flatMap(s => s?.fields || []),
        ].map(f => f?.id);
        assert.ok(ids.includes('positive'),
            `flow "${flow.id}" runs ${flow.operation} (promptRequired) but declares no `
            + `field with id "positive" — the frame's guard would never see its prompt`);
        checked.push(flow.id);
    }
    assert.ok(checked.length > 0, 'at least one flow must exercise this, or the guard is dead code');
});

// ── Bug 6 — a shared field id is ONE value, not two stores ───────────────────

test('a field declared on a gizmo step and the run slide writes both stores', () => {
    const src = frame();

    assert.match(src, /const _flowStoreIds = new Set\(_fields\.map\(f => f\.id\)\);/);
    assert.match(src, /if \(isFrameKind\(step\.kind\) \|\| !step\.role\) \{ _flowStoreIds\.add\(f\.id\); return; \}/,
        'a FRAME kind has no role and belongs to the flow store — that is why '
        + 'character-sheet declaring its prompt twice always worked');
    assert.match(src, /function _writeDeclaredField\(id, val\) \{\s*\n\s*if \(_flowStoreIds\.has\(id\)\) _setFlowField\(id, val\);/);
    assert.match(src, /\(_stepRolesById\.get\(id\) \|\| \[\]\)\.forEach\(\(role\) => \{/,
        'and every gizmo step declaring the id');
});

test('both onChange surfaces route through the fan-out writer', () => {
    const src = frame();

    assert.match(src, /_onFlowField\(f, val\) \{[\s\S]*?_writeDeclaredField\(f\.id, val\);/,
        'the run slide and a `fields` step');
    assert.match(src, /_writeDeclaredField\(fieldId, val\);\s*\n\s*\/\/ Let the gizmo react/,
        "a gizmo step's fields row");
    // The old direct write is what made the second store.
    assert.doesNotMatch(src, /\(fieldId, val\) => \{\s*\n\s*const prev = _stepValues\[step\.role\]/,
        'writing straight into the step store bypasses the flow copy');
});
