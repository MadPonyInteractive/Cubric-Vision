# MPI-156 Validation

## Phase 1 — externalize start.sh + wrapper.py → R2 (code + infra)

**Status:** code complete, locally + infra verified. Awaits the ONE user-gated
image rebuild (cu128 first) for the live no-rebuild-reload proof.

### Infra (verified this session)
- Bucket `cubric-pod-runtime` created (user, Cloudflare dashboard), public access
  enabled, custom domain `pod.cubric.studio` bound.
- rclone token widened to cover `cubric-pod-runtime` (existing `cubric-r2:`
  remote, no conf change). Write/list/read probed OK; probe object cleaned up.
- Public host live: `https://pod.cubric.studio/...` → HTTP 200, correct bytes
  (verified via verbose single curl; the rclone S3 API read-back matched too).

### Code (mpi-ci repo)
- `cubric-vision-pod/bootstrap.sh` — new image CMD. Curls start.sh + wrapper.py
  (+ manifest) from `$CUBRIC_RUNTIME_URL/$CHANNEL`, validates (non-empty +
  `bash -n` start.sh), falls back to the baked copies on any failure, execs
  start.sh. Unsets `CUBRIC_WRAPPER_VERSION` when a fetched wrapper installs so
  `/health` self-reports the fetched version.
- `cubric-vision-pod/publish-runtime.sh` — rclone push of start.sh + wrapper.py +
  generated manifest.json to the bucket, then public-URL verify.
- `Dockerfile` — COPY bootstrap.sh, chmod, `CMD ["…/bootstrap.sh"]`; baked
  start.sh + wrapper.py kept as fallback; ENV `CUBRIC_RUNTIME_URL`/`_CHANNEL`/
  `_FETCH` defaults.
- Published the current start.sh + wrapper.py + manifest to `stable/` so a fresh
  Pod finds them (start.sh 9921B, wrapper.py 66184B, manifest 277B; manifest
  `start_sha256` matches local).

### Local behavioral test (scratchpad harness, stubbed exec)
| Case | Expected | Result |
|---|---|---|
| fetch OK (real local HTTP) | execs FETCHED start.sh, installs fetched wrapper, version env UNSET | PASS |
| R2 down (unreachable URL) | baked fallback, version env kept | PASS |
| fetched start.sh bad syntax (`bash -n` fails) | keep baked | PASS |
| `CUBRIC_RUNTIME_FETCH=0` | no fetch, baked | PASS |

`bash -n` clean on bootstrap.sh, publish-runtime.sh, start.sh. All three LF
(0 CR). Dockerfile CMD/COPY/ENV coherent.

### Rebuild round 1 (v0.10.2) + curl bug caught (2026-06-27)

- Built v0.10.2 all 3 profiles. cpu ✅ (pull-verify + boot-smoke 200, wrapper 0.2.17)
  — BUT cpu uses a SEPARATE `Dockerfile.cpu` + `start-cpu.sh` (slim download-mode,
  MPI-88); it does NOT use bootstrap.sh, so cpu is NOT a Phase-1 test. cpu/download
  Pod is intentionally NOT externalized (rare edits, not on the rebuild treadmill).
- cu124 + cu128 (GPU, use the edited `Dockerfile`): CMD=bootstrap.sh, runtime ENV
  set (`CUBRIC_RUNTIME_URL=https://pod.cubric.studio/vision`). Verified in-image.
- **BUG CAUGHT (dry-run bootstrap inside the real cu124 image):** fetch FAILED →
  baked fallback, because **the cu124 base (pytorch/pytorch:2.6.0 minimal conda)
  ships NO curl**, and bootstrap fetches with curl. cu128 base HAS curl (works).
  So as-built: cu128 externalize works, cu124 silently ran baked = externalize dead
  on cu124. FIX: add `curl` to the Dockerfile apt line (commit mpi-ci `21bc929`).
  → **cu124 MUST be rebuilt** with the fix. cu128 (already correct) kept as-is, NOT
  rebuilt (would be a 25-min no-op). The committed Dockerfile now has curl for all
  future builds.
- Resilience path PROVEN even in the broken case: no curl → fetch fails → baked
  runtime → Pod still boots + serves. (The whole point of the baked fallback.)

### END-TO-END EXTERNALIZE PROVEN in the real cu128 image (2026-06-27)

Dry-run of bootstrap.sh INSIDE the real `v0.10.2-cu128` image (has curl), against
the real public R2:
- ✅ Fetched manifest + wrapper.py + start.sh from `pod.cubric.studio/vision/stable/`.
- ✅ "installed fetched wrapper.py / start.sh" (NOT baked); version env unset.
- ✅ Post-fetch hashes == published manifest sha256 (start `3dd055f8…`, wrapper `5ed2ae7d…`).

