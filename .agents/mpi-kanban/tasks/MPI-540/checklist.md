# MPI-540 — checklist

- [x] Rule out a downstream deferral before touching the counter. `main.js`
      `showOsNotification` fires on receipt and returns early when the window is
      focused; `js/shell/statusBar.js` has no focus-deferred replay. Nothing between
      the count and the screen holds a notification back, so the count is the only
      thing that can carry a batch 10-20 minutes.
- [x] Give `_doneCount` an expiry (`_doneAt` + `DONE_STALE_MS`, 5 min) checked on
      BOTH edges — before counting a new completion and at the top of
      `_maybeArmFlush`. Gating only at fire time is not enough: a fresh completion
      re-stamps the time and the orphans ride along as `N+1`.
- [x] Reset `_doneAt` in `destroyNotificationService`.
- [x] `tests/notification-stale-count.test.cjs` — drives the REAL module (it imports
      clean in bare Node with DOM stubs), three cases: the orphan is dropped, it does
      not inflate the batch that follows, and a live batch still coalesces to one.
- [x] Mutation-checked: removing either `_dropStaleCount()` call fails the two
      staleness tests while the live-batch control still passes.
- [x] Full suite green (560/560).
- [ ] Fabio confirms no late completion toast over a normal session.

## Not in this card

- The install-toast spam is still NOT reproduced and NOT root-caused. Note for
  whoever takes it: the `download:complete` handler already filters `!data.modelId`,
  and the MPI-539 reconcile path broadcasts `modelId: null`, so that path is not the
  source — do not assume it is. The candidate worth checking first is a model-level
  `download:complete` re-broadcast when the install SSE reconnects and replays.
- The vague "Free up space and try again" message (it replaces a precise
  "X needed, Y free" from `routes/downloadManager.js`) belongs with the engine-identity
  work on MPI-539, not here.
