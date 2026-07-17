# [shared] Injection title guard — the silent-skip trap

> The single worst class of add-model/add-app bug: a control that ships dead.

- The param injector matches a workflow node by `_meta.title` (case-insensitive) and
  **SILENTLY SKIPS a title with no matching node**. A typo'd or renamed title ships as
  a dead control — no error, no crash, just an ignored knob.
- The key is `Input_<Name>` EXACTLY. In `_buildParams`, a bare param name is prefixed
  to `Input_` before matching.
- Same family: an `Output_*` capture title that matches no node = a silently EMPTY
  capture (see [output-capture-titles.md](output-capture-titles.md)).
- Params built OUTSIDE `_buildParams` (e.g. `runAutoMask`) get NO rename — they must
  use `Input_*` keys directly (MPI-253).
- **Guard: `tests/inject-params-titles.test.cjs`** asserts every `injectParams` /
  `mediaInputs` title (and every `Output_*` capture title) exists in every workflow its
  op can run. **Add a case for every new op** — this is the automated backstop against
  the silent skip, and the diagnostic the injector itself refuses to give you.

The "trap that ate two days" (Krea2 `Input_Is_i2i` + `Input_Batch` ran dead for four
sessions): [../add-model/04-ops-and-controls.md](../add-model/04-ops-and-controls.md).
App verify step: [../add-app/05-verify.md](../add-app/05-verify.md).
