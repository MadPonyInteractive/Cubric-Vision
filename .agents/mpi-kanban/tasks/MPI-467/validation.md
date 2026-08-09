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

---

# The runner ran every tiered model at its SLOWEST setting (2026-08-08, during the second matrix)

Spotted by the user watching a live Krea2 op. `krea2-nsfw/control` took **187s** against 4-38s
for comparable SDXL ops.

**Root cause, and it is two facts together.** The shipped graph BAKES the slow value -
`krea2_t2i_nsfw.json` node 617 `Input_is_Turbo` is `false`, while the app's own
`promptControlDefaults.js` sets `krea2Turbo: true` ("fast is the better first impression").
The runner injects no PromptBox control, so it runs the bake. AND those graphs carry **no
`Input_Steps` node at all**, so the 1-step budget cannot compensate - Krea2's step counts
live inside the sampler chains that `Input_is_Turbo` selects between (OFF = 25 steps @ cfg
3.5 + a 3-step pass; ON = 8 steps + the same pass). The evidence file shows this plainly: every
Krea2 row's `budget` array is `Input_Seed`/`Input_Width`/`Input_Height` only.

**The fix is capability-gated, and a title-only rule would have been WRONG.** Two shipped
graphs carry these titles for a different purpose:

- `klein_t2i.json` carries `Input_is_Turbo`, but `klein-4b` declares `turboToggle: false` -
  its base+turbo pair was dropped 2026-07-27.
- `chroma_t2i.json` / `chroma_hyper_t2i.json` carry `Input_Tier`, where the value selects
  **Flash vs Hyper bake**, not speed.

So `applyFastTier(graph, model)` reads `model.capabilities` and injects only what the model
declares: `turboToggle` -> `Input_is_Turbo = true`, `tierSelect` -> `Input_Tier = 3`
(1=Quality, 2=Turbo, 3=Hyper). It RETURNS what it applied, and a declared capability whose
node is missing reports `ABSENT` rather than skipping silently - the add-model trap.

**Qwen was already fine and is worth recording:** `qwen_edit.json` bakes `Input_Tier = 3`
(Hyper), which is FASTER than the app's own default of 1 (Quality). The bake and the app
default disagree in opposite directions on the two models - which is exactly why this is
gated per model rather than assumed.

**Verified:**

```
self-check OK (Input_Width=128, Input_Steps=1, Input_Frames=5)
```

Four new assertions, then mutation-tested - removing the capability gate fails the right one:

```
self-check FAILED: a model that does NOT declare the capability is left alone (klein/chroma carry these titles)
```

Restored from a `cp` backup, green again. **Not applied to the run in flight** - node had
already loaded the script, so this takes effect on the NEXT matrix, which is what was asked.

---

# minimax-h3/t2v_ms — CLOSED. It PASSES. There was never a t2v defect. (2026-08-09)

```
minimax-h3/t2v_ms: graph 56 nodes, budget Input_Width=128, Input_Height=128, Input_seed=42
prompt_id e7281ce0-1e64-4823-a13b-19561c5ab815   node_errors {}
PASS 216s  media=1
```

Dispatched onto a live L4 through the runner's **own `prepOp`**, so it built the exact graph a
matrix builds rather than a lookalike. Against its sibling `i2v_ms` at 260s. `minimax-h3` is now
**2-for-2**, and all three H3 ops pass (`ref2v_ms` 213s, a different model and graph, never
implicated).

## The diagnosis, reached OFFLINE before any GPU was involved

**A ComfyUI crash cannot be survived on this Pod, so it never crashed.** `ComfyManager._supervise()`
answers any unexpected exit with `os._exit(1)`, and `start.sh` ends in `exec python -m uvicorn`
with no respawn loop — its own comment says "when the wrapper exits, this script falls through,
and the container comes down". Six ops passed on that Pod after 19:55Z, `i2v_ms` among them.
**So the OOM / segfault / CUDA-abort family is excluded by construction**, not merely withdrawn.

**Therefore the restart was REQUESTED.** Only `ComfyManager.restart()` respawns ComfyUI while the
Pod lives, and it is reachable only via `POST /wrapper/restart-comfy`.

**Two callers eliminated from `app.log`:** `ensureUniversalNodesOnVolume` only restarts when it
*installed* a pack, and the log reads `universal nodes: 7/7 already on volume` at 19:16:50Z;
`Model cache reseeded via /object_info (no restart needed)` is a model-list refresh and says so.

**The user then reproduced the real trigger live** (2026-08-09): staging a model fired
`Loading new nodes — restarting the remote engine…`. Chain, all hops read →
SSE `comfy:needs-restart {remote:true}` → `downloadService.js:724` sets
`state.remoteComfyNeedsRestart` → `comfyController.js:543` restarts on the next dispatch.
**That gate never checks the queue**, so `proc.terminate()` can land mid-sample. The runner POSTs
straight to `/proxy/prompt` and never passes through the gate, so its prompt was destroyed with no
signal. **Carded as MPI-501.**

**And there is no t2v-specific defect to find.** All four candidates traced and cleared:
`MpiIfElse` is genuinely lazy (`"lazy": True` + `check_lazy_status`), so only node 133 runs;
`MpiMath`'s `'10 if a else 5'` is supported (`safe_math` handles `ast.IfExp`) — no silent fallback
to 0; `PackedLayout(keyframes=None, refs=None, frame_count=None)` takes clean guards, the
`frame_count is not None` test living *inside* `if keyframes:`; and the work is identical to i2v —
`BasicScheduler` steps=20 with `SplitSigmas` at 10 (t2v) vs 5 (i2v), so 10+10 against 5+15.

