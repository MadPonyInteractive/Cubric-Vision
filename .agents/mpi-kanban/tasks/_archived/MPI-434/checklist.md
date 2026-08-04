# MPI-434 — Checklist

## Part 1 — move the local engine to 48188

- [x] `routes/shared.js` — `COMFYUI_PORT` 8188 -> 48188, with the WHY in a comment so
      nobody "tidies" it back, and a pointer to the three other literal sites.
- [x] `js/services/comfyController.js` — `serverAddress` (feeds `httpBase()` + the ws:// URL).
- [x] `js/shell/memoryOps.js` — direct unload fallback.
- [x] `main.js` — Origin spoof + both webRequest URL guards. **Miss = 403 on everything.**
- [x] Cosmetic copy: `js/pages/components.js`, `js/components/types.js`,
      `routes/projects.js`, the `comfyController.js:241` comment.
- [x] Confirmed NOT touched: `remotePodLifecycle.js` (`spec.ports.push('8188/http')`),
      `MpiRunpodSettings.js` (`<podId>-8188.proxy.runpod.net`), the three `scripts/*.mjs`.

## Part 2 — refuse an engine we did not start

- [x] Pre-spawn probe in `routes/comfy.js`, placed AFTER the `activeComfyProcess`
      early-return and BEFORE the spawn: port answers + no live child -> 409.
- [x] Message is plain language, names the port, no stack, no bug-report nudge (MPI-427 lesson).
- [x] No frontend work needed — `ensureServerRunning` already surfaces a non-OK
      `/comfy/start` body as `ui:error` verbatim (built by MPI-415).

## Guard + verify

- [x] `tests/comfy-port-lockstep.test.cjs` — reads the four REAL sources, asserts one port,
      asserts the port is not 8188 and is below the Windows ephemeral floor, asserts the
      REMOTE 8188 sites are untouched, and asserts the probe precedes the spawn.
- [x] Negative control, all five doctored one at a time against the real files then restored:
      shared.js back on 8188, serverAddress drift, memoryOps drift, main.js Origin drift
      (the 403 case), remote Pod port dragged along. Each one fails the test as required.
- [x] `node --test "tests/*.test.cjs"` — **329/329 pass**.
- [x] eslint on all 8 touched files — 0 errors (5 pre-existing warnings in
      `js/pages/components.js`, unrelated lines).
- [x] LIVE: engine ComfyUI launched on 48188 from `engine/ComfyUI_windows_portable` —
      binds, serves, **1862 node classes with `MpiInt` registered** (97 `Mpi*`).
- [x] LIVE: repo-root harness mounting the real comfy router, 48188 occupied ->
      `409 {"error":"Something else is already using port 48188 — most likely another
      ComfyUI. Close it, then start the engine again."}`. Did not adopt.
- [x] LIVE negative control: 48188 free -> `200 {"success":true}`, proceeds to spawn.
      The probe does not false-positive, so it cannot lock anyone out of their engine.
- [ ] **Outstanding: one full app run.** Every piece is verified in isolation, but the
      Electron Origin/CORS spoof only exercises inside Electron. Start the app, generate
      once, confirm the engine comes up on 48188 and ComfyUI does not 403.

## Notes

- **Diagnosis confirmed by the reporter**: micha turned off his own ComfyUI instance and
  the app worked. No code was needed to prove it.
- He reported this AS a 1.3.1 regression. It is NOT — his log shows MpiNodes downloading,
  extracting and stamping cleanly at 15:30:09 from github.com. MPI-427's fix worked. Say
  that plainly if it comes up again.
- Why we never caught it in testing: the ComfyUI squatting on 8188 during dev is usually
  our OWN engine or the authoring bench, both of which HAVE MpiNodes — so adopting the
  stranger was harmless here and fatal for a user with a plain ComfyUI install.
- A stale engine may still be listening on 8188 from before this change. Harmless now
  (the app no longer looks there), but it is idle VRAM — kill it on next restart.
- `docs/DEVELOPMENT.md` § MPI-346 rewritten: the bench-collision hazard is fixed in
  product, not a dev workaround any more.
- **Not touched, needs a decision:** `.claude/rules/component-mounts.md:146` documents an
  `MpiInput` with placeholder `http://localhost:8188` ("ComfyUI API URL"). No such string
  exists in `js/` — the rule entry looks stale independently of this card. Rule files are
  edit-gated (CLAUDE.md § Cardinal Rule 5), so it was left alone.
- Ships as a 3rd-digit bug fix.
