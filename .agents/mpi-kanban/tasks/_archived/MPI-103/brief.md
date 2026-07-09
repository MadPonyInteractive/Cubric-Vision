# MPI-103 — Live-updatable Pod idle timeout (no recreate)

## Problem
The RunPod idle-watchdog timeout is set by the env var `CUBRIC_IDLE_TIMEOUT_S`,
written by the app's createPod call (`routes/remoteProxy.js` ~L424-431) and read
once at wrapper boot (`wrapper.py` L64 → `IDLE_TIMEOUT_S`). RunPod env vars are
**immutable on a running/stopped Pod** — only a fresh create can change them.

Consequence (live-found 2026-06-16): user changes "Idle timeout (minutes)" in
Settings, disconnects (which **STOPs**, not deletes — `/remote/pod/stop-active`,
keeps the Pod warm), reconnects → the reconnect **warm-resumes** the same Pod and
**ignores the new value**. The Pod keeps the timeout it was created with. The user
expects the new value respected; it silently is not.

Rejected fix: force a delete+recreate on change. Makes the user wait for an image
pull (~90-120s) just to change a number. Not acceptable.

## Fix — wrapper live-update endpoint (new image)

### Wrapper (mpi-ci `cubric-vision-pod/wrapper/wrapper.py`)
- Make the timeout a **mutable Watchdog field**: move `IDLE_TIMEOUT_S` into
  `Watchdog.__init__` as `self.timeout_s` (seed from env). Replace the three
  `IDLE_TIMEOUT_S` reads (L245 `__init__`, L251 `touch`, L258 `gen_end`) with
  `self.timeout_s`.
- Add `Watchdog.set_timeout(s)`: clamp to the floor (match the app/backend clamp —
  600s), set `self.timeout_s`, recompute `self.deadline = time.monotonic() + s`
  so the change takes effect **immediately** (not only on next touch), update
  `self.enabled = s > 0`.
- Add authed route `POST /wrapper/idle-timeout` body `{ "seconds": <int> }`.
  Mirror the existing guard pattern (`if not _http_token_ok(request): return
  UNAUTHORIZED`), `watchdog.touch()`, `watchdog.set_timeout(seconds)`, return
  `{ "ok": true, "timeout_s": watchdog.timeout_s }`.
- Surface the live value in **both** `/health` returns (download-mode + normal):
  add `"idle_timeout_s": watchdog.timeout_s` alongside the existing
  `watchdog_enabled` key.
- Bump `WRAPPER_VERSION` (set via `CUBRIC_WRAPPER_VERSION` env in
  `remoteProxy.js`; keep the two in lockstep).

### App (Cubric-Vision)
- New proxy route `POST /proxy/idle-timeout` in `routes/remoteProxy.js` → forward
  to wrapper `/wrapper/idle-timeout` with the Bearer token (mirror
  `/proxy/restart-comfy`). Active-mode guard like the other `/proxy/*` routes.
- `MpiSettings.js`: while a Pod is connected, **unlock** the idle-timeout input;
  on `change`, POST `/proxy/idle-timeout` live + a `ui:success` toast
  ("Idle timeout updated"). Keep storing `idleTimeoutS` in `runpodConfig` so a
  fresh create still bakes the chosen value. The create/reconnect bodies keep
  riding `idleTimeoutS` (L663-666) for the cold-create case.
- Read the live value back from `/health` (`/remote/comfy/status` already proxies
  `/health` — extend it to pass through `idle_timeout_s`) so the displayed value
  reflects what's actually live on the Pod, not just localStorage. Closes the
  desync class that caused this bug.
- **Rewrite the hint** (MpiSettings.js ~L405-407): drop the "locked while
  connected / set before connecting / resume keeps original" caveat — no longer
  true once live-update ships. New copy: editable any time; auto-stops after this
  long with no generating/installing/downloading; minimum 10.
  - NOTE: an interim hint clarification (three reset triggers + resume caveat) was
    shipped on the RunPod branch 2026-06-16 as a stopgap before this card. This
    card's rewrite supersedes it.

### Image build
- New image, cu124 / cu128 / cpu matrix, via mpi-ci dispatch (commit+push mpi-ci
  main BEFORE `gh workflow run` — dispatch builds the pushed ref). GHCR make-public
  step. **Image builds are USER-authorized; live Pod ops stay USER-only.**
- BATCH OPPORTUNITY: if any other in-flight card needs a wrapper/image change at
  the same time, land both wrapper diffs first and fire ONE image build (one
  matrix, one GHCR publish) instead of two cycles. As of 2026-06-16 MPI-78 is
  marked app-side-only / NO rebuild — so unless that scope grew, MPI-103 builds
  alone. Confirm with any concurrent agent before dispatching.

### Interim hint stopgap (kept)
An interim idle-timeout hint clarification was shipped on the RunPod branch
2026-06-16 (states the three watchdog-reset triggers — generating / installing /
downloading — plus the create-vs-warm-resume caveat). USER chose to KEEP it as-is:
it's correct until live-update lands and harms nothing. This card's hint rewrite
(see App section) SUPERSEDES it once MPI-103 ships — at that point the
"locked while connected / set before connecting / resume keeps original" framing
is no longer true and must be replaced with the editable-any-time copy.

## Carried from MPI-93 — F8 crash-watchdog live verify
Verify on the NEW image (the watchdog is being rebuilt here, so verifying the old
one was moot):
- (a) box-OFF warm-stop (EXITED) path.
- (b) simulated crash/kill (main.js teardown can't run) → wrapper idle-watchdog
  self-stops the Pod after the configured timeout (confirm STOPPED in console).
- (c) NEW: live-update honored — change the timeout on a connected Pod, confirm
  the watchdog fires at the **new** value, no recreate.

## Out of scope
The interim hint stopgap (already shipped). Anything needing a GPU gen to verify
beyond the watchdog itself.