**No-rebuild-reload PROVEN (the Phase-1 win), short of a real Pod:**
- Published a MODIFIED start.sh (unique marker `RELOAD-PROOF-MARKER-XYZ123`) to a
  `_reloadtest` channel on R2.
- Booted the real cu128 image with `CUBRIC_RUNTIME_CHANNEL=_reloadtest`.
- The image fetched the modified start.sh and **the marker is present in the live
  start.sh** — i.e. an R2 edit went live with ZERO image rebuild. Test channel GC'd.

Only the GPU-hardware behaviour (sage probe, real gen) still needs a live Pod —
that's the user-gated live test below.

### Build round COMPLETE — v0.10.2 shipped (2026-06-27)

All 3 profiles built + pushed + pull-verified public:
- cpu (CI), cu124 (LOCAL, rebuilt with curl fix), cu128 (LOCAL).
- cu124 digest `165de073…`, cu128 digest `e194559…`.
- Bootstrap fetch SUCCEEDS in BOTH GPU images (curl now present on both).
- App pin v0.10.2 (`routes/remoteProxy.js`, commit `3a43c20`, RunPod branch).
- mpi-ci commits: `d5bba40` (bootstrap), `21bc929` (curl fix), `7c006fb` (README
  shipped tag). NOT pushed except `d5bba40` (already pushed before the build).
  → `21bc929` + `7c006fb` STILL NEED A PUSH before the image is reproducible from
  the pushed ref (the local cu124 build had the curl fix; CI/future builds need it
  pushed). Push at user go / next mpi-end.

### Phase 2 live test round 1 — `--normalvram` crash CAUGHT + fixed (2026-06-27)

v0.10.3-cu128 (torch 2.8) on a live 5090: boot log showed Phase 1 perfect
(bootstrap fetched start.sh/wrapper.py from R2, sage sm_120 on) — THEN crash-looped:
```
main.py: error: unrecognized arguments: --normalvram
[cubric] internal ComfyUI exited unexpectedly (code 2) — shutting wrapper down
```
ROOT CAUSE: ComfyUI v0.26 + torch 2.8 enables comfy-aimdo, which **REMOVED
`--normalvram`** from cli_args.py (confirmed by grepping cli_args.py in the image:
the vram_group now has `--gpu-only/--highvram/--lowvram/--novram/--cpu` + the new
`--reserve-vram/--disable-dynamic-vram/--enable-dynamic-vram/--fast-disk`; NO
`--normalvram`). `--lowvram` still parses but is a documented NO-OP under aimdo.
aimdo is ON by default unless --highvram/--gpu-only/--novram/--cpu/--disable-dynamic-vram.
This is the MPI-146 reframe landing for real: the per-card lowvram/normalvram split
is MOOT under aimdo.

FIX (R2 push, NO rebuild — Phase 1 payoff):
- start.sh: `VRAM_MODE=""` (empty = no flag = aimdo manages); keeps the VRAM probe
  for logging only. Comment notes torch<2.8 would need --lowvram back.
- wrapper.py: sentinel default — UNSET env → legacy `--lowvram` safe default; env
  SET to "" → drop the flag. `_build_cmd` appends the flag only if non-empty. Never
  passes `--normalvram`. Bumped wrapper 0.2.17 → **0.2.18**.
- Verified in the real v0.10.3-cu128 image: arg-parse ACCEPTS the no-vram cmdline
  (got past argparse, no "unrecognized"; aimdo-init itself needs the live GPU).
- Published to R2 vision/stable (manifest wrapper 0.2.18, start_sha 323ca6b…).
  The existing v0.10.3 image fetches it on next boot — no rebuild.

PENDING: next 5090 Pod (the last one was reclaimed on stop) re-fetches the fixed
start.sh → expect clean boot, ComfyUI cmdline `vram=` EMPTY, aimdo init line, fast
load. THAT is the remaining Phase-2 proof.

### REMOTE COMPLETION-HANG fixed + LIVE-VERIFIED (2026-06-27)

Symptom: on the live 5090 a full gen COMPLETED on the Pod (`Prompt executed in
N seconds`) but the app UI hung on "Generating…". Diagnosed via a WS capture
(scratchpad ws-capture.mjs) + code trace:

ROOT CAUSE (two compounding app-side bugs, NOT torch/aimdo, NOT the other session):
1. ComfyUI v0.26 terminal `execution_success` is `broadcast=False` + NOT replayed
   (wrapper.py:717 docstring). On remote it didn't reach the proxied renderer WS,
   and the WS stayed connected the whole gen → no reconnect → the existing MPI-152
   reconcile (gated on `onopen` reconnect, comfyController.js:648) NEVER fired.
2. `_reconcileFromHistory` fetched `${httpBase()}/history/{id}` — but the Pod does
   NOT expose ComfyUI `/history` (wrapper only has `/wrapper/history/{id}`), so even
   when reconcile DID fire remotely it 404'd + silently gave up (verified `/history`
   → "Not Found").

