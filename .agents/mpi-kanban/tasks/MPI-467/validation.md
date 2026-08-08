# MPI-467 Validation

## Verified — ran, output seen

**Playbook** — `docs/playbooks/bump-engine/` (README 133 lines + `01-smoke-run.md` 117),
both under the 200-line budget, routed from `docs/README.md` and `docs/playbooks/README.md`.
`docs/versioning.md` § COMFY_VERSION healed: it claimed no playbook existed and pointed at
MPI-457's brief.

**Runner self-check** — `node scripts/smoke-workflows.mjs --self-check` PASSES, with
negative controls that fail on sabotage:

```
self-check OK (Input_Width=128, Input_Steps=1, Input_Frames=5)
```

Asserts: 1024→128 snaps to a legal multiple; steps→1; a 4n+1 frame count (121) stays 4n+1
(→5) instead of becoming an illegal value; the minimizer does NOT touch a branch selector
(`Input_wf_type`) and never rewrites a link tuple; `injectByTitle` returns **false** on an
unmatched title (silent-skip is the documented add-model trap).

**Plan pass** — `--plan` resolves the live registry with zero spend:

```
models 11 · ops 34 · weights 279.5 GB · volume 320 GB
budget: 1 step · 128px target · 1 frame(s) · seed 42
```

Dedupe by `class_type` set collapses SDXL 5→1, Chroma 2→1, Boogu 2→1, LTX 2→1, Krea2 2→1.
Names the 8 weights it does not load. Ops (34) > files (12) because `klein-4b` alone drives
7 branches through one graph.

**Release gate** — `scripts/release-health-check.mjs` `checkSmokeEvidence()`, wired into
`npm run release:check`. **Fires on master's real state today**, not a synthetic case:

```
Engine pin moved 0.29.2 -> 0.30.0 since v1.3.0. No dev_configs/smoke-evidence.json
```

All four branches proven by probe files (each written, run, then removed):

| evidence | result |
|---|---|
| version matches pin, 0 fails, fresh | **passes** |
| produced against 0.29.2, 2 fails | fails, both reasons reported |
| right version, timestamp older than the pin change | fails as STALE |
| absent | fails |

The stale branch matters most: a green file from a *previous* bump carrying the right
version would otherwise pass every other check.

## NOT verified — say so plainly

- **Live GPU survey did not run.** The app was not up on `:3000` (`HTTP=000`), so
  `/runpod/gpu-availability` was never probed. The GPU-ordering code path
  (L4 → RTX 3090 → RTX 4090) is therefore **unexercised**.
- **The whole live half is unproven**: volume create, CPU-Pod install, the version assert,
  and every `runOp` dispatch. Structured against the real routes, never executed.
- Phase 5 (the proving run) is scheduled with the user — ~281 GB fill plus a GPU hour.

## Suite state — GREEN (478/478)

Mid-session this read 476/478. Both failures were a peer session's uncommitted work, not
this card's — this card touched no `js/` or `routes/` file at all — and both are now
resolved by their `8cde2e9c` (MPI-470, Wan t2v deprecation):

1. `uninstall-guards.test.cjs` — needed an op-grouped model with ≥2 ops. `wan-22` was the
   only one and lost `t2v_ms`. Fixed properly by them: the test now takes the real card and
   re-adds the lost op group as an explicit synthetic fixture, with a comment saying why
   (the guard is what must not regress, and the next multi-op model must find it working).
2. `lane-settle-on-bail.test.cjs` — their `commandExecutor.js` diff had removed the
   `_prepareWorkflowInputs` try/catch and with it a `_failBail(err)` call. Resolved; the
   file carries 11 `_failBail` references again.

Recorded because it shaped this card's numbers: the Wan deprecation is now **committed**,
so the 279.5 GB / 34-op figure above is measured against committed code, not a dirty tree.


---

# Third pass — read the GPU leg again, 2026-08-08 (no spend)

Nothing rented. Both findings are in code the GPU leg would have run within a minute of
the Pod coming up.

## 1. The runner could not produce evidence the release gate would accept

`assertPodEngineVersion` read `status.comfyVersion || status.version` from
`/remote/comfy/status`. **Neither field exists.** The route
(`routes/remotePodLifecycle.js:609`) answers:

```
{ running, ready, comfyReady, wrapperVersion, connecting, connectElapsedMs, noGpu }
```

and the wrapper's own `/health` adds only `wrapper_version` — there is no ComfyUI version
anywhere on that path. So `got` was always `''`, the `die()` on mismatch was unreachable,
and the run wrote `engine: { want, got: null, proven: false }`.

`scripts/release-health-check.mjs` § `checkSmokeEvidence` then rejects that file:

```js
const ran = String(evidence?.engine?.got || '').replace(/^v/, '');
if (!ran) fail(`... cannot prove WHAT was smoked (playbook gate 7).`)
```

**Deadlock.** The one file that unblocks 1.4 could not be produced by the run that exists
to produce it — and only after a full GPU matrix had been paid for.

