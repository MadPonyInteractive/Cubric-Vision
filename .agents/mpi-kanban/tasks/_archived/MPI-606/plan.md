# Flow frame — the four bugs that hit EVERY flow

Split out of [MPI-567](../MPI-567/) on 2026-08-23. Fabio opened the Scribble to Object flow for
the first time and found nine things; **four of them are in code every flow shares**, so they were
carved off to run in parallel while MPI-567 keeps the scribble-contained half.

**Every root cause below was traced to a line before this card existed. Do not re-derive them.**
Verify each one, then fix it — but start from the diagnosis, not from the symptom.

## Current State

**All six shipped.** Five confirmed in a real running app, one (bug 6) has no live surface to
click yet. 700 tests pass; every fix is mutation-checked RED. Card sits in `doing` /
`validating` because verify mode is user-ux and two of Fabio's five checks need a photo and
the History workspace — see [validation.md](validation.md) § Still needs Fabio's eyes.

## Ownership — READ THIS FIRST

**MPI-567 IS RUNNING IN PARALLEL IN ANOTHER SESSION** and holds a live write claim on:

```
js/data/flowsRegistry.js              js/data/commandRegistry.js
js/core/operationRegistry.js          operation_registry.json
js/data/modelConstants/universal_workflows.js
js/data/modelRegistry.js              js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js
comfy_workflows/flow_scribble_object.json  comfy_workflows/raw/flow_scribble_object.json
tests/flow-model-choice.test.cjs      docs/playbooks/add-flow/existing-flows/scribble-to-object.md
```

**Do not edit any of those.** `guard-claim` will block the write anyway, but the point is that
none of these four fixes needs one. If a fix genuinely does, file one `mpi-message` and stop that
line of work rather than negotiating or editing around it.

This card's expected footprint (write `files.json` yourself at the `todo → doing` move — nobody
can backfill it for you):

```
js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js
js/components/Primitives/MpiColorPicker/MpiColorPicker.js
js/managers/hotkeyRegistry.js
docs/playbooks/add-flow/ui/carousel-frame.md
tests/…  (whatever you add)
```

---

## Bug 1 — a flow input is LOST the moment you navigate away

**Symptom (Fabio).** Drop a photo on step 1, go to the gallery, come back — the photo is gone.

**Root cause.** `state.s_flowInputs` has **exactly one write site in the whole codebase**, and it
is inside `_run`:

```js
// js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js ~2038, inside _run()
state.s_flowInputs = { ...state.s_flowInputs, [flow.id]: inputs };
```

So the snapshot only ever exists **after the user presses Generate**. The shell destroys
`MpiBaseFlow` on every `flow:open` and on close (MPI-345 — that destroy is correct and stays), and
the remount seeds from `state.s_flowInputs?.[flow.id] || props.initialInputs || {}` (~256). Before
a first run there is nothing to seed from, so everything the user has entered dies with the
closure.

**Why nobody caught it.** `docs/playbooks/add-flow/04-overlay-and-shell.md` § "The result pane
survives close→reopen" states that *"inputs already travelled in `s_flowInputs`; the result did
not"* — which is true only **after a run**. MPI-587 fixed the result half and the inputs half
looked already-solved. It was not.

**Shape of the fix.** Persist on CHANGE, not only at dispatch. Note the deliberate design already
documented in `03-storage-and-reuse.md`: *"Snapshot at Run (dispatch), never at completion"* — that
rule is about `flowInputs` on the **sidecar**, which must stay frozen at Run so a mid-run edit
cannot corrupt what Reuse restores. **`s_flowInputs` is a different thing** (session scratch, so a
reopen restores what you were doing) and persisting it live does not violate that rule. Keep the
two separate, and say so in a comment, or the next reader will "fix" one into the other.

`state.s_flowInputs` is a Proxy key — **always top-level replace**, never mutate the sub-object
(CLAUDE.md § Critical Rules).

**Verify on TWO flows**, not just Scribble to Object — this is shared code and the whole point of
the card. Head Swap is the cheapest second (two media slots, no steps beyond the box).

## Bug 2 — spacebar jumps to the next stage

**Symptom (Fabio).** *"Pressing the spacebar on a flow moves to the next stage. This can't
happen."* He found it while holding space expecting pan.

**Root cause. Nobody wrote a spacebar handler — the browser did it.** The nav arrows are real
buttons:

```js
// MpiBaseFlow.js ~248
const prevBtn = _arrow('prev', '‹', 'Previous step');
const nextBtn = _arrow('next', '›', 'Next step');
```

Click one and it keeps focus. Spacebar on a focused `<button>` is native activation, so the click
handler at ~1345 fires again. Grepping for `' '` / `Space` / `keyCode === 32` in `MpiBaseFlow.js`
finds only the media drop-zone `Enter || ' '` handlers at ~607/~627, which is what makes this
look like it has no cause.

