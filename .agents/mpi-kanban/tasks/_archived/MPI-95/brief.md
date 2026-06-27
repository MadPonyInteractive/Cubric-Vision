# MPI-95 Brief — Remote download progress jumps to ~80% then crawls

> **STATUS 2026-06-15 — ⛔ BUILD-GATED, parked in `doing`.** Both halves coded + committed
> (app: `9124daf` on RunPod; wrapper: `faa4187` in mpi-ci `wrapper/wrapper.py`). Folded into
> **MPI-81 rebuild candidate #5** (contract FROZEN — event names/shapes must not change at build
> time). The fix is NOT live and CANNOT be verified until the USER runs the MPI-81 Pod-image
> rebuild (bump `WRAPPER_VERSION` next after 0.2.3 in both the mpi-ci build arg and
> Cubric-Vision `routes/remoteProxy.js`). Two checklist items remain: build + live-verify on a
> fresh Pod. Do NOT move to done until verified live. Pre-build checks all pass (py_compile /
> node -c / eslint / local-path-untouched). See validation.md for the live pass criteria.
>
> **NOTE:** the "Chosen fix" + "Scope" sections below describe the EARLIER app-only F3 plan; the
> shipped fix PIVOTED to a wrapper-side denominator (`_resolve_total` HEAD seed) +
> `models:install-verifying` SSE. checklist.md + validation.md are the current source of truth.

## Symptom
In RunPod remote mode, pressing **Install** on any model makes the progress bar
snap to ~80% in a fraction of a second, then crawl the last ~20% slowly. Feels
like a lie to the user. Happens on big (36GB I2V) and small (8GB T2I) models
alike.

## Root cause (investigated, not the hash stall)
The progress **denominator** is built from rounded display strings, and small
deps finish before the big dep's real total is counted:

- Every model = a few tiny deps (VAE, text encoder, configs — KB/MB) + one
  dominant weight (6–36 GB).
- Bar % = `summed real bytes / summed estimated total`.
  - Numerator = wrapper's **real content-length bytes** (`models:install-progress.bytes`).
  - Denominator = sum of **rounded** `_parseSizeToBytes(dep.size)` strings
    (`"6.94GB"`, `"15GB"`…). See `routes/downloadManager.js` `_startRemoteDownload`
    (lines ~606, 614, 638) and `_onRemoteInstallEvent` (lines ~536–537).
- On RunPod's fat NIC the tiny deps + a chunk of the big one fly down in the
  first second → numerator jumps. The big dep's **real** `total` only overwrites
  the estimate after its first SSE lands → ratio overshoots → instant ~80%.
- Then only the big weight remains → long crawl against the now-correct total.

NOT the post-download sha256 hash stall (separate, smaller, later effect). NOT
pre-installed deps. A "verifying spinner" would NOT fix this.

## Registry has no exact bytes
`js/data/modelConstants/dependencies.js` deps carry `size` (rounded string) +
`sha256`, but **no exact byte count**. So we cannot seed an exact denominator
from the registry.

## Verified fact
HEAD on a real dep URL (HF `resolve/main` → Cloudflare/Xet redirect) returns the
exact size:
- First `302` already carries `X-Linked-Size: 7105352784`.
- Final `200 OK` carries `Content-Length: 7105352784` (7.1 GB exact vs rounded
  "6.94GB").
- `_getFileSizeFromUrl` (exists, `routes/downloadManager.js:274`) follows
  redirects → gets the exact bytes. No silent fallback risk on HF URLs.

## Chosen fix — F3 (HEAD true-total + indeterminate-until-ready)
1. **HEAD half:** in `_startRemoteDownload`, before the first broadcast, HEAD all
   to-install deps in parallel via `_getFileSizeFromUrl` → seed each
   `depJob.totalBytes` with the real content-length → true denominator from frame
   one. Fall back to `_parseSizeToBytes(dep.size)` if HEAD returns 0.
2. **Indeterminate half:** until every active dep's real total is known, mark the
   job/broadcast as indeterminate (no %); renderer shows an animated
   "Preparing…" bar. Once totals resolved, switch to a real %, smooth 0→100.

## UI result
Press install → brief "Preparing…" (sub-second) → ONE smooth bar 0→100, no jump.

## Scope
- `routes/downloadManager.js` only (remote path). Local path untouched.
- Possibly a small renderer/download-panel tweak to render indeterminate state if
  not already supported (verify MpiModelDownloadCard / progress bar).
- Wrapper (`mpi-ci`) NOT touched — denominator fix is app-side.