FIX (comfyController.js, app-side only — no Pod rebuild; `/wrapper/history` already
exists in wrapper 0.2.18):
- `_reconcileFromHistory` uses `/wrapper/history/{id}` when remote, `/history/{id}`
  local.
- Added a 4s safety-poll armed after `executed` outputs arrive (remote only),
  cleared by the live terminal/error path; idempotent via the registered resolver.
- `node --check` clean.

LIVE-VERIFIED on the 5090 (same Pod, after app restart): remote t2v + AUDIO full
gen → UI settles, finished asset shows, no hang. (`/wrapper/history` reconcile
settles within ~4s of the last output.)

NOT yet tested (other agent's lane, now UNBLOCKED): i2v, audio clips, multi-stage
preview→Continue/Finish. Preview-no-audio is a preview-flow concern (final gen has
audio).

### Pending (user-gated) — the live `user-ux` verification
1. ✅ DONE — image rebuilt, bootstrap is the CMD, all tags public.
2. Fresh Pod boots → `[cubric-bootstrap]` fetch lines → `[cubric]` start.sh lines
   → a gen runs (GPU behaviour — needs a real Pod).
3. ✅ PROVEN locally (test channel) — Edit start.sh → publish → fetched live, no
   rebuild. Re-confirm on a real Pod via `POST /wrapper/restart-comfy`.

⚠️ ACTION FOR USER: push mpi-ci `21bc929` + `7c006fb` (the curl fix must be on the
remote so the cu124 image is reproducible). Then live-Pod verify on v0.10.2.

### Gotcha caught
Git-Bash curl on this box (schannel) returns HTTP 000 + writes no file when run
with `-o` in a tight loop against `pod.cubric.studio`, but a single verbose curl
returns 200. Verify public R2 URLs with a single verbose curl or rclone's S3 API
(`rclone cat`/`lsf`), not a looped `curl -o`.

---

## Phase 2 — Option A (broad cu124-tag profile → cu126 guts) LIVE-VERIFIED 2026-06-27

The broad/low-floor profile (4090/Ampere/Hopper, NOT Blackwell) lacked aimdo
because cu124 wheels can't reach torch 2.8. Rebuilt on base
`pytorch:2.6.0-cuda12.6-cudnn9-devel` + `torch 2.8.0+cu126` (Option A). Tag KEY
stays `cu124` (rename to cu126 is a deferred TODO in the Dockerfile); the IMAGE
GUTS are cu126. Shipped as `v0.10.3-cu124`.

### Build (local, this box — GPU profiles are LOCAL-only)
`docker build` → exit 0. In-image verify asserted:
- `[verify] torch 2.8.0+cu126 cuda 12.6`
- `[verify] sage OK` (sageattention compiled for 8.6;8.9)
- `BUILD+PUSH COMPLETE`; `docker manifest inspect …:v0.10.3-cu124` → LIVE/public.

### Live Pod proof — TWO cards, TWO driver tiers, image + video
| Card | arch | Pod driver | host CUDA | aimdo | sage | gen (server) |
|---|---|---|---|---|---|---|
| RTX 4090 | Ada sm_89 | **580.126.20** | 13.0 | ✅ `comfy-aimdo inited for GPU: RTX 4090` + DynamicVRAM enabled | OFF (gated, sm_89, MPI-145) | ✅ t2v+audio `Prompt executed in 132.31s` / `300.89s` |
| RTX A4500 | Ampere sm_86 | **550.127.05** | 12.4 | ✅ `comfy-aimdo inited for GPU: RTX A4500` + DynamicVRAM enabled | **ON** ✅ `sageattention enabled for sm_86` | ✅ SDXL image `Prompt executed in 59.29s` |

Both pulled `v0.10.3-cu124`, boot log shows `[cubric-bootstrap] fetched start.sh/wrapper.py`
(wrapper 0.2.18) from `pod.cubric.studio/vision/stable`, `pytorch version: 2.8.0+cu126`,
`comfy-aimdo version: 0.4.10`, ComfyUI 0.26.0.

### DRIVER-FLOOR PROOF (the whole point of Option A)
The A4500 host ran driver **550.127.05 / CUDA 12.4** and the cu126 image
(`NVIDIA_REQUIRE_CUDA=cuda>=12.6`, with forward-compat carve-outs for
`driver>=470/535/550`) **connected + ran aimdo + completed a gen**. A cu128 image
(`cuda>=12.8`, floor ~r570) would have REFUSED this host. So Option A's lower
floor (~r550/r560 vs r570) is DEMONSTRATED, not just theorized — wider host
coverage = the broad profile's purpose. NOT universal: hosts below the carve-outs
still refuse; "will datacenter X work" is only answerable by trying (RunPod shows
the refusal at create).

### sage on Ampere (bonus)
sm_86 (A4500) runs sage cleanly under real sampling load (image gen completed). The
baked per-arch sage (8.6;8.9) is live for the Ampere half of the fleet; only sm_89
(4090/Ada) is gated to SDPA (MPI-145 LTX-CUDA-crash).

### CONCLUSION
Option A fully proven. BOTH GPU profiles have aimdo. Fast loads (seconds, dynamic
VRAM) confirmed on two arches + two driver tiers. **MPI-156 Phase 2 = DONE.**

### Known SEPARATE bug discovered during these gens (NOT Option A, card-agnostic)
Remote gens COMPLETE server-side (`Prompt executed in Ns`) but the app UI hangs on
"Generating" — the gallery card never settles. Root signal: `[runpod] remote SSE
stream aborted: terminated` fires at a ~128s cadence (idle timeout) on the progress
relay (`routes/remoteProxy.js` `/comfy/events/stream`, a dumb `pipe` with NO
heartbeat). The completion-reconcile (MPI-152 fix 860412e, WS path) is not settling
the card on the SSE-abort path. Reproduced on BOTH 4090 + A4500 → app-side relay,
not hardware. Filed as a new card (see board). Does NOT block MPI-156.

---

## KNOWN FOLLOW-UP (folded into MPI-156, not a new card) — local gen hangs after a remote Pod disconnect, restart clears

Surfaced during the A4500/4090 testing. NOT caused by the v0.10.3 / cu126 work
(ruled out: chronology — local gens worked at 16:34 with the same committed code;
mechanism — our edits are two version strings in remoteProxy.js read ONLY by
podImageForCard + the wrapper-env, zero overlap with the local engine).

### Symptom
Sequence that reproduces: local gens work → connect a Pod → test → disconnect +
DELETE the Pod → try a LOCAL gen → it HANGS (no progress, the gallery card spins).
A full app restart fixes it (local ComfyUI relaunches at restart → gens work).

### Evidence (app.log 2026-06-27)
- Local ComfyUI started at 14:39 / 15:29 / 15:54 / **16:34** (last before the remote
  session), then NOT again until **17:22:47 = the user's restart**.
- The hung local gen attempt (~17:18-17:20) produced ZERO `[comfy]` log lines → the
  local backend generation path was never reached / no live local ComfyUI executed.
- Backend remote-mode DID reset on delete (remoteProxy `/remote/pod/delete-active`
  line ~858 calls `setRemoteMode({active:false})` synchronously — verified).

### Why this is a timing edge, not a one-line bug (each piece looks correct)
1. `remoteProxy.js` delete-active/stop-active → `setRemoteMode({active:false})` ✓
2. `remoteEngineClient.refresh()` reads `/remote/mode` → sets `_active=false` when the
   backend says inactive → `isRemote()` returns false ✓
3. `comfyController._ensureReady`: line ~226 `if (isRemote()) return _ensureRemoteReady`
   ELSE the local path (lines ~278-292) already does "if `!status.running` →
   `/comfy/start` + poll until ready" ✓ — i.e. the lazy local relaunch ALREADY EXISTS.

All three are individually correct, so the wedge is an INTERACTION/ORDER edge: the
renderer's `isRemote()` evidently still returned true (or `refresh()` hadn't synced)
at the moment of the post-delete local gen → it took the REMOTE branch (line 226) →
`_ensureRemoteReady` against the now-deleted Pod → hang, never reaching the local
start at 278. Could NOT be pinned from logs alone (needs the renderer console at
hang-time: what `isRemote()`/`refresh()` returned, and whether refresh ran before
that gen).

### Fix direction (when a Pod is live to repro)
Make the return-to-local self-healing. Cheapest: in `_ensureReady`, if `isRemote()`
is true but the remote-ready check finds no reachable wrapper (Pod gone), force a
`remoteEngineClient.refresh()` and fall through to the local-start path — a gen must
never block on an engine that was just torn down. Confirm whether `refresh()` is
awaited before the post-disconnect gen, and whether the delete path proactively
pushes a `remote:connection {connected:false}` the renderer acts on.

### SEPARATE but related (also folded here): remote progress SSE idle-abort
While a Pod IS connected, the progress relay (`remoteProxy.js /comfy/events/stream`,
a dumb `nodeStream.pipe(res)` with NO heartbeat) idle-aborts at a ~128s cadence
(`[runpod] remote SSE stream aborted: terminated`) during quiet sampling/load
stretches → live progress bar freezes; the gen still completes server-side. Fix:
emit a `:ping` keepalive every ~15-30s in the relay so the idle socket isn't reaped.
This is the "UI hangs on Generating while connected" half, distinct from the
local-after-disconnect wedge above.