**Do not fix it by swallowing the keydown globally.** The drop-zone handlers at 607/627 are a
real accessibility affordance (space activates a focused drop zone) and must keep working. Fix
it where the focus is: the arrows.

## Bug 3 — ArrowLeft / ArrowRight should navigate

**Fabio's call:** left/right = previous/next step.

**This overrides an explicit decision, and the comment has to be healed too:**

```js
// MpiBaseFlow.js ~1342
// Arrows + the ticker are the navigation. No arrow-key hotkey: it would
// need new hotkeyRegistry ids AND would fight the box gizmo's drag on a
// middle step. Add it only if the flow proves it wants one.
```

Both stated reasons are still real work, not excuses:

- **New `hotkeyRegistry.js` ids are required.** House rule, no exceptions: `Hotkeys.bind` /
  `Hotkeys.unbind` with a registry id — never a raw `window.addEventListener('keydown')`.
- **It must not fight a gizmo.** The box gizmo drags with the pointer, but arrow keys are also how
  a focused slider/input moves. Make the binding inert while the user is typing in a field, the
  same way the `compare.*` video hotkeys already are (`04-overlay-and-shell.md` § the result pane).

Leaving that comment in place while the code contradicts it is how the next agent re-litigates
this. Rewrite it to say what is now true and why.

## Bug 4 — the colour picker closes the whole Flow

**Symptom (Fabio).** On the paint step, clicking the colour swatch dumps you back to the gallery.

**Root cause — one line.**

```js
// js/components/Primitives/MpiColorPicker/MpiColorPicker.js:208, inside openPopup()
Events.emit('ui:close-all-popups');        // ← BARE
```

```js
// js/components/Primitives/MpiOverlay/MpiOverlay.js:234
Events.on('ui:close-all-popups', (payload) => {
    if (payload?.reason === 'overlay-open') return;
    if (_isShown) el.hide();
});
```

The convention for *"I am opening on top of you, do not close"* is `{ reason: 'overlay-open' }`
(`js/managers/overlayManager.js:44`). The picker emits bare, so `MpiOverlay` hides the full-page
Flow overlay and the user lands on the gallery behind it. `MpiSlideOver.js:112` carries the same
exemption, which is how you can tell this is the established pattern and not an invention.

**This is a shared Primitive — sweep all six consumers** (THE ROOT-CAUSE RULE, step 3):

```
MpiStepPaint  MpiToolOptionsCrop  MpiToolOptionsMaskAdjust
MpiToolOptionsPaint  MpiToolOptionsRemoveBg  MpiToolOptionsResize
```

The other five sit in tool-option panels that are **not** overlays, which is exactly why a bare
emit was harmless for the picker's whole life until a Flow overlay hosted one. Confirm the fix is
inert for them rather than assuming it: the picker still has to close *other* popups when it
opens, so do not simply delete the emit.

`MpiColorPicker` also listens to the same event to close itself (`:327`). Check the reason you add
does not make the picker exempt itself and leave two pickers open.

### Confirmed live, with the stack trace (Fabio, 2026-08-23)

He hit it again in the app and sent the console. **One cause, two symptoms** — the second was not
visible from reading:

```
Uncaught TypeError: Cannot read properties of null (reading 'getBoundingClientRect')
    at MpiColorPicker.js:191:41
```

The full chain, all from the single bare emit:

1. `openPopup()` emits bare `ui:close-all-popups` (`:208`).
2. `MpiOverlay:234` has no `reason` to exempt, so it hides the Flow overlay.
3. The overlay's element leaves the DOM — **and the picker lives inside it**.
4. The picker's own `MutationObserver` (`:329`) sees `!document.contains(el)` and fires
   `el.destroy()` → `closePopup()` → `popup = null`.
5. Meanwhile `positionPopup()` had already queued a `requestAnimationFrame` (`:190`) that closes
   over the outer `popup` binding. The frame runs, `popup` is now null, and `:191` throws.

So fixing the emit fixes the crash too — the observer never fires because the overlay never
closes. **Guard the rAF anyway** (`const p = popup;` before the frame, or re-check inside): any
legitimate close between the call and the next frame reproduces the same null deref, and it is one
line.

Reproduce before and after: open a flow → paint step → click the colour swatch. Today: gallery,
plus that TypeError. Wanted: the picker opens, the flow stays, console clean.

## Bug 5 — `promptRequired` is declared 15+ times and enforced NOWHERE

**Found while wiring MPI-567's prompt on 2026-08-23, handed here because the fix is frame code.**

`commandRegistry.js` declares `promptRequired: true` on fifteen-odd ops, and its own JSDoc says
*"Whether a text prompt is mandatory"*. Grep the whole of `js/` for the identifier and the only
hits outside the registry that declares it are a comment. **Nothing reads it.** It is a dead
declaration that reads as an enforced contract — the same failure mode as
`inputSchema.positive`, which sat inertly in the scribble FlowDef and convinced a previous
session the prompt was wired when the flow had no prompt box at all.

