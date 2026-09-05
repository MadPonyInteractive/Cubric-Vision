# MPI-692 Checklist

- [x] `downloadWarnings(logText, seen)` — pure line filter + dedupe
- [x] `drainDownloadWarnings()` — `GET /logs/read`, emit via `log()`, swallow failures
- [x] Prime `seen` before the install phase so a re-run does not replay yesterday
- [x] `waitReady({ watchLog })` wired at the two install call sites only
- [x] `--self-check` asserts over a synthetic fixture log
- [x] `node scripts/smoke-workflows.mjs --self-check` passes (mutation-verified)
- [ ] Live: `⚠ [download]` lines appear under the dots on the next real smoke run
