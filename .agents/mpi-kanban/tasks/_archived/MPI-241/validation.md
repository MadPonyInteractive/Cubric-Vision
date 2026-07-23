# MPI-241 Validation

## Verified live by user (remote ephemeral Pod, DevTools console open)

Iterative loop with a temporary `[MPI-241 …]` diagnostic trace confirmed the root
cause, then the fix was verified end-to-end:

- **Repro captured (pony-mix, first install after reload):** console showed
  `start() created job pony-mix:downloading` → footer `busy=true` (Cancel) →
  `SSE open status-fetch backendJobs=[6 old :complete jobs, NO pony-mix]` →
  overwrite wiped the job → footer `busy=false` → **Install** (bug), while the
  tile bar kept climbing (download was really running).
- **After fix (SDXL Realistic, first install after reload — the exact failing case):**
  Install → **Cancel** + short **Verifying…** sweep → **Uninstall** at the end.
  No revert to Install. User: "all good … This is verified."

## What ships
- `js/services/downloadService.js` — SSE `open` recovery now MERGES (keeps a live
  active client job the backend snapshot doesn't include) instead of overwriting.
  This is the root fix.
- `js/components/.../MpiModelManager.js` — footer/tile hardened: lingering
  `complete` job = busy (holds Cancel/progress, no Install flash); `anyInstalled`
  checked before busy so Uninstall wins the moment re-sync lands. No new label.
- `tests/model-footer-settling.test.cjs` — 9 pure-logic cases (footer branch
  order + SSE-open merge). `node --test` green.

## Notes
- All temporary `console.log` diagnostics removed before commit.
- No "Finishing…" label shipped (an earlier attempt introduced then removed it —
  the existing Verifying… sweep is the only end-phase text, per user).
