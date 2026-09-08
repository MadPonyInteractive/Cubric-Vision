# MPI-654 Checklist

- [x] Reproduce the disagreement with a sandboxed harness that calls the REAL
      `localModelsCheck` (`routes/comfy.js`) and the REAL `resolveComfyPath`
      (`routes/shared.js`) against a temp engine root — never the user's engine.
- [x] Record which direction actually diverges. The brief's stated direction is a
      code trace, not an observation; verify before trusting it.
      → **The brief's case does not reproduce.** Both readers already fall back to
      the default root. The real divergence is a same-named weight in another
      bucket: installer says installed, library says not.
- [x] Fix the root cause: one resolver, both callers. `_localModelsCheck` delegates
      to `resolveComfyPath`; the search is scoped to the dep's own bucket. −45 lines.
- [x] Re-run the harness — every scenario must agree. 9/9, plus
      `tests/dep-path-agreement.test.cjs` (proven to fail without the fix) and
      `npm test` 774/774.
