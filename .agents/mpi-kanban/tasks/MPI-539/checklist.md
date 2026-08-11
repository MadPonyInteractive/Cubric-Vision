# MPI-539 — checklist

One root: **a Pod can be a download TARGET without being a generation ENGINE**, and
nothing in the app held that concept. Six failures, all of it.

- [x] 1. `getEngine()` in `js/services/comfyController.js` returns the local-pinned
      engine whenever `remoteEngineClient.isDownloadOnly()`. One resolution keeps the
      hot-store staging AND the not-ready teardown off a CPU box.
- [x] 2. The per-gen engine derivation in `js/services/commandExecutor.js` matches, so
      the hot-store preflight is never reached in download mode.
- [x] 3. `_ensureRemoteHotStore` guards `__cpu__` directly — its stage-on-connect twin
      `prefetchInstalledModels` has carried that guard since MPI-329 and the per-gen
      path never did.
- [x] 4. `routes/downloadManager.js` no longer abandons outstanding deps silently
      (`_failOutstandingRemoteDeps`, wired into the SSE-close path AND the stall
      watchdog).
- [x] 5. …and that path now calls `_checkModelJobsComplete()`. Failing the deps alone
      terminated nothing the user can see: the dep-level `download:failed` carries no
      modelId and the client drops those (MPI-97), so the MODEL job stayed
      `downloading` and the card froze at the Pod's last progress over local truth.
- [x] 6. A queued install records the engine it was queued FOR
      (`js/services/downloadService.js`) and is dropped, never retargeted, when the
      engine changes. The POST is serialized, so the engine is read when it lands —
      Boogu Image Edit would have gone onto the LOCAL disk unasked.
- [x] `tests/download-mode-pod-guards.test.cjs` — 5 tests against the real modules.
      Every one mutation-checked.
- [x] Full suite green (560/560).
- [ ] Live proof: connect a download-only Pod, install onto it, kill the Pod, and
      confirm the Model Library returns to local truth with no frozen bar and no
      queued install left pointing at nothing.

## Deliberately NOT here

- The Pod OOMing on an HF download is **MPI-541** — the Pod's own transport, a
  different repo, and it would OOM the same box with no app bug at all.
- The stale completion notification is **MPI-540**.
- `noGpu` is only on the branch of `/remote/comfy/status` where `/health` answered
  (`routes/remotePodLifecycle.js:646`); the 502/booting/dead branches omit it. The
  client mirror comes from `/remote/mode`, which always carries it, so `getEngine()`
  is safe — but any future guard reading `check.noGpu` off the STATUS response is not.
