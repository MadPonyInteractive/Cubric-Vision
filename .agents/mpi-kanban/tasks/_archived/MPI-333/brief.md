# MPI-333 — RunPod post-install verify slower than download

## Symptom
Portable 1.1.0 install test, 2026-07-22, live Pod. A model pack downloads to the
Pod, then the Model Library tile shows **Verifying...** — and that verify phase
takes **longer than the download itself**. Bad ratio; verify should be cheap.

## Suspected root
Post-install SHA256 re-hash of every weight file AFTER it lands, read back off
the network volume, serial. We already hash-WHILE-streaming on the local install
path (MPI-296) — the remote path likely re-reads instead.

## Where to look
- Pod side: `c:\AI\Mpi\mpi-ci\cubric-vision-pod\wrapper\wrapper.py` (install/verify).
- App side: `routes/remoteModels.js`, `routes/remoteEngine.js`, `routes/runpodRemote.js`.
- Local reference for the good pattern: MPI-296 hash-while-streaming (docs/download-manager.md).

## Fix directions (pick after measuring)
1. Verify during the stream (mirror the local hash-while-download path).
2. Verify by size + manifest hash without a full byte re-read.
3. Parallelise the per-file hashing.

## Not this
NOT MPI-329 (cold model-LOAD ~2min into VRAM at gen time). This is INSTALL-time
verification. Distinct phase, distinct fix.