**t2v and i2v are the same file** (`minimax_h3_fl2va.json`), routed by `MpiAnyChecker` on whether
`Input_Start_Frame` is empty. So it was 0-for-2 for two unrelated reasons — a stale MpiNodes pin,
then a restart landing on it — and never for a reason of its own.

## No diagnostic record existed, and that was the real defect

`app.log` ended 19:16:50Z; the repo's `logs/app.log` ended ~18:48Z; the matrix ran to 20:23:40Z.
Over an hour of rented GPU with no app-side line — expected, since a successful proxy hop logs
nothing. `log()` was bare `console.log`, so the transcript died with the terminal, and the wrapper
mirrors ComfyUI stdout to the **Pod** console only, which teardown deletes. Fixed: the runner now
tees an ISO-stamped transcript to `dev_configs/smoke-run.log`. It earned itself within the hour —
it is the only reason the accidental run below could be reconstructed in seconds.

## Shipped in the runner

- **Orphan detection.** A prompt absent from history **and** from the queue is gone, not slow.
  Now fails in ~30s naming the mechanism instead of burning 15 minutes to report `timed out`.
  Guarded against both false positives: a 30s grace covers submit→queue, an unreadable queue
  returns "keep waiting", and history is re-read *after* the queue so an op that finishes between
  the two reads is not failed.
- **Gate 9 — required inputs.** Sweeps **all 34** shipped graphs (not the smoke set) and diffs
  every `Mpi*` node against a live engine's `required` map, refusing to answer unless the local
  MpiNodes checkout matches the `node_lock` pin. Never parses source — MPI-498's trap is that
  ~120 first-party nodes build `INPUT_TYPES` programmatically, so an AST read silently reports
  0 holes for most of them. When no engine answers it prints `NOT CHECKED` and never claims green.

  **Proven red, not just green.** Replayed against `06cf70d4~1` it flags exactly MPI-498's six
  nodes — `nvidia_pid` 1609/1618/1619/1623 and `flow_sdxl_4k` 1603/1615 — and 0 against the
  working tree. Independent confirmation of their fix. Three guards mutation-verified; the
  whole-directory sweep matters because the smoke set would have caught only 4 of the 6 (no
  `flow_*.json` is reachable by any matrix).

- **`main()` no longer runs on import.** `import`ing this module used to execute a **live matrix**:
  measured 2026-08-09, importing it to reuse one pure helper created a CPU download Pod, ran the
  whole install leg, deleted that Pod, and created an **L4** before a 2-minute timeout killed it
  mid-create — real money, an untracked Pod, and it displaced the podId the app was tracking.
  The file already carried inline `export`s, so it was always meant to be importable. Now guarded
  by `INVOKED_DIRECTLY`; verified inert (import returns in 7ms). That fix is what made the h3
  test above possible without renting anything.

## Still owed on this card

One **full** matrix for clean evidence (`release:check` refuses `counts.fail > 0`). It must wait
for the **PiD crop fix**, or the run just re-records a broken PiD. A `--models` run is not a
shortcut — it overwrites `smoke-evidence.json` and discards the other passes. Turn **Stage all
models on connect** back ON first; the second matrix ran entirely on cold volume reads.

## A second, independent defect in nvidia_pid — the output is CROPPED

Found by the user the moment MPI-498's fix let PiD produce real output at all. `t2i_013`
896×1088 → `pid_005` 832×1024, with heads cut off. The arithmetic reproduces it exactly:

```
1609 MpiScaledDimensions  size=1024 side=use_max   on the 896×1088 source
     scale = 1024/1088 = 0.9412  →  843 × 1024
1624 MpiCrop  image←1626:0 (ORIGINAL)  width←1609:0  height←1609:1  divisible_by=16
     CROPS 896×1088 → 843→832 × 1024        = pid_005, exactly
```

**The wiring is the bug, not the node.** `MpiCrop` is fed a *scaled* size and crops to it,
discarding 64 px each way. Its `divisible_by=16` + `position=center` job is to make dimensions
VAE-safe for the four downstream `VAEEncode` nodes (1578/1590/1596/1602); with the *original*
dims it would crop nothing (896/16=56, 1088/16=68).

**Fix is one wire:** `MpiCrop.image` from `1626:0` → `1609:3` (`scaled_image`, which
`common_upscale`s with `"disabled"` crop mode — `img.py:258-279`). Then 1609 resizes properly and
`MpiCrop` trims 843→832 purely for divisibility. Blast radius checked: 1609's only consumers are
those two width/height links, and `Input_Image` feeds only 1609 and 1624.

Rejected alternative: swapping both nodes for `Scale Image to Max Dimension`. It matches the
longest-edge semantic and does fix the crop, but it has no divisibility control — 843 is not a
multiple of 16 or even 8, so the `VAEEncode`s would do the trim themselves, silently and
off-centre. `Scale Image to Total Pixels` keeps divisibility (`resolution_steps 16`) but sizes by
megapixels, breaking the 1K/2K/4K longest-edge contract that 1618/1619/1623 all follow.

Re-export through `sync-raw-workflows.mjs`, never by hand — hand-editing is how MPI-498 shipped
(`ab9caa71` patched the API JSON directly and skipped the converter's own required-input
self-check). Gate 9 re-verifies for free on `--plan` afterwards.
