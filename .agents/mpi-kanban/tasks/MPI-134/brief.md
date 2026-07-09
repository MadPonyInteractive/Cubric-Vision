# MPI-134 — Auto-retry never engaged on "does not have the resources" refusal

## Symptom
Auto-retry ON + Connect a scarce RTX 5090 (Any-region) → "Could not connect to a Pod." toast, **no retry**. Button stayed "Connect", no Cancel, no background wait.

## Root cause (ground-truthed in logs/app.log L2014–2046)
RunPod refuses a scarce-card create with:
```
create pod: This machine does not have the resources to deploy your pod. Please try a different machine
```
The out-of-stock classifier `/not enough|unavailable|no .*available|out of stock|insufficient/i` did **not** match this wording → the create-refusal branch treated it as a hard failure → dead-end toast instead of handing off to the auto-retry wait. Same narrow regex existed in **two** places (Settings connect + boot auto-connect loop), so neither path retried.

The retry machinery was otherwise correct: classify-as-stock-out → Settings `_handoffToWait` → shell `_startGpuWait` → on free `_initRemoteBoot` create → re-wait on each refusal with the 15s backoff.

## Fix
Shared `_isStockRefusal(msg)` in both `js/shell.js` and `MpiSettings.js`, broadened to also match: `does not have the resources`, `no longer any instances`, `try a different machine`, `no instances available`. Replaced both inline regex copies. Real failures (auth/offline/config/500) deliberately don't match so they still surface.

## Verification
- Regex self-check: 7 retryable (incl. exact log string) PASS, 5 non-retryable PASS.
- `tests/runpod-remote-hardening.test.cjs` 16/16 pass.
- eslint clean on both files.
- **Owed:** live RunPod verify — auto-retry on, Connect scarce 5090 on Any-region, confirm button→Cancel + background wait + eventual connect. (User confirmed ~5 *manual* `__any__` retries land a 5090, so the loop should do this hands-free.)

## Out of scope → MPI-135
- Any-region auto-placement loses scarce cards more than a targeted DC (EU-RO-1 won instantly vs 7× `__any__` refusals) — possible DC-steering optimization.
- Volume-backed connect phase/% display lag ("creating" never → "connecting", late 32% jump).