The visible cost: Fabio ran Scribble to Object with an empty prompt, got a shape rendered from
the ControlNet hint alone, and the run was never stopped even though its op declares
`promptRequired: true`.

The frame's empty-run guard is close but is not this:

```js
// MpiBaseFlow.js ~2029, inside _run()
const hasPrompt = typeof inputs.positive === 'string' && inputs.positive.trim() !== '';
if (_mediaGroups.length > 0 && mediaItems.length === 0 && !hasPrompt) { …warn, abort… }
```

That fires only when there is **neither** media **nor** a prompt. A flow with a photo and no
prompt runs. For an op that declares `promptRequired: true` it should not.

**Decide the scope deliberately, and say which you chose:**

- Honour `promptRequired` in the flow frame only (smallest, fixes every Flow), **or**
- Honour it wherever ops are dispatched, which is the honest reading of the JSDoc and sweeps the
  PromptBox path too.

Either is defensible; shipping neither and leaving the flag inert is not. If the answer turns
out to be that the flag is genuinely obsolete, **delete it from all fifteen ops** rather than
leaving a contract nobody honours — a declaration that lies is worse than no declaration.

## Bug 6 — a field declared on a GIZMO step and on the run slide silently drops edits

**Not blocking, but you are already in this file, and MPI-567 wants it.** Found 2026-08-23 while
adding the scribble prompt; the two-surface version was written, caught by reading, and reverted
before it shipped.

A field id declared on **both** a gizmo step and the flow's own `fields` looks supported — the
`character-sheet` flow does exactly that with its prompt, and `_collectInputs` even comments that
*"a flow declaring the same id in both places means the run slide's value is the one the user saw
immediately before pressing Generate"*. For `character-sheet` that is true. For a **gizmo** step it
is not, and the difference is invisible at the declaration site:

- a `kind: 'fields'` step is a FRAME kind with no role, and its values are seeded into the FLOW
  store on purpose (`stepKinds.js` § `FRAME_KINDS`) — **one store, one value**;
- a gizmo step (`paint`, `box`, `crop`) has a role, so its fields live in
  `_stepValues[role].fields` — **a different store**.

`_collectInputs` applies step stores first and `_fieldValues` last. On a fresh open nothing breaks:
`_seedField` returns `undefined` for a flow-level field with no `default` and no persisted root, so
the key is absent and cannot overwrite. **After one run** `s_flowInputs` carries the id at the
payload root, the flow-level copy seeds from it, and from then on the value edited on the step is
overwritten at collection by the stale run-slide one. Wrong output, no error, and only on the
second run — which is the hardest kind to attribute.

Either make the two stores one for a shared id, or make the collision loud (a `clientLogger.warn`,
or a test that refuses the declaration). **Do not just document it** — MPI-567 wants its prompt on
the run slide as well as the draw step, and today it cannot have both.

---

## Verification

**Verify mode:** user-ux

Automated:
- `npm test` green.
- `node --check` on every touched file.
- A test per fix where one is possible; where it is not (a native focus behaviour is awkward to
  assert in a bare-Node harness), say so explicitly rather than skipping in silence.

Fabio's eyes, in the app:
1. Drop a photo in a flow, do **not** run, go to the gallery, reopen — photo still there. Repeat on
   a second flow.
2. Click a nav arrow, then press spacebar — nothing moves.
3. Left/right arrows step back and forward. Type in the prompt field and press left/right — the
   caret moves, the step does not.
4. Paint step → click the colour swatch → the picker opens and **the flow stays open**.
5. History paint / crop / resize / remove-bg / mask-adjust tool options → the colour picker still
   opens and closes normally.

## Plan Drift

- 2026-08-23 — card created from MPI-567's live-look findings. Nothing implemented yet.
- 2026-08-23 — all six implemented. Three things the plan left open, decided:
  - **Bug 5 scope = the flow frame only**, stated in the code, the doc and validation.md. The
    honest-but-wider `enqueueGeneration` option (beside its missing-media and missing-mask
    siblings, which are the exact same shape) would start refusing `i2i` / `inpaint` / `edit` /
    `promptEnhance` runs that ship today. The flag stays inert on the eleven non-flow ops —
    **that residual is open, not closed.**
  - **Bug 6 = unify the stores, not merely warn.** A warning would not have unblocked MPI-567,
    which is what the plan actually asked for. `_writeDeclaredField` fans one write across every
    store declaring the id.
  - **Bug 3 needed a conflict rule the plan did not foresee.** `hotkeyManager._mapKey` keys
    handlers by TYPE+KEY, not by id, so every handler on `down:arrowleft` fires together —
    `video.frame.back` from the run slide's own control bar and `compare.frame.back` from the
    compare view included. The step keys yield while either surface is live.
  - Footprint grew by one file the plan did not list: `mpi-hotkeys.js`, whose HTML the registry's
    own header requires updating alongside any new entry.
  - `js/data/hotkeyRegistry.js` in the plan's footprint does not exist — it is
    `js/managers/hotkeyRegistry.js`.
