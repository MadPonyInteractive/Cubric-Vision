# MPI-673 Checklist

Derived from `tasks/MPI-673/brief.md` § "What 'done' looks like" (this card has no
`plan.md` of its own — the umbrella plan is `tasks/MPI-672/plan.md`).

- [x] `depsWarning` is durable server-side: `processState.lastDepsWarning`, written on
      every start that spawns (null on success = the retry clears it for free)
- [x] `/comfy/status` echoes `depsWarning` on ALL FOUR of its response branches, so a
      reloaded UI still learns the engine came up degraded
- [x] The warning reaches the user as the blocking error dialog (not a toast), once per
      new warning — `state.comfyDepsWarning` holds the announced value
- [x] A generation against a warned LOCAL engine is refused BEFORE dispatch, with the
      dependency-install reason — never the raw `Node '<title>' not found`
- [x] Remote/Pod runs are unaffected (the curated pass is local-only)
- [x] A failed pass still does NOT abort the engine start (MPI-459 comment intact)
- [x] `tests/curated-deps-warning.test.cjs` passes
- [x] `npm test` (840/840) + `npm run lint` green
- [x] Seen running for real: `tests/desktop/deps-warning-blocks-generation.spec.js`
      stubs a degraded `/comfy/status`, and asserts the dialog on the real DOM and the
      real `runWorkflow` rejection

## Folded in — found while implementing

- [x] The dialog is announced on CHANGE, not on presence. The readiness poll reads
      `/comfy/status` once a second and `state` is a Proxy that emits on every
      assignment, so announcing on presence would both reopen the dialog forever and
      spam `state:changed`. The desktop spec pins the no-reopen half.
- [x] ~~The message names no repair BUTTON.~~ **Superseded by MPI-674, 2026-09-01.** It
      was true when written: the dev radial's "Restart Engine" is dev-gated
      (`js/shell/navigation.js`), so a release build had no engine restart control and
      pointing at one would have been a lie. MPI-674 built the reachable repair
      (Settings → Engine health), so the copy now names it — and was rewritten again on
      Fabio's call to carry no internal identifiers at all. The current wording, and the
      title change at both mirrored sites, are owned and evidenced by
      `tasks/MPI-674/validation.md`.

## Left alone — deliberate

- The two side-utility `runWorkflow` callers (autoMask, image-describe) catch their own
  errors and only log. They will not open the dialog on `python_deps_broken`, but
  `_noteDepsWarning` already opened it at engine start. Not worth widening their catches.
