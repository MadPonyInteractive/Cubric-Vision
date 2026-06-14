# MPI-47 — Validation

**Status:** PASSED — user-verified 2026-06-08.

Ctrl+ / Ctrl- change the global UI size (Electron webFrame zoom), matching the
existing Ctrl+wheel control. Enlarge via `+` (numpad) and shiftless `=`; shrink
via `-`. Works while typing (`allowWhileTyping: true`). No conflict with the
gallery's bare `+`/`-` grid-size keys (distinct mapKeys: `control++` vs `+`).
Ctrl+wheel unchanged. Help page System section shows the new rows.

Committed in b2f53ba.
