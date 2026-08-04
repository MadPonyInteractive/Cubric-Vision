# MPI-333 Validation

## Root cause (revised from the card's leading suspect)

The card suspected a full SHA256 **re-read** vs. hash-while-streaming (MPI-296).
The re-read is real, but the deeper cause is **where** it reads from:

- Post-install verify calls `_sha256_file(part)` in `wrapper/wrapper.py`
  (`_run_install`), a **second full read of the file off the network volume**.
- The network volume's **read** throughput is well below the multi-connection
  download rate, and on a GPU Pod `aimdo` pins host RAM (MPI-329) so the page
  cache can't serve the freshly-written bytes back → every verify re-reads cold
  off the slow volume.
- Live datapoint (2026-07-24): Excel model's 2GB ControlNet, first file on a
  cold network volume — download ~1min, verify ~3min. Single file, so the
  earlier "per-file overhead" hypothesis (2026-07-23 research note) is disproven.
- The "LTX 2.3 High 61.5GB verified fast" datapoint was a **CPU download Pod**
  (no aimdo, large page cache) → re-read served warm. Different machine, not a
  contradiction.

## Fix

`cubric-vision-pod/wrapper/wrapper.py` (wrapper 0.2.37 → 0.2.38, mpi-ci `04215a2`):

- `_download_aria2` sets `rec["verified_complete"] = True` when aria2 reaches
  `status == "complete"` — aria2's own per-piece tracking guarantees a hole-free
  file at that point.
- `_run_install` skips the SHA256 re-read when `verified_complete` is set AND an
  expected sha was supplied, recording the app-supplied expected sha as canonical
  (trusted-by-construction: our own R2 + TLS + aria2 completeness).
- The full SHA256 is **kept** for the finishes where completeness is not
  independently guaranteed: the RPC-dead belt exit (sparse `getsize` can snap
  high with holes), the httpx fallback, and any dep with no expected sha.

## Blast radius

- **Pod-only.** The local + resumable-local install path (`downloadManager.js`,
  MPI-296 hash-while-streaming) is a separate code path in the Electron app and
  is untouched → no influence on local or resumable downloads.
- Pod has no cross-Install resume (`.part` wiped each Install); aria2's
  in-invocation retries still finish `status=="complete"` → correctly trusted.
- App never re-verifies the wrapper's model sha (it reads manifest `nodes[]`
  commits for drift, not model sha), so recording the expected sha is transparent.

## Verification

- Code: 2 edits + version bump; `ast.parse` clean.
- Runtime: user-reported verified — install verify phase now near-instant on the
  live Pod (2026-07-24).

## Remaining (outward-facing, deferred)

- The Pod runtime is R2-floated (MPI-340). If not already done, publish to the
  **dev** channel (`./publish-runtime.sh dev`) for the dev-app boot, then
  **`promote`** (dev bytes → stable) to reach released users. `promote` writes
  the released-users' runtime — same outward-facing op the user deferred on
  MPI-340. Not run here.
