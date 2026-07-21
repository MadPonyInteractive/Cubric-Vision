# MPI-184 Validation

## Shipped (2026-07-05)

### Fix A — app-side serial install queue (RunPod branch)
`js/services/downloadService.js`
- `start()` no longer POSTs immediately. It chains each install on `_installChain`.
- Each queued item: `_doStart(modelId, deps)` (the old start body — POST + job create)
  → `_awaitTerminal(modelId)` which resolves on `download:complete` / `download:failed`
  / `download:cancelled` for that model (30-min safety timeout so a dropped SSE event
  releases the queue instead of wedging it).
- Result: the wrapper receives installs one at a time. Kills the concurrency trigger
  behind BOTH symptoms (N-way aria2 starvation → SSE stall; set-diff race → false
  "no folder").
- Only install is queued. pause/resume/cancel/uninstall stay direct.

### Fix B(2) — wrapper node-detect via zip namelist (mpi-ci, needs image rebuild)
`c:/AI/Mpi/mpi-ci/cubric-vision-pod/wrapper/wrapper.py` (~line 1734)
- Replaced the before/after `os.listdir(CUSTOM_NODES_DIR)` set-diff with reading the
  extracted top-level dir from the zip's OWN namelist. Self-contained, race-proof.
- Fixes false "archive produced no folder" for both root causes: (a) concurrent write
  into CUSTOM_NODES_DIR between snapshots, (b) target dir already existed from a prior
  partial.

## Logic-proven (this session)
- Serial-queue harness: 3 installs fired "at once" → order A,B,C, `maxActive == 1`. PASS.
- Zip-namelist harness: GitHub-archive zip extracted into a CUSTOM_NODES_DIR that
  already held an unrelated dir → detection returns the correct extracted folder,
  ignores the noise. PASS.
- `node --check downloadService.js` clean. `py_compile wrapper.py` clean.

## NOT DONE / deliberately skipped
- B(1) wrapper asyncio.Lock around _run_install, and C (lower aria2 -x/-s under
  concurrency): now largely moot — Fix A guarantees the wrapper sees one install at a
  time from the app, so app-driven starvation can't occur. Would only matter for a
  non-app client hammering the wrapper concurrently (out of scope).

## Follow-up (2026-07-05, same session) — feedback + overlap

Live test surfaced two UX gaps in the first cut; both fixed:

### Queued feedback (was: dead INSTALL button on models 2/3)
The first cut deferred the whole `_doStart` (job-create + `download:started` + POST)
behind the chain, so a 2nd/3rd click created no job → no bar → the card still showed
INSTALL until model 1 finished (live-confirmed by screenshots). Fix: create the job +
`download:started` IMMEDIATELY on click (status `queued`); only the POST is serialized.
- `js/services/downloadService.js`: job starts `queued`; `_firePost` flips it to
  `downloading` on its turn; `cancel()` of a still-`queued` job emits `download:cancelled`
  locally (backend never saw it) so the card reverts to Install and the chain skips it.
- `MpiInstalledDisplay.js`: new `queued` state → QUEUED badge + "Queued…" + Cancel.
- `MpiModelManager.js`: `queued` counts as `isActiveDownload` (renders queued actions,
  freezes op toggles).

### Verify-overlap (user ask: start next download while current verifies)
`_awaitTerminal` → `_awaitDownloadDone`: releases the chain when the current install's
BYTES are all on disk (enters verify/extract) — `download:installing`, or a remote
`phase==='verifying'` progress tick — OR terminal (fast installs). The next model's
DOWNLOAD then overlaps the current's verify/extract. Still only ONE aria2 download
stream at a time → no CPU-pod starvation regression. Extract stays race-proof via the
B(2) zip-namelist fix.

Logic-proven this session: serial harness maxActive=1; immediate-queued + queued-cancel
skip PASS; verify-overlap harness (B download starts after A:verify, before A:complete,
maxDownloading=1) PASS. All three files `node --check` clean.

## LIVE VERIFY — DONE (user-confirmed 2026-07-05)
Tested on a real CPU download-Pod + RunPod, app restarted:
1. ✅ Multi-model install serialized — only ONE download at a time; 2nd/3rd wait;
   SSE stayed alive, bars kept moving; no bad-response → silent-stall loop.
2. ✅ QUEUED feedback — queued models show a QUEUED badge + Cancel (not a dead
   INSTALL button). Single lone install goes STRAIGHT to downloading (no QUEUED
   flash — the _inFlight fix). Card shows one set of animated dots, Cancel pinned right.
3. ✅ Verify-overlap — next model's download starts while the prior verifies
   (two "Verifying…" seen concurrently; confirmed safe — independent sha256 threads,
   no shared state, only ONE download stream, no wrapper starvation).
4. ✅ Cancel a queued model — drops it, reverts to Install, and the queue CONTINUES
   with the next model.

Fix A (app serial install queue + queued UX + verify-overlap) FULLY user-verified.
Fix B(2) (wrapper zip-namelist node-detect) committed in wrapper 0.2.29 — deploys on
the NEXT pod image rebuild (`build-pod-image` skill); it's a race-proofing improvement,
not user-facing, and the whole race it fixes can no longer be app-triggered now that A
serializes installs. B(1)/C skipped (moot once A serializes).

Commits: 6e17996, 789035f, 87f7849, 9fb9b21 (Cubric-Vision RunPod) + 8149575 (mpi-ci).
