# MPI-92 — RunPod remote engine: Phase 5 hardening

> Promoted from MPI-64 Phase 5 (plan.md lines 149-151) / OPEN-ITEMS F7. Pre-release hardening. App + docs + tests.

Three parts. Each is independently shippable; group because they're all "make the remote engine release-ready."

## (a) Integration / mocked tests — lifecycle + wrapper error states

Cover the RunPod lifecycle + wrapper failure modes with mocked tests (no live billing):
- bad API key, unavailable GPU, stale manifest, stopped Pod, wrapper-not-ready,
- mid-generation network loss, interrupt, app-quit cleanup.
**Verify:** tests exercise each state with a clear pass/fail (mock RunPod REST/GraphQL + wrapper responses).

## (b) Secret-hygiene end-to-end audit

The RunPod API key + per-Pod wrapper token must NEVER appear in:
- logger output, `logs/app.log`, bug-reporter payloads, any persisted state.
Add redaction where a code path could carry them. `redactSecret` already exists in `routes/runpodRemote.js` —
audit every log/error/bug-report path for leaks; extend redaction as needed.
**Verify:** a grep/runtime sweep over logs + a bug-report payload after a FULL remote session finds zero secret
material (API key + wrapper token).

## (c) Cost / responsibility docs + settings copy

User-facing copy making the cost model explicit:
- RunPod billing, API key, and storage are the USER's responsibility (not Cubric's).
- Stopped Pods still bill network-volume storage.
- Community Cloud is unsupported (Secure Cloud only).
**Verify:** the user sees this in Settings copy and/or docs before connecting.

## Likely files

- (a) `tests/` (mocked RunPod + wrapper); the lifecycle routes in `routes/remoteProxy.js` / `routes/runpodRemote.js`.
- (b) `routes/logger.js`, `routes/runpodRemote.js` (`redactSecret`), the bug-reporter payload builder, `main/secretsStore.js`.
- (c) `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js` copy + a docs page.

## Related

- MPI-64 (epic). This is the release-readiness layer; the epic's final `mpi-end-session` (promote
  current-architecture.md to durable docs/rules/memory) is the closeout that pairs with this.
- Could split into 3 cards if a single owner wants narrower scope; kept as one per user decision 2026-06-15.
