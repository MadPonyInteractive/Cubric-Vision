# MPI-738 - validation

**Root cause.** `MpiModal.show()` binds `modal.confirm` (`enter`, `allowWhileTyping: true`)
unconditionally, whether or not the dialog subscribes to `confirm`. `hotkeyManager`
`preventDefault()`s + `stopPropagation()`s any key that is bound AND passes its gates
*before* dispatching to handlers (`hotkeyManager.js:210`). So Enter died inside every
textarea in every modal, with no listener anywhere to blame. `MpiNotesEditor` (project
notes and card notes) and `MpiEnhanceDialog` both carry comments saying they deliberately
do not listen for `confirm` - correct, and irrelevant: the swallow happens one layer up.

**Fix.** One `when` on the `modal.confirm` registry entry: never fire while a
`HTMLTextAreaElement` or a `contenteditable` has focus. A false `when` short-circuits
`_dispatch` before `preventDefault`, so Enter goes native. Single-line inputs still confirm.

## Evidence

| check | result |
|---|---|
| `node --test tests/modal-confirm-textarea.test.cjs` | PASS - the gate blocks textarea + contenteditable, allows input/null |
| `tests/desktop/notes-enter-newline.spec.js` (real Electron, real keypress) | PASS - textarea reads `line one\nline two`, dialog still open |
| Mutant (`when: () => true`) | BOTH checks FAIL - proven able to fail |
| `popup-contract` + `model-settings-popup` desktop specs | PASS - modal stack unaffected |
| `npx eslint` on the three touched files | clean |

Enter-to-confirm consumers audited and unaffected (none focuses a textarea):
`MpiOkCancel`, `MpiNewProject`, `MpiReusePromptDialog`, `MpiRunpodSettings`.
