# MPI-254 Validation — Remote install 100% hang (wrapper finalize stall)

## Root cause (confirmed)
`_download_aria2` (wrapper.py) added `--enable-rpc` in 0.2.34 for the progress
numerator. aria2c with `--enable-rpc` does NOT exit when the download finishes —
it idles as an RPC daemon. So the poll loop's `await proc.wait()` never returned,
`_download_aria2` never returned, and finalize (sha256 + `os.replace(part,dest)` +
`models:install-complete`) never ran. `.part` sat at full size, wrapper reported
`installed=false` forever, app hung at a determinate 100% with no Verifying sweep.

Peer's investigation (evidence in card) correctly isolated it to the wrapper
finalize path (`.part` full but never promoted, `installed=false` frozen). The
missing piece — aria2 never exits under RPC — was found + fixed here.

## Fix (wrapper 0.2.36, commit db452f4 on branch fix/aria2-rpc-progress-numerator, mpi-ci)
Poll aria2's own `status` via RPC (`aria2.tellStatus`). On `complete` →
`aria2.shutdown` so the process exits and `proc.wait()` resolves → finalize runs.
On `error` → shutdown + fall through to httpx fallback. Belt for a dead/unreachable
RPC: `status` None + `.part` at HEAD-resolved total → terminate ourselves. All
MPI-196 speed flags untouched.

Shipped via `publish-runtime.sh stable` (R2), no image rebuild.

## Live verification — PASS (USER-VERIFIED 2026-07-11)
Fresh No-GPU download Pod, bootstrap confirmed `wrapper 0.2.36`
(sha `3f8f3821565002e1710f61ae4b39797f712c9ca9b8d7359c8214a7b58aaa735c`).
Krea 2 Turbo install:
- honest 0→100 climb (RPC numerator, 0.2.34)
- → **"Verifying…" sweep shown** (first time end-to-end; 0.2.35 emit + finalize now runs)
- → **INSTALLED** ("Krea 2 Turbo installed." toast; header 2→3 installed)

Full chain proven. The original user complaint (bar jumps to ~95% then crawls /
hangs) is fixed across the three wrapper bumps (0.2.34 numerator, 0.2.35 verify
emit, 0.2.36 finalize shutdown — the load-bearing one).

## Out of scope / follow-up
- Watchdog false-fire during sha256 verify → **MPI-255** (separate, still open).
- Memory: [[project_aria2_rpc_never_exits_finalize_hang]].
