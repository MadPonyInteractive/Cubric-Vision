# MPI-470 - validation

Run 2026-08-07, local Windows. Card stays in `doing` / `validating`: everything provable
without a GPU is proved; the one remaining item needs the user's own app.

## Green

- `npm test` — **478 pass / 0 fail**. Four failures surfaced mid-work and all four are
  accounted for:
  - `tests/uninstalled-op-gate.test.cjs` (2) and `tests/uninstall-guards.test.cjs` (1)
    were MINE: each hard-coded wan-22's two-op shape. Both now build the pre-MPI-470
    two-op model from the real card and re-add the group, so MPI-453's and MPI-245's
    regression proofs survive the deprecation instead of being deleted with it.
  - `tests/resolve-model-deps.test.cjs::testRealRegistryIntegrity` — retargeted:
    `selectableOps(wan) == ['i2v_ms']`, and the old "t2v-only excludes the i2v node"
    assertion is now "a DEPRECATED op resolves to commonDeps only", which is the
    property that actually matters (a stale draft must not drag the 27.1GB back).
  - `testSingleFileStages` failed on `swept >= 8` at 7. That floor tracked the workflow
    FILE count, which moves whenever a model collapses graphs (MPI-466 folded LTX six
    into two) or drops an op. Replaced with a coverage guard: every `multiStage` model
    must contribute ≥1 resolution. Immune to file churn, and it still catches a sweep
    that silently covers nothing.
  - `tests/lane-settle-on-bail.test.cjs::every pre-dispatch bail routes through
    _failBail` was NOT mine — `js/services/commandExecutor.js` was dirty (−46 lines) in
    a parallel MPI-466 session. It went green on its own once they landed.
- `npm run test:desktop` — **17 passed**, including the retargeted
  `tests/desktop/model-ops-resolver.spec.js` (real Electron module resolver, in-page).

## Reasoned through the code, not just tested

- **A stale saved op-draft cannot strand a user.** `state.s_modelOpDraftByModel['wan-22']
  = ['t2v_ms']` → `_draftFor` calls `expandRequiredOps`, which filters against
  `selectableOps` and returns `[]` → the empty-draft branch falls back to
  installed-or-all. It cannot persist as "install nothing".
- **A remembered op cannot dispatch.** `MpiGalleryBlock` re-checks
  `supportedOps.includes(op)` and falls to `firstInstalledOp`; the op strip filters on
  `supportedOps`.
- **A legacy history item naming `t2v_ms` fails cleanly.** The MPI-453 generate-time gate
  skips it (`_opModel.operations['t2v_ms']` is gone), but `resolveWorkflowFile` returns
  `null` and `commandExecutor` throws `No workflow registered for model "wan-22",
  operation "t2v_ms"` into `_failBail` — the lane settles and the error names the cause.
  No crash, no cryptic ComfyUI rejection. Nothing new was written for this path.
- **Old t2v history stays viewable**: `t2v_ms` is still a live key in
  `operationRegistry` (LTX, H3 use it), so no `deprecated` entry is needed there.

## Not verified — needs the user

- **A real Wan 2.2 i2v generation through the app.** No GPU run happened here. Everything
  above says i2v is untouched (same op key, same graph, same deps), but "the model still
  generates" is not proved.
- **The Model Library tile.** With one op left, wan-22 renders a lone "Image to Video"
  toggle. Expected and harmless (unticking it cannot persist, see above), but nobody has
  looked at it.