**Fix.** `manifest.comfyui_ref` is the only place a Pod records the ComfyUI its image was
built from (`_stamp_manifest_provenance`, from the `CUBRIC_COMFYUI_REF` build arg; the CI
workflow feeds it at `cubric-vision-pod-image.yml:150`). Nothing app-side exposed the
manifest — `_evaluatePodHealth` caches the *verdict*, never the body — so a passthrough
route was added. Missing `comfyui_ref` now aborts instead of spending;
`--allow-unproven-engine` covers the honest case (an image baked before the build arg,
smoked when the pin has not moved, where evidence is not gated at all).

## 2. Every post-create failure still leaked the rented Pod

`die` is `process.exit(1)` and deletes nothing. `createPodWithRetry` (eb89f59f) fixed the
**create**; downstream was untouched — an engine mismatch, a failed probe upload, a 502
from any `app()` call, any throw reaching `main().catch`. `abort()` deletes the live Pod
and then exits; every post-create exit goes through it, and `_podLive` is cleared by the
explicit deletes so it never chases a Pod that is already gone.

Deleting is also the safe direction mid-fill: it is cancelling **with** a Pod attached that
destroys partials on the volume, never the delete itself.

## What is proven, and what is not

```
GET /remote/pod/manifest -> 409 {"error":"remote_inactive"}     # _guard fires, route registered
GET /remote/pod/nope     -> 404                                  # no over-broad matching
node scripts/smoke-workflows.mjs --self-check -> OK
```

**Not proven:** the manifest body from a real Pod. The route lives in `routes/`, so it is
**inert until the app restarts** — the same condition MPI-481's committed fix is waiting on.
First GPU Pod of the next run is where both get their live check.


---

# THE GPU LEG EXECUTED — first time ever, 2026-08-08

Pod `gpfaz5y3n7ymku`, L4, EU-RO-1, volume `aghcuvg7nl`. Fill first via the new
`--install-only` (12 models, ~8 min, CPU Pod deleted automatically), then the matrix.

**PASS 25 · SKIP 0 · FAIL 10** of 35 ops. `dev_configs/smoke-evidence.json` written with
`engine: {want: 0.30.0, got: 0.30.0, proven: true}` — gate 7 fired for the first time and
proved the Pod image was built from the pinned engine.

## The ten failures are TWO causes, and only one is the product

### Real (6) — the MpiNodes pin predates a node the workflows use

`node_lock.json` pinned ComfyUI-MpiNodes at `a6e5d5e0` (2026-08-06 **06:37Z**).
`MpiStageLatents` landed in `da23e911` at **22:53Z the same day** — sixteen hours later —
and five shipped workflows already use it (node 568, titled `Input_Video_Latent`).
`MpiH3References` is missing the same way. The Pod installs MpiNodes at the pin, so ComfyUI
had no such class and every multi-stage video op died on `missing_node_type`:

`wan-22/i2v_ms`, `ltx-23-balanced/t2v_ms`, `ltx-23-balanced/i2v_ms`, `minimax-h3/t2v_ms`,
`minimax-h3/i2v_ms`, `minimax-h3-ref2va/ref2v_ms`.

User-facing — H3 video is a headline 1.4 feature. **Fixed:** pin bumped to `43a976fd` in
BOTH locks (`0851f2bb` here, `012902b` in mpi-ci). Code-only node, so it reinstalls to the
volume at connect with no image rebuild.

`checkPodLock` cannot catch this: it proves the two locks AGREE, and they agreed perfectly
while both were stale. **Gate 8** now checks a different thing — every `Mpi*` class_type in
the smoke set against `__init__.py` at the pinned commit. It reproduces all six offline, for
free, on `--plan`.

### Harness (4) — the runner skipped the app's own separator heal

`chroma-hyper/t2i`, `krea2-nsfw/t2i`, `klein-4b/t2i`, `wan22-5b/t2v` failed on baked Windows
separators (75 such values across 14 workflows). `comfyController` § 3b heals those for any
engine whose enum uses `/`, covering `lora_name` AND `lora_1..lora_5` — but the runner POSTs
to `/proxy/prompt` and never passed through it. It was testing a path no user takes.
Mirrored into `prepOp`, with a 5-way self-check that is mutation-verified.

**Why this was not obvious:** ComfyUI validates PER OUTPUT NODE. Where a bad value fed the
only output, the op produced no media and FAILED; elsewhere that output was dropped and a
sibling still rendered, so the op **PASSED with its style LoRAs silently absent**.

## Still open

- **Re-run for clean evidence.** `release:check` gates on `counts.fail > 0`, so the current
  file still blocks 1.4. Expect the 4 harness ops to pass (heal is unit-proven); the 6 node
  ops depend on the wrapper noticing commit drift and reinstalling MpiNodes at the new pin
  **at connect** — documented in `start.sh` but not yet watched happening. If they fail
  identically, the drift path is the problem, not the pin.
- **MPI-491 owes a number:** the GPU-image `_download_hf` rate on `controlnet-union-flux`
  (3.99GB, the only HF dep left uninstalled), sampled every 15s.
