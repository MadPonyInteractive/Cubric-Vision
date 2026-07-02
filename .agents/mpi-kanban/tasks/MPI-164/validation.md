
## 2026-07-02T11:36:50Z — fix committed (63a9b58), pending live verify
- node --check passed; JSON.stringify drops phase:undefined so client never writes stale phase; UI reads phase only while indeterminate.
- Live repro needed: fresh Pod, LTX GGUF install → bar climbs to visible 100% → flips 'Verifying…' → 'INSTALLED'. Also: NO 'Verifying…' label early in a multi-dep install while other deps still downloading.
- Verify-takes-long is NOT a bug: wrapper sha256 re-reads whole file (8MB chunks, off-thread) from network volume — read speed bound.
