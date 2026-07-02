
## 2026-07-02T11:36:50Z — fix committed (63a9b58), pending live verify
- node --check passed; JSON.stringify drops phase:undefined so client never writes stale phase; UI reads phase only while indeterminate.
- Live repro needed: fresh Pod, LTX GGUF install → bar climbs to visible 100% → flips 'Verifying…' → 'INSTALLED'. Also: NO 'Verifying…' label early in a multi-dep install while other deps still downloading.
- Verify-takes-long is NOT a bug: wrapper sha256 re-reads whole file (8MB chunks, off-thread) from network volume — read speed bound.

## 2026-07-02T11:51:28Z — live round 1 (LTX 2.3, download-only Pod, partially installed)
- PASS: bar reached visible 100%; 'Preparing…' at start; no early 'Verifying…'.
- FAIL: no 'Verifying…' at end — hung full+determinate, snapped to INSTALLED.
- Cause: requirements-only custom-node dep (folder on volume -> pip-only) sits at 0 bytes; byte gate never opened. Fixed 445d647 (custom_nodes excluded from gate).
- Known residual: an install where ONLY node pip runs (all weights already complete) never gets a verifying event -> full determinate bar until INSTALLED. Acceptable/out of scope.
- Live round 2 needed: partially-installed model with node deps -> expect bar 100% -> 'Verifying…' during final hash + pip -> INSTALLED.
