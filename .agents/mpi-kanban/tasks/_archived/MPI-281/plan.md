# Fix History Video continuation (Extend / New shot)

## Current State

History Video's frame section (Start/End slots) is visually glued to the
Extend / Create-new buttons, but the buttons don't use those slots — they
self-capture the current clip's last frame at click time
(`_captureLastFrameMedia`, `MpiGroupHistoryBlock.js:2166`), explicitly dropping
any existing startFrame. Two problems:

1. **Gating bug.** In History video mode the PromptBox runs with
   `filterNoInputOps` (text-only ops hidden from the op dropdown —
   `MpiPromptBox.js:961`). But when the media box is empty, `_emitMediaChange`
   (`MpiPromptBox.js:275-278`) auto-switches the op to a *text-only* op
   (`_pickTextOnlyOp`). That picked op is then filtered OUT of the dropdown →
   the op trigger renders "Select...". So an empty frame section collapses the
   visible operation and makes the panel read as broken, even though
   Extend/New-shot still run correctly (they build their own media). The user
   also perceives the empty start slot's "set from video" affordance as the
   button "moving them to the end frame".
2. **Mental model.** Frame slots + buttons look like one unit; users think the
   Start/End frames feed Extend/Create-new. They don't.

Scope is fix-now only. Generative continuation migrates to a dedicated Extend
App later (resolution-snap on model change, 4-8 frame smooth-extend, omni
multi-input, audio, model-pin all deferred to that App); continuation is
removed from History when the App ships.

Project rules: BEM mandatory, no hardcoded colors (CSS vars from
`styles/01_base.css`), icons via `js/utils/icons.js`, DOM via `js/utils/dom.js`
(`qs`/`on`), `Events.on/emit` for cross-component, unsubscribe on `destroy()`.
Register any new CSS in `js/shell/preloadStyles.js`; document prop changes in
`js/components/types.js`.

## Implementation

- [ ] **Fix the empty-box op collapse.** In `MpiPromptBox.js`, stop the
  empty-box -> text-op auto-switch from producing a "Select..." op when
  `filterNoInputOps` is active. When the context hides text-only ops, an empty
  media box must keep the current media op (e.g. I2V) pinned instead of
  switching to a text-only op that the dropdown then filters away. Confirm the
  affected paths: `_emitMediaChange` (`:264-284`) and `_pickOpForModel`
  (`:483-509`). The continuation buttons already run I2V with self-captured
  media, so the op should stay I2V in this mode regardless of box emptiness.
  **Verify:** open History on a video item with an I2V model, empty frame
  section, confirm the op badge/dropdown stays on Image to Video (not
  "Select..."), and that Extend + New shot both run a generation.
- [ ] **Section header + button rename** in `MpiToolOptionsPrompt.js`: add a
  `CONTINUE VIDEO` header above the actions row so the frame slots read as a
  separate zone; rename button labels `Extend` -> `Extend`, `Create new` ->
  `New shot` (`:200-214`). Style the header with existing tokens/BEM; register
  CSS if a new file/rule is added. **Verify:** header renders above the two
  buttons; buttons read "Extend" / "New shot".

## Completed

- [x] Empty-box op collapse fixed. Two guards in `MpiPromptBox.js` keyed on
  `_context.filterNoInputOps`: `_emitMediaChange` no longer switches an empty
  box to a hidden text op; `_pickOpForModel` fallback lands on the first media
  op instead of `supported[0]`. I2V stays pinned (no "Select...").
- [x] `MpiToolOptionsPrompt.js` + `.css`: "Continue video" section header
  above the actions; `Create new` -> `New shot`.

## Remaining Work

- User-ux verification in the running app (see ## Verification).

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux

UI/UX surface the user must judge in the running Electron app (History Video
workspace, port 3000). After implementation: open a video history item with an
I2V-capable model, leave the frame section empty, and confirm (a) the operation
stays Image to Video (no "Select..." collapse, no perceived jump to end frame),
(b) Extend runs a continuation gen, (c) New shot runs a standalone gen, and (d)
the CONTINUE VIDEO header + Extend / New shot labels render correctly. Frame
slots still work for manual first/last override on a from-scratch I2V.

## Preservation Notes

- Continuation-in-History is explicitly temporary. When the Extend App lands,
  remove Extend/New-shot from `MpiToolOptionsPrompt.js` + the
  `prompt-box-tools:extend|create-new` handlers in `MpiGroupHistoryBlock.js`.
  Note this in the Extend-App card when it is created.
- If the op-collapse fix touches shared PromptBox gating, sweep for other
  callers relying on the empty-box -> text-op behavior (T2I image models) to
  avoid regressing them.
- Consider a one-line note in `docs/ui-gotchas.md` if the
  `filterNoInputOps` + empty-box interaction is non-obvious after the fix.
