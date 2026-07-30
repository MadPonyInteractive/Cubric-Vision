# MPI-410 — the startup splash never shows on a first/cold run

Surfaced 2026-07-30 in the MPI-407 Linux verification log. **Pre-existing and
cross-platform** — the user reports it "always fails on the first run, not just
on Linux". Not a 1.3.0 regression, not a blocker; deliberately NOT fixed inside
1.3.0 because `main.js` is already baked into verified artifacts and a cosmetic
splash does not justify a new SHA plus re-verifying six bundles.

## Symptom

```
[2026-07-30T23:44:34.338Z] [WARN] [main] Splash failed to load: ERR_FAILED (-2)
  loading 'file:///home/mad-pony/Downloads/CubricVision-linux-x64-v1.3.0/app/splash/splash.html'
```

Logged by the `.catch` at `main.js:751`. The splash window is then destroyed
(`main.js:752`) and never appears.

## It is NOT a packaging miss

`app/splash/splash.html` is present in
`CubricVision-linux-x64-v1.3.0.tar.gz` (verified with `tar -tzf`). A genuinely
missing file would also raise `ERR_FILE_NOT_FOUND (-6)`, not `ERR_FAILED (-2)`.
Electron rejects a pending `loadFile` with `ERR_FAILED` when the WebContents is
**destroyed mid-navigation**, which is the shape this has.

## Why it matters

`main.js:722` states the splash's whole purpose: *"Family splash (MPI-10):
visible instantly, gate the main window."* It is there to cover a slow start —
and the slow start is exactly the run where it fails. On a warm second run it
loads fine, when there is nothing to cover. The behaviour is inverted.

Cost in the measured run: the splash died at 23:44:34.3 while the real page did
not arrive until 23:44:38.5 — roughly 4 seconds of uncovered window, on top of
the ~9 s before that.

## Candidate root causes — NOT yet settled

Do not fix from this brief alone; reproduce first.

1. **The main window's `ready-to-show` fires on the network error page.** The
   splash close lives at `main.js:419-421`, described as "before revealing the
   main window". With MPI-407's retry loop the main window exists and renders
   Chromium's error page well before the real page loads, so `ready-to-show`
   may fire early and close the splash. Timeline fits: 5 s fallback at
   23:44:32.65, splash rejected 23:44:34.34.
2. **The splash's own load is starved.** ~8.4 s elapsed between splash creation
   and the rejection, which is very long for an inline-CSS `file://` page with
   no external assets. A main process busy with startup work could delay it past
   the point where something else tears it down.

Cause 1 explains the cross-platform "first run only" report better: a fast start
closes the splash correctly, but its own `ready-to-show` (`main.js:743-745`) has
not fired yet, so it is destroyed before it was ever visible. Both need the
actual repro.

## Verify

Cold-cache launch (`sync && echo 3 | sudo tee /proc/sys/vm/drop_caches`, or a
cold boot) and confirm the splash window is visible during the wait and does not
log a load failure. A warm-cache run cannot test this.
