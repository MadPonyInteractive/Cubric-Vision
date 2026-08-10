# Download Manager

Resumable model-download system (frontend + backend IPC + SSE). Split out of
[comfy.md](comfy.md) (MPI-170). For remote/Pod download behaviour and the
silent-stall belt, see [runpod-troubleshooting.md](runpod-troubleshooting.md).

## Architecture Overview

The download manager is a **frontend + backend IPC system** with **resumable downloads**. Communication flows:

```
js/services/downloadService.js  ←→  REST/POST  →  routes/downloadManager.js
       ↑ SSE /comfy/downloads/stream  ←  SSE broadcast ←┘
       ↓ Events.emit(...)
   Components subscribe
```

The backend uses `node-downloader-helper` under the hood. NDH writes directly to the final filename, so Cubric creates `<file>.cubricdl` sidecars while managed downloads are in progress. Installed-state checks require `exists && no sidecar`, which prevents a killed partial model from being treated as installed.

## The install store — the SOT (MPI-276)

`routes/install/installStore.js` is the single source of truth for the
install/download lifecycle (the MPI-208 `generationStore` medicine, applied to
downloads). Pure — no fs/express/NDH, all I/O injected — so it is unit-tested
(`tests/install-store.test.cjs`). It holds `ModelJob`/`DepJob` records with an
explicit **legal-transition table**: `transition(job, to, reason)` REJECTS +
logs illegal moves (e.g. `cancelled→done`), so a wedged or resurrected job is
impossible by construction. A monotonic `version` bumps on every mutation.

- **No `refCount` anywhere (G5).** The field was DELETED in MPI-276 — it leaked
  upward (a successful install never decremented it) and lied. "Is this dep
  still needed / in-flight" is answered from job STATUS: `store.activeModelsForDep(depId)`
  (non-terminal model jobs referencing the dep). **Never reintroduce refCount;
  never gate on `refCount === 0`.**
- **Snapshot protocol (G9).** `store.snapshot()` = `{version, jobs[]}`. Broadcast
  as `download:snapshot` on SSE connect + after every reconcile pass. The FE
  REPLACES `state.downloadJobs` wholesale, version-gated (deltas apply only if
  `version ≥` last seen).
- **Prune (G10).** `done` jobs stay (card stays busy — no Install-flash, MPI-241)
  until a resync confirms install, then prune (belt: 120s TTL). `failed`/`cancelled`
  prune on a 30s TTL.

**Reconciler — `routes/install/reconciler.js` (G11).** One pass, both engines,
driven from disk/volume truth (`localModelsCheck` / wrapper `/models/status`):
settles wedged deps (all bytes in + truth says installed → force terminal via
legal transitions), FAILS orphans (no progress, nothing on disk, >60s grace),
NEVER resurrects terminals, then prunes + broadcasts the snapshot. Runs on SSE
connect, a 15s poll while any job is non-terminal, and after uninstall. Tests:
`tests/install-reconciler.test.cjs`.

> **Shadow-SOT caveat (as of MPI-276 Phase 4).** The store drives the
> `download:snapshot` BROADCAST (the FE mirror consumes it, progress-complete via
> `store.syncProgress`). The PULL endpoints (`/downloads/status`, `/active`,
> `_serializeModelJob`) are still MAP-backed, and the runtime maps
> (`_modelJobs`/`_depJobs`) stay write-authoritative + carry transport detail
> (url/localPath/sha256/pipPins). The old remote stall-watchdog still reads the
> maps. The full read-flip (delete map status-writes, flip pull reads onto
> `store.snapshot()`, retire the watchdog into the reconciler) is **MPI-320**,
> done with the G6 adapter split.
>
> **Resume divergence guards (MPI-317 F4/F5, die with MPI-320).** A RESUMED
> download breaks the map↔store lockstep: `download()` presets
> `depJob.downloadedBytes` and the reconciler settles + prunes the store job
> from disk truth while the map walk is still in its custom-node tail. Two
> guards hold the shadow stage together until the flip: (1) `_setModelStatus`
> skips STORE writes once the store job is terminal — the map keeps driving its
> real trailing work (node re-verify + the model-level `download:complete`
> broadcast) without earning rejected-transition warns; (2) the FE snapshot
> keep-set (`downloadService.js`) preserves client jobs in `installing` exactly
> like `downloading`, so a reconciler prune can't strand the completion toast
> with no job to anchor on. Known benign residue: the DEP-level twin of (1) —
> cancel pushes `cancelled` onto already-complete store deps (3 warn lines per
> cancel); left for MPI-320. Guard test:
> `tests/download-completion.test.cjs` `testMapWalkDoesNotFightSettledStore`.

## Frontend — `js/services/downloadService.js`
Singleton that owns the frontend download mirror (MPI-276: a mirror of the
store snapshot, not an independent queue).

- `start(modelId, dependencies)`: the **licence chokepoint** (MPI-451), then `_start`
  — see § The licence gate below. Everything described next is `_start`.
- `_start(modelId, dependencies)`: creates an optimistic client-only **`pending`**
  job ("Starting…", indeterminate) then POSTs. `pending` is a CLIENT-ONLY state
  (G2) — never in the backend store. `_armPendingRevert` arms a 10s timer: if no
  backend ack lands, it drops the job + emits `download:cancelled` + a
  `ui:warning` TOAST ("Install didn't start — try again"). Register-before-respond
  (G8) means `POST /download/start` returns the job snapshot, which `_firePost`
  adopts (→ `downloading`, clears the revert). Which channel a failure surfaces through is [toasts.md](toasts.md) § Choosing the channel.
- `cancel(modelId)`: stop an active download (cancel-only — `pause`/`resume` were removed, MPI-258 Bug 2). Idempotent client-side: a second press or a settled card skips the POST.
- `uninstall(modelId, dependencies)`: Remove model files via backend.

> **MPI-276 deleted the MPI-241 patch cluster.** Register-before-respond (G8)
> structurally kills the SSE-open race, so the `/status`-fetch merge heuristic,
> `orphanedActive` re-injection, and the `_recentlyCancelled` guard are GONE. The
> snapshot replaces `state.downloadJobs` wholesale; do NOT reintroduce a merge.

> **Operation-selectable models (MPI-122).** `dependencies` here is ALWAYS a
> resolved, flat dep array. For operation-keyed models (e.g. Wan 2.2) the
> renderer runs `resolveDeps(model, selectedOps)` at the call site — install uses
> the user's op selection, whole-model uninstall and install-status checks use
> `resolveFullUniverse(model)`. The download lifecycle (jobs, SSE, refcounts,
> `.cubricdl` markers) is unchanged and never learns about operations; jobs stay
> keyed by `modelId`. Backend shared-dep protection resolves every other model's
> full universe so a common/op-specific dep another model needs is never deleted.

### Shared-dep uninstall guard — resolve installed-state from DISK, not `MODELS[].installed` (MPI-216)

`MODELS[].installed` is a **renderer-only** flag, set at runtime by
`syncModelInstalled()`. It is **NEVER defined in the backend (Node) process** —
every `m.installed` reads `undefined` there. So any backend guard filtering on
`m.installed === true` matches nothing and protects nothing.

Both engines resolve "is another model still using this dep" from the actual
store, never the dead flag:

- **Remote** (`_remoteSharedDepIds`, MPI-122): asks the Pod volume via
  `remoteModelsCheck`. Aborts the uninstall if the volume can't be verified.
- **Local** (`_localSharedDepsMap`, MPI-216): stats local disk via
  `comfy.js`'s exported `localModelsCheck` (same custom-root + default-root +
  recursive-search + completeness logic as `/comfy/models/check`). Computed once
  before the delete loop; fail-safe **aborts** (`500 shared-dep-check-failed`) if
  the check throws. Plus any dep held by a live in-flight job (`_inFlightDepIds`,
  store SOT — MPI-276).

**"Is this model installed?" is answered from its EXCLUSIVE deps (MPI-310).**
A model protects every dep it *declares*, and it counts as installed when any dep
that **no other model declares** is on disk. Both earlier rules conflated shared
and exclusive evidence, and each was circular in an opposite direction:

| Rule | Circularity | Damage |
|---|---|---|
| per-dep on-disk (pre-MPI-258) | a shared file counted as proof for *every* model declaring it, so a tier family protected the same idle copy from both sides while neither was installed | ~19GB undeletable (MPI-258 B1) |
| `fullyInstalled` (MPI-258/276) | a shared **common** dep is itself an input to the gate, so the instant it went missing every model needing it stopped defending it | 5.24GB destroyed (MPI-310) |

Exclusive deps break both cycles: a dep no one else declares cannot be another
model's footprint, and it can never be the shared file under judgement — so the
answer no longer depends on the file being protected. An absent-transformer tier
has no exclusive footprint → protects nothing → still deletable. A model whose
shared encoder was deleted still has its own transformer → still defends what it
declares. Models with no exclusive deps at all fall back to any-footprint.

> **Exclusivity MUST be computed over the whole registry** (`_multiModelDepIds`),
> never over the guard's `others` list — `others` omits the uninstall target, which
> makes its shared deps look exclusive to the sibling that also declares them. That
> is precisely the LTX-2.3 High/Balanced pair from MPI-258 B1; scoping it wrong
> reintroduces the stranding. This is **invariant 5** in
> `.agents/mpi-kanban/tasks/MPI-276/research/04-bug-history-invariants.md` — read
> that dossier before touching either guard.

> **Live incident:** uninstalling the image-describer plugin deleted the 5.24GB
> `qwen3vl_4b_abliterated_fp8_scaled.safetensors` that four Krea2 cards declared
> and one had fully installed. The dialog's *"shared files will be kept"* was a
> lie. Two compounding causes: (1) the running server's `createRequire` cache held
> a `models.js` from before the cards were moved onto that weight — **dep-graph
> edits are not live until the server process restarts; a Ctrl+R renderer reload
> does NOT clear it**; and (2) even on fresh data the circular gate above meant
> the weight stopped protecting itself once absent. Guard:
> `tests/shared-dep-uninstall-direction.test.cjs`.

`installedOps` still narrows *which* ops' deps get protected; a damaged model with
no complete op falls back to its full universe (the conservative direction).

**Test both directions AND both circularities.** `tests/plugin-dep-gc.test.cjs`
covers plugin deps during a MODEL uninstall; `tests/shared-dep-uninstall-direction.test.cjs`
covers model deps during a PLUGIN uninstall (the direction that had never run
before it broke) **and** pins the MPI-258 B1 tier-family case so a future fix
cannot swing back to over-protection. Any change here must keep both green — they
fail in opposite directions, which is the point.

The old local `_findOtherModelsUsingDep` filtered on `m.installed` → always `[]`
→ uninstalling one LTX-2.3 tier deleted the Gemma/VAE/LoRAs the other tier
shares. **Trap:** the remote path was fixed (MPI-122) and the local twin was
forgotten. This repo repeatedly fixes one engine path and not its twin (also
MPI-164, the `allBytesDone` "Verifying…" gate — fixed remote, ported to local
only at MPI-216). **On any shared-dep / install / engine-split change, check
BOTH the local and remote paths.**

## The orphan sweep — the guard keeps files; something must also collect them (MPI-462)

The guard above is correct and still strands weights. Keeping a shared dep because a
sibling defends it is right *at that instant*; nothing re-asks later. When the defending
sibling stops being installed by any path that is not a route uninstall (a cancelled
install, a manual delete), the dep is owned by no model and offered to no uninstall —
a not-installed card shows **Install**, never Uninstall. Shipped copy already promises
*"uninstalling a model now always removes its weights, while files shared with other
installed models are kept"*, so a permanently-stranded weight is a broken promise, not
a missing feature.

Measured twice: MPI-314 stranded 18.62GB of LTX-2.3 deps (hand-reclaimed 2026-07-19,
closed as "a one-time fossil, not a live leak"), then MPI-462 stranded 15.91GB from a
different family 19 days later — a 10.59GB Boogu text encoder plus the Chroma ControlNet
and style LoRAs.

`_sweepOrphanedDeps` runs at the end of the LOCAL uninstall route, gated on
`deleteFiles`, never fatal (the uninstall already succeeded). Its orphan test is
**`_localSharedDepsMap(null)` — the same guard with nothing excluded**, which already
unions every installed model's deps, live install jobs, flow deps and plugin deps. On
disk and absent from that map = wanted by nobody. Deliberately not a second notion of
"orphan": one wrong answer here deletes user weights, which is exactly how MPI-310
destroyed 5.24GB.

It refuses, and `tests/orphan-sweep.test.cjs` pins each refusal:

- **`custom_nodes`** — work-not-bytes. (The dev machine used to junction
  `custom_nodes/ComfyUI-MpiNodes` straight at the live node source repo, where a sweep
  would have destroyed it; that link was removed 2026-08-08, the exclusion stands anyway.)
- **`targetPath` weights** — engine-anchored, outside the models root.
- **universal workflow deps**, and anything resolving outside the managed models root.

Log line gains `swept N orphaned`. **`swept 0` is the expected result on a healthy
disk** — a sweep proving it declines is as valid as one that collects; never manufacture
an orphan to watch it fire.

### The REMOTE twin — `_sweepOrphanedDepsRemote` (MPI-464)

MPI-462 shipped the collector on the local route only; the remote branch returned before
it, so a Pod volume stranded the same weights — and the volume PERSISTS across Pod
restarts, so the user keeps paying for the disk. Closed in MPI-464 with the *same*
primitive, not a parallel one:

- Protection map = **`_remoteSharedDepIds(null)`**. It already accepts a null exclusion
  through the identical path the local twin uses (`MODELS.filter`, `_inFlightDepIds(null)`,
  `_pluginRequiredDepIds(null)`) — no change was needed there.
- Classification = **`_orphanedDepIds` unchanged**. It only calls `.has`, which the remote
  guard's `Set` answers exactly like the local guard's `Map`, so both engines classify
  through one function and inherit its refusals (custom_nodes, `targetPath`, universal).
- Inventory — the one piece with **no local analogue**, since there is no `fs.pathExists`
  for the volume. It needs **no new wrapper endpoint**: `remoteModelsCheck` accepts a
  pseudo-model (`{ id: '__sweep__', deps }`), the same trick
  `_reconcileOutstandingRemoteDeps` already uses to ask about a bare dep list. Only deps
  it reports `installed` are offered to `remoteUninstallDep`.
- One extra refusal the local sweep does not need: **`bakedOnPod`**. Those engineAssets
  live in the Pod IMAGE, so `_isImageResident` makes `remoteModelsCheck` report them
  installed while the wrapper cannot delete them — asking is a guaranteed `not_found`.
  This is the remote face of the local `targetPath` refusal.
- `status === 'unsupported'` (pre-v0.4.0 image, no delete endpoint) **breaks the loop** —
  an unsupported sweep is a whole-sweep no-op, never an error and never a per-dep retry.

**Pod-verified 2026-08-07** on a CPU download-mode Pod (wrapper 0.2.41) against a real
150GB volume: read-only classification first (`71 protected / 35 eligible / 35 echoed /
0 on volume`, explained dep-by-dep), then a seeded shared orphan collected for real while
a shared dep the installed models needed survived beside it, then `deleteFiles: false`
proven to skip the sweep entirely. Net change to the volume: zero. Full numbers and the
re-run recipe live in `.agents/mpi-kanban/tasks/MPI-464/validation.md`.

Two things that run cost us and are worth knowing before touching this again:

- **A seeded test orphan must be declared by ≥2 models, none installed.** The first
  attempt seeded a dep declared by ONE model, which made it that model's *exclusive
  evidence* (the MPI-310 rule) and resurrected it as installed — the seed defended
  itself and `onVolume` stayed 0. Not a bug; the rule working.
- **The sweep sees post-delete truth.** It runs after the uninstall's own delete loop,
  so a model whose exclusive evidence that loop just removed is no longer installed by
  the time the sweep classifies. That is exactly what lets the sweep collect an orphan
  the uninstall itself created.

Wired at the end of the remote uninstall branch, gated on `deleteFiles`, never fatal, and
its `swept N orphaned` rides the same log line and the same `sweptOrphans` response +
`download:uninstalled` payload as local. `tests/orphan-sweep-remote.test.cjs` runs the real
classifier against a fake volume (wrapper calls stubbed on the required `remoteModels`
module — no Pod, no network) and pins every refusal above, plus the inventory gate: with
candidates eligible but nothing on the volume, `remoteUninstallDep` must not be called at
all.

The renderer must also not read an arch weight alone as "installed": a flat
arch-variant model (LTX-2.3 balanced) is installed only when its common deps are
ALSO on disk (`MpiModelManager._commonDepsOnDisk`), else a card whose shared deps
were deleted would show a green INSTALLED and hide the loss.

- SSE stream at `/comfy/downloads/stream` is auto-connected on first `start()` call. On connect the backend runs a reconcile pass then broadcasts `download:snapshot`; the FE resets its version floor (no `/status` fetch — MPI-276 deleted it).
- Emits Events for all download state transitions (`download:started`, `download:progress`, etc.).
- On `download:snapshot`, REPLACES `state.downloadJobs` wholesale (version-gated); transport detail (speed/phase/indeterminate/error) rides delta events and is carried forward onto the job; the client-only `pending` job is preserved.

**Footer no-Install-flash contract (MPI-241, preserved by MPI-276).** A lingering terminal `done`→`complete` job still counts as *busy* (holds Cancel/progress, never flashes Install) until the post-complete resync prunes it; `anyInstalled` is checked BEFORE busy so Uninstall wins on re-sync. The busy set (G14) = `{pending, queued, downloading, verifying, installing, done-awaiting-resync}`; `verifying` is a `phase`, not a model status; `done` maps to `complete` in the snapshot listener. No "Finishing…" label — `Verifying…` is the only end-phase text. Guard: `tests/model-footer-settling.test.cjs`.

## The licence gate — consent before the weights (MPI-451)

Most weights we ship are permissive. A few are not: their licence obliges **us, as
distributor**, to bind the END USER to the licensor's restrictions before they receive
the files, and to tell them those restrictions apply. MiniMax H3 §V.2 is the forcing
case; Flux is the next known consumer.

**One descriptor, one chokepoint, no new code per model.**

- **Data:** `js/data/modelConstants/licences.js` — `MODEL_LICENCES`, keyed by **model
  id**, plus `getModelLicence` / `hasAcceptedLicence` / `recordLicenceAcceptance`. A
  second gated model is a new entry and nothing else. It is deliberately NOT a field on
  the ModelDef: `models.js` is already the biggest data file in the app, and a licence
  is versioned independently of the model wiring — bumping `version` re-prompts everyone
  who accepted the older text, without touching a ModelDef.
- **UI:** `MpiLicenceGate` (`showLicenceGate(licence) → Promise<boolean>`).
- **Chokepoint:** `downloadService.start()`. Install fires from five call sites — the
  Model Library, the Flow Library, `commandExecutor`, and two in `shell.js` — so the gate
  sits where they converge, not on the tile a user usually clicks.
- **Receipt:** `localStorage` `mpi_model_licence_accepted` → `{ [licenceId]: { version,
  at, acceptedVia } }`, written by `start()` on accept, never by the dialog.

**Receipts are keyed by LICENCE id, not model id** — several models can share one
descriptor object. H3 ships as two ModelDefs (`minimax-h3` fl2va and
`minimax-h3-ref2va`, different transformer weights) under a single agreement, so
accepting during the first install satisfies the second and it runs straight through.
That is deliberate: the licence binds the *person* ("bind each recipient or user to
enforceable terms"), so re-showing the identical 25 clauses for the sibling variant is
friction that buys no consent. Two models under genuinely different licences still get
two dialogs — different `id`s. Never reuse an `id` across different agreements; it is
the acceptance key. `acceptedVia` records which install prompted it.

**`start()` must stay synchronous for an ungated model.** It is a thin guard in front of
`_start`, and a missed lookup falls through in the same tick. That is load-bearing:
`MpiModelManager._install()` relies on `start()` emitting `download:started`
synchronously to patch its tile and flip the detail footer to Cancel. A gated model
necessarily goes async (someone has to read something) and its tile correctly stays on
Install until the dialog is accepted. Do not make the whole method `async`.

**Three traps, all found in the browser and none visible in source:**

1. **A scroll gate computed before layout gates nothing.** `scrollTop`, `clientHeight`
   and `scrollHeight` are all 0 until the modal is portalled — and `0 + 0 >= 0 - 4` is
   true, so the "you have read it" flag was set during `setup()` and the checkboxes
   shipped unlocked. `_atEnd()` now requires `clientHeight > 0` first. No layout, no
   verdict. (The same check still has to treat a genuinely short, laid-out pane as read,
   or a licence that fits would deadlock the dialog forever — it can never fire `scroll`.)
2. **A throw between "dialog closed" and "promise resolved" wedges the install queue.**
   `showLicenceGate`'s `finish()` resolves BEFORE it logs, because a `clientLogger.log`
   that does not exist (the API is `info`/`warn`/`error`) left the promise pending with
   the dialog already gone — and `start()`'s promise feeds the serial install chain.
3. **Escape and `ui:close-all-popups` tear the modal down without emitting `cancel`.**
   `showLicenceGate` watches for the element leaving the DOM and settles those as a
   decline, so the promise can never hang.

Guards: `tests/licence-gate.test.cjs` pins the pure half (gated vs ungated, the version
bump, the receipt shape). The DOM half needs a laid-out modal, so it is verified in the
running app — which is the only reason trap 1 was ever caught.

## Backend — `routes/downloadManager.js`
Non-blocking download router using `node-downloader-helper`. **Resume contract (MPI-317):** user CANCEL is intent → partial + marker deleted; failure/stall/app-quit is accident → partial kept, and the next Install resumes it via an explicit Range request (`resumeFromFile` on a marker-blessed partial). Safe because the installed NDH clears `__isResumed` and TRUNCATES on a 200-not-206 answer, so the MPI-258 Bug 2 append-corruption (200 full body appended onto a partial → SHA256 mismatch, hit live on the 25GB LTX transformer) cannot recur on this version. A 416 (partial larger than the remote object) scrubs the unusable partial and restarts clean. There is still no pause/resume UI — those routes stay deleted (c7313dff).

**The REMOTE twin of that contract deletes volume bytes — cancel ORDER is load-bearing.**
On the remote engine, cancel is not "stop a stream". For every dep in `_remoteDepIds` it
calls `remoteCancelInstall` **and then `remoteUninstallDep`** (`routes/downloadManager.js`,
the cancel route), which deletes the dep's file — and its `.part` — **off the Pod volume**.
That is correct for a user pressing Cancel (same "intent" rule as above), and catastrophic
for an operator clearing stale jobs after a Pod died mid-fill: the jobs look dead, but the
partials behind them are hours of download that aria2 would otherwise resume.

The safe order is therefore **delete the Pod FIRST, then cancel**. With no Pod attached,
`wrapperFetch` cannot reach the volume, `remoteCancelInstall` swallows its own error and
`remoteUninstallDep` is `.catch`-ed, so the cancel degrades to a pure local job-scrub and
the volume is untouched. Cancelling with a Pod still attached is the destructive path.
Measured 2026-08-08 during the MPI-467 smoke fill: that order preserved ~273 GB across
three restarts, and the reverse would have destroyed it each time.

**Endpoints:**
- `POST /comfy/models/download/start` — register the model job in the store BEFORE responding (register-before-respond, G8); the response body carries the `job` snapshot + store `version`.
- `POST /comfy/models/download/cancel` — stop + scrub a model's active/queued download. **Idempotent**: an unknown job returns 200 (+ `download:cancelled` broadcast), NOT 404 (MPI-258). On the remote engine it ALSO deletes the dep off the Pod volume — see the ordering rule above.
- `GET /comfy/downloads/status` — full queue snapshot (still map-backed; carries `version`).
- `GET /comfy/downloads/active` — active model downloads plus engine-download flag for Electron quit warnings
- `GET /comfy/downloads/stream` — SSE broadcast channel; on connect: reconcile pass → `download:snapshot`.
- `POST /comfy/models/uninstall` — uninstall a model (engine-filtered, store-guarded — see below).

> The `/download/pause`, `/download/resume`, `/engine/pause`, `/engine/resume` routes and the `_pausedDownloaders` map were DELETED in c7313dff. Do not reintroduce them.

**FileDownloader class** (`routes/downloadManager.js`; renamed from `ResumableDownloader` in MPI-276, resumable again since MPI-317):
A single-stream `node-downloader-helper` wrapper: start/resume, cancel (stop + remove), stop-keep (shutdown), SHA256 verify, SSE progress broadcast.
- `.download()`: a marker-blessed partial (file AND `.cubricdl` survived a failure/stall/quit) resumes via `resumeFromFile` with an explicit Range request. **The resume key is the marker's `sha256`, not its url** (`_shouldResumePartial`, MPI-429): same hash = same bytes = safe to resume from whatever origin is now in play. No url comparison can answer this once a mirror exists — our HF re-host serves the same object under a path PREFIX, and a third-party copy under a different repo AND filename. `_isSameObjectUrl` survives only as the fallback for pre-MPI-429 markers and for deps with no `sha256` (custom-node zips); it is suffix-tolerant so the prefix case still matches. Getting this wrong re-arms MPI-317's data loss — deleting exactly the partial failover exists to preserve. The SHA256 verify remains the net (MPI-427). No marker-blessed partial → scrub any stale file, one clean stream. 30s socket-inactivity `timeout` so a black-hole route emits `error` instead of hanging (MPI-120).
- `.cancel()`: user intent — `stop()` + delete partial + marker. `.stopKeep()`: shutdown/teardown — stream closed, partial + marker KEPT for next-boot resume (used by `cancelAllDownloads` on SIGTERM/SIGINT, never by the user-cancel route).
- On completion: verifies `sha256Expected` against the digest computed **incrementally while the file streamed in** (MPI-296 — a `Transform` hash-sink `.pipe()`d ahead of the file write, finalized on `end` into `_streamHashHex`), skipping a whole-file re-read that cost ~35s on a 6.6GB weight (34814ms→1ms). RESUMED streams skip the fast path (the pipe saw only the tail — a tail-only digest is garbage) and `_verifySha256` falls back to the full disk re-read, so a bad resume costs one failed verify, never a corrupt install. Then clears `<file>.cubricdl`, marks dep `complete`.
- On SHA256 mismatch: deletes the file, clears the marker, marks dep `failed`.
- On error: partial is KEPT (`removeOnFail:false` — NDH's own removeOnStop/removeOnFail defaults were what ate a 5.66GB Chroma Flash partial pre-MPI-317) so a retry resumes.

### Uninstall pipeline (G13, MPI-276)

One engine-parameterized pipeline in `POST /comfy/models/uninstall`:

1. **Server-side engine filter (MPI-276).** The route re-resolves the model's
   engine-correct universe with `_filterDepsForEngine(modelId, wireDeps, engine)`
   and keeps only deps in it — it no longer trusts the wire dep array (a stale
   client / direct API call could ask to delete the wrong engine's files).
2. **Shared-dep guard** (whole-model-installed rule, below) + **in-flight
   protection on BOTH engines** via `_inFlightDepIds` (store SOT — remote
   previously had none).
3. **Delete via the engine path** (local trash→remove, remote wrapper delete).
4. **Post-uninstall reconcile pass** + snapshot broadcast.

**Custom-node FOLDER deletion (MPI-276).** Install extracts a node to
`custom_nodes/<dep.filename>/` and removes the zip. The old uninstall re-derived
`custom_nodes/<name>.zip` — the long-gone zip — so the delete no-op'd yet the
loop still pushed the dep to `removed[]` and logged a lie. `_customNodeUninstallPath`
now targets the extracted FOLDER, and `removed[]` gets an entry ONLY when a path
actually existed and was deleted; a kept/missing path lands in `keptModelFiles`
(`reason:'already-absent'`) with an honest log line. Guard:
`tests/uninstall-guards.test.cjs`.

**`removed[]` means DELETED — on both engines (MPI-469).** The remote loop never got
the rule above: it pushed every wrapper answer that was not `unsupported` into
`removed[]`, so `remoteUninstallDep`'s `'not_found'` — the file was never on the volume —
read as a successful delete (measured on a Pod 2026-08-07: `nvidia-pid` reported **8
removed against 1 real file**). It now buckets `not_found` into `keptModelFiles`
(`reason:'already-absent'`), same bucket and same reason string as the local twin.
Two consequences worth knowing:
- The `anyUnsupported && removed.length === 0` early-return got STRICTER — an old-image
  Pod holding none of the model's files now reaches it instead of falling through on a
  fake `removed[]`. Correct: nothing was deleted, so the install record survives.
- `already-absent` is **gone, not kept**, and the renderer must count it that way. It
  did not — `MpiModelManager`'s `download:uninstalled` handler folded it into the kept
  totals, so a model whose files had all vanished toasted *"model files kept on disk;
  still installed"*. That bug was LOCAL too (since MPI-276) and is fixed in the one
  place both engines land. Guards: `tests/remote-uninstall-reporting.test.cjs` (route,
  wrapper stubbed) + a live browser probe of the toast branches.

**Job storage (runtime maps — write-authoritative, transport carriers):**
- `_depJobs Map<depId, DepJob>` — individual dependency jobs (URL, bytes, status, sha256, pipPins). **No `refCount` field — DELETED MPI-276.**
- `_modelJobs Map<modelId, DownloadJob>` — model-level aggregate job (totalBytes, downloadedBytes, speed, progress, deps[])
- `_activeDownloaders Map<depId, FileDownloader>` — actively downloading
- `_sseClients Set<res>` — SSE subscribers

Every runtime status write goes through `_setModelStatus`/`_setDepStatus`, which set the map field AND drive the store's legal transition (a runtime→store string map; model `complete`→`done`). Live progress is mirrored to the store via `_syncStoreProgress` so the snapshot broadcast carries real bytes.

**RefCount was DELETED (MPI-276) — never reintroduce it.** It tracked "how many model jobs reference this dep" but LEAKED upward (a successful download never decremented it, only uninstall/rollback/cancel did), so it sat ≥1 after any install and lied. Liveness is now a STORE query:
- **Shared-dep uninstall protection** gates on `store`-derived in-flight (`_inFlightDepIds` = deps held by a non-terminal model job other than the one being uninstalled), not a refCount and not the old `_depJobs.status` map read.
- **Cancel** gates on `_otherActiveModelUsesDep` (another ACTIVE model job references the dep). Unknown-job cancel returns an **idempotent 200** (+ `download:cancelled` broadcast), never 404.

**Uninstall on Windows — Recycle Bin has a QUOTA (MPI-258).** `windows-trash.exe` exits **255** (uninstall silently no-ops, `removed:0`, misleading "all files shared" toast) when a weight exceeds the drive's *Recycle Bin* budget — this is the bin cap, NOT disk free space (a 6.9GB file failed with 37GB free on the drive). Since uninstall exists to free space (parking a 25GB weight in the bin wouldn't free it anyway), the uninstall loop tries `_trash` first, then falls back to permanent `fs.remove` on any trash failure. Small files still go to the bin (undo-safety); only over-quota weights hit the fallback.

**Idle partial bar — 1GB floor (MPI-258).** `MpiModelManager._computePartial` draws a partial bar only when ≥1GB of a model's OWN deps are on disk. Below that, only shared support files are present (Wan 5B borrows Wan 2.2's CLIP/VAE; anime packs share a 65MB upscaler owned by no installed model) which read as a phantom 1-3% on a never-touched pack — the floor suppresses those. This is separate from `_sharedOwnedDepIds` (excludes deps owned by an *installed* other-model, MPI-258 Bug A).

**Custom-node install — "already extracted" is FILES, not folder-exists (MPI-243).** A `targetPath` weight (e.g. RIFE's `ckpts/rife/rife47.pth` resolves UNDER `custom_nodes/comfyui-frame-interpolation/`) downloads BEFORE the node extracts, creating the node dir as a subdir-only **shell**. `_runCustomNodeInstall` keys "already extracted" on `_nodeFolderHasFiles(targetDir)` (folder holds a top-level FILE — real nodes ship `__init__.py`/`install.py`), NOT `pathExists`. `pathExists` false-positived → skipped extraction → `python install.py` in an install.py-less folder → Errno 2, "UW deps installation failed / Press Retry". The rename block MERGES the extracted node into a weight-shell (`fs.copy` overwrite + remove source), preserving `ckpts/`, instead of deleting the node as a "duplicate". Order-independent. Two support fixes same card: stale-zip scrub in `download()` (no NDH ` (1)` dups) + a per-dep reqs failure sets `anyFailure + continue` (one node's install hiccup no longer aborts the batch). Guard: `tests/node-install-batch-resilience.test.cjs`.

## State Keys
In `js/state.js`:
- `downloadJobs[]` — `DownloadJob[]` array, persisted for shutdown recovery
- `downloadQueueActive` — `boolean`, true when any download is in progress
- `comfyNeedsRestart` — `boolean`, true after custom node install; triggers auto-restart in `ensureServerRunning()`

## Download Events (Lifecycle)

| Event | Direction | When |
| --- | --- | --- |
| `download:started` | Backend→SSE→Frontend | Model job enqueued and downloading begins |
| `download:progress` | Backend→SSE→Frontend | Per-dep bytes/speed updated, throttled 1/sec on backend |
| `download:complete` | Backend→SSE→Frontend | Fires PER-DEP with `{depId, modelId:null}` as each file lands, then ONCE model-level with a real `modelId` when the whole dep set is done (`_checkModelJobsComplete`). Frontend consumers doing expensive work (registry re-sync, grid rebuild) MUST gate on `data.modelId` — running per-dep re-synced the registry N× and flashed the Model Library grid (see [model-library.md](model-library.md) § Library flash on install). |
| `download:failed` | Backend→SSE→Frontend | SHA256 mismatch or network error. Fires per-dep (`{depId}`, **silent client-side** — MPI-97) and model-level (`{modelId}`) from `_checkModelJobsComplete`; only the model-level one surfaces. Its payload FLAGS pick the surface — see § Failed is not one thing |
| `download:cancelled` | Backend→SSE→Frontend | User cancelled or shutdown |
| `download:uninstalled` | Backend→SSE→Frontend | Model uninstalled |
| `download:installing` | Backend→SSE→Frontend | Custom-node install phase in progress — since MPI-413 that is the one curated `python_deps.txt` pip pass plus the node extractions, not a per-node `requirements.txt` |
| `comfy:needs-restart` | Backend→SSE→Frontend | Custom node install done; ComfyUI needs auto-restart |

## Failed is not one thing — the payload carries the verdict (MPI-480)

`download:failed` is the same event for "your disk is full", "your network blocked the
host", "the Pod is still waking up" and "this is a bug". The renderer cannot tell them
apart from the message string, so the BACKEND classifies and the payload carries the
verdict. `downloadService.js` branches on the flags, in order, and only the final fallback
opens the **Download Failed + Report on GitHub** dialog:

| payload | surface | set by |
| --- | --- | --- |
| `_isOutOfSpaceError(error)` (text match, not a flag) | disk-full toast | errno 28/122 text from either engine (MPI-100) |
| `networkBlocked: true` | toast, `error` shown verbatim | `_describeTransportError` (MPI-427) |
| `transient: true` | "engine isn't ready yet" toast | `isTransientProxyStatus()` in `routes/remoteModels.js` (MPI-480) |
| none of the above | **error dialog + Report on GitHub** | the genuine-bug fallback |

**A flag only reaches the user if every hop carries it.** The chain is
`err.<flag>` at the throw → `depJob.<flag>` in the dep-level catch → the
`_checkModelJobsComplete` broadcast → the renderer branch. The dep-level broadcast is
silent client-side, so `_checkModelJobsComplete` reading the flag OFF THE FAILED DEP is
the only route to the user — a flag set on the error but not stashed on the dep job is
dropped with no error anywhere. This is NOT the `_createDepJob` whitelist (that governs
fields sourced from the registry dep); these are runtime assignments.

MPI-480 was exactly this hop missing. `wrapperFetch` already retried 404/502/503/504 as
transient, but `remoteInstallDep` threw a bare `Error`, so the verdict died at the throw
and a cold Pod's boot race — which a re-POST fixes — asked the user to file a GitHub
issue. **Do not "fix" that class of bug by widening the retry budget**: it hides the
instance and leaves the classification wrong.

## ComfyUI Auto-Restart
When `comfyNeedsRestart` is true, `ensureServerRunning()` in `comfyController.js` stops ComfyUI, starts it again with `{ isUserRestart: true }`, and polls until ready before any generation proceeds.

## NDH Download Gotchas

`node-downloader-helper` v2.1.11 key traps: writes straight to final filename (no `.part` suffix), so a killed partial sits at the final path. `removeOnStop`/`removeOnFail` default TRUE — they ate a 5.66GB partial via the watchdog's `stop()` pre-MPI-317; both are now set false and deletion is owned by `.cancel()` alone. `.download()` resumes a marker-blessed partial via `resumeFromFile` (explicit Range; NDH truncates on a 200-not-206 answer) and scrubs only unusable/stale partials (no blind `resumeIfFileExists`). `models/check` uses bare `fs.pathExists` — partial-at-final-path reads as installed (false positive). MPI-54: `<file>.cubricdl` sidecar marker + `isCompleteOnDisk()` + `routes/downloadCompletion.js` fix this.

**custom_nodes progress = indeterminate, never a byte ratio (MPI-231).** A GitHub `/archive/` zip is served with NO Content-Length → `stats.total`=0 → the denominator falls back to the tiny registry `seedBytes` (~15MB) while the numerator counts real streamed bytes; the following pip requirements phase has no honest up-front total either. A determinate bar overshoots (RES4LYF read `203 MB / 15 MB`). Fix: `_byteRatioExcludingNodes()` drops `type==='custom_nodes'` from BOTH sides on local (`_wireProgress`) + remote (`_onRemoteInstallEvent`); the job broadcasts `indeterminate:true, phase:'preparing'` when it has no honest total OR when the node phase is the only thing left (`isNodeTickPending`). **It is a JOB-level flag, never a per-tick one (MPI-410).** It used to be `isNodeTick || total<=0`: nodes and weights stream CONCURRENTLY, so the flag flipped on whichever dep ticked last and the engine install screen alternated "Preparing dependencies..." with a byte readout on every event (the strobe), while a model tile re-rendered on the same flag. The exclusion above is what prevents the `203 MB / 15 MB` lie; the flag never was. The rule lives in `routes/install/computeProgress.js` and both tick sites call it. Weights keep their real ratio (they send Content-Length). `MpiEngineInstall.setProgress` honors the flag (guarded by `!engineHasBytes`) → loading sweep + "Preparing dependencies…", and while those UW ticks carry real bytes they OWN that info line — `engine:extracting` stops writing it (MPI-410: on the uv path a phase line is broadcast per uv/pip stdout line, and both streams wrote the same element). The ComfyUI engine archive download/update is untouched — it uses the `engine:downloading` path with a real total, never this one.

## `_createDepJob` is a WHITELIST — add every new dep field or it vanishes

`_createDepJob(dep)` builds the runtime `depJob` by **explicitly listing fields**, and
`modelJob.deps` (what the install loop iterates) holds those depJobs — not the registry
objects. A field you add to `nodesDeps.js` / `dependencies.js` and do NOT add here is
silently absent by the time the install runs, with no error anywhere.

This bit twice, both on pip fields that no longer exist (deleted with the per-node
requirements step, MPI-413): MPI-149 lost `pipPins` + `installRequirementsCommand` on the
engine-deps/upgrade path (kornia floated → LTXVideo `pad` ImportError), and MPI-370's
`requirementsDrop` would have been dead on the universal-workflow path — the exact path
it existed to fix. The trap is the whitelist, not those fields: guard every new field with
a test that asserts the passthrough, and negative-control it by removing the line and
watching the test fail.

## The curated Python dependency set (MPI-413) — LOCAL engine

The local engine installs **one** file, `dev_configs/python_deps.txt`, in a single
`--no-deps` pass — `ensureCuratedPythonDeps()` in `routes/shared.js`, gated on a
content-hash marker at `<ENGINE_ROOT>/.cubric_python_deps`. It runs **no** node's
`requirements.txt`, no `installRequirementsCommand` and no `pipPins`. All custom_nodes are
universal (MPI-222), so the whole set is always the right set, and the marker makes every
start after the first a no-op and an engine that predates the file self-heal.

### It runs at engine START, not during a model install (MPI-459)

The pass lives in `/comfy/start` (`routes/comfy.js`), immediately before the `spawn` —
the **only** point in the app where the engine is provably down: the route holds no child
process and its MPI-434 port probe just proved nothing else answers on 48188.

It used to run at the top of `_runCustomNodeInstall`, i.e. mid-model-install, with no
regard for whether the engine was up. The moment a release **moves a pin**, pip must
replace a package the running ComfyUI has already imported — and Windows refuses to
overwrite a loaded binary. Observed 2026-08-06 installing MiniMax H3:
`OSError [WinError 5] Access is denied` on
`python_embeded/Lib/site-packages/cv2/cv2.pyd`, pip exits 1, and the model install reports
`Download Failed`. It never self-healed: the marker is stamped only on success, so every
later install repeated it identically while the engine ran. A *fresh* engine is immune —
`cv2.pyd` does not exist yet, so nothing is locked — which is why this survived to a
released app. Do not "fix" a recurrence with a retry or a try/catch at the pip call; the
cause is the engine being up, not pip being flaky.

Nothing is later for the deps: a custom-node install already REQUIRES a restart before
ComfyUI scans the new nodes (`comfyNeedsRestart` → the gen gate's stop+start in
`js/services/comfyController.js`), so they land on exactly the boot that first loads the
nodes needing them. `_runCustomNodeInstall` keeps setting that flag; it is what carries
the deps to their install point.

**A failed pass does not abort the start.** Before the move, a failure left a working
engine and only the install reported it; refusing to boot over e.g. an offline pip would
be a worse regression. The reason is logged and returned as `depsWarning` on the
`/comfy/start` response, and a node whose moved pin is missing says so in the engine log.

What it replaced: 13 separate pip resolves re-deriving the same shared graph. Measured on
a warm-cache macOS install — 400 `Requirement already satisfied` lines, `numpy` re-resolved
18x, `torch` 10x, and four packages installed then uninstalled and replaced.

**`--no-deps` is load-bearing, not an optimisation.** The file is the complete resolved
closure MINUS two classes that are deliberately stripped, and only `--no-deps` keeps them
out:

- **The engine-owned torch stack.** `torch` is a real transitive of diffusers, ultralytics,
  kornia, albumentations and mediapipe, so a resolve legitimately pulls in `triton`, ~16
  `nvidia-*` wheels and (on Linux) `cuda-toolkit`/`cuda-bindings`/`cuda-pathfinder`. That
  is the several-GB stack MPI-413 Evidence A landed on a CPU-only box with no NVIDIA
  driver. Engine provisioning owns torch; this file must never move it.
- **Duplicate `cv2`.** Three nodes declare three distributions that install into the same
  namespace (`opencv-python`, `opencv-python-headless`, `opencv-contrib-python`), so
  `import cv2` used to be decided by whichever pip ran last. Unified to
  `opencv-contrib-python-headless` (superset, headless).

`dev_configs/python_deps.in` is hand-curated (drops, pins, PEP 508 markers, each with its
reason); `python_deps.txt` is generated by `scripts/compile-node-deps.mjs`, which fetches
each node's requirements from GitHub at the exact `node_lock.json` commit — no engine
needed, same answer on any machine. **Adding or bumping ANY locked node requires
re-running it** (`--check`, edit `.in`, regenerate, commit both) or the node ships with
missing dependencies. Guard: `tests/curated-python-deps.test.cjs`.

**`--check` reads EVERY node in the lock, not the `installRequirements: true` ones
(MPI-472).** That flag is the Pod's bake/volume split; it is not a claim that a node
declares no requirements. Filtering the gate on it hid `ComfyUI-VideoHelperSuite`, which is
`installRequirements: false` and ships two lines — and one of them, `imageio-ffmpeg`, is a
hard runtime requirement of **our own** `MpiSaveVideo` (`find_ffmpeg()` tries
`VHS_FORCE_FFMPEG_PATH`, that import, then `shutil.which`). Nothing has installed a node's
`requirements.txt` since MPI-413, so the first engine to fully reinstall lost every video
output on every model, at the last node, after the full sample (live 2026-08-07). The Pod
was immune by accident — its image apt-installs ffmpeg, so `which()` finds one. A node with
no requirements file 404s, which the fetch treats as "declares nothing".
Full step: `docs/playbooks/add-model/02-dependencies-r2.md`.

**The remote twin has converged (MPI-413, 2026-08-04).** The Pod image installs the same
`python_deps.txt` and the wrapper runs no pip at all, so `routes/remoteModels.js` no longer
sends `install_command` / `pip_pins` — that passthrough is deleted, along with the local
`requirementsDrop` / `_filterRequirements` pair. Deleting it could not regress a released
app: all 7 deps that carried those fields are `installRequirements: true`, i.e. baked into
the image and never volume-installed, so the passthrough had no reachable consumer under
any wrapper version.

The two platform-unresolvable lines that `requirementsDrop` used to strip are handled by
the curated file itself: `onnxruntime-gpu` (CUDA-only, no macOS wheel ever — it bricked
every Mac first-install of a depth model, MPI-370) carries a PEP 508 marker, and
`git+…/facebookresearch/sam2` (needs `git` on PATH, which no portable engine ships,
MPI-387) is omitted outright. `pipPins` and `installRequirementsCommand` survive as data in
`nodesDeps.js` — `tests/node-drift.test.cjs` and `tests/controlnet-aux-torch-guard.test.cjs`
still pin them — but nothing executes them on either engine.

## The universal dep set spans TWO HOSTS — install it half-by-half (MPI-427)

`getUniversalWorkflowDepIds()` (`routes/shared.js`) selects `type === 'custom_nodes' ||
engineAsset === true`. Those two halves do **not** come from the same place:

| Half | Source | Built by |
|---|---|---|
| every `custom_nodes` dep | **github.com** commit-archive zips | `lockUrl()` in `nodesDeps.js`, from `dev_configs/node_lock.json` |
| every `engineAsset` weight | **models.cubric.studio** (R2) | hardcoded `url` in `assetDeps.js` |

**So one blocked host does not mean nothing can be installed** — it means roughly half of
the set still downloads perfectly. Any code that treats this set as all-or-nothing is
wrong, and was: `startUniversalWorkflowInstall` used to reject the moment any dep failed,
with the reject sitting ABOVE the custom-node extract/pip/marker step. A user whose ISP
intercepted the model host (44/44 model-host downloads dead, 45/45 github.com fine) had
his fully-downloaded node zips discarded unextracted, and because the drift check below
reads "no folder" as missing, boot re-ran the same repair and discarded them again on
every launch — an engine that could never install one node, so generation failed on
unknown `class_type` no matter which weights were present.

The contract now:

- The wait **resolves with** the failure; the custom nodes that reached `complete` are
  installed; only then does it throw. The error carries `err.modelJob`, because both
  engine-provision callers catch it and would otherwise leave `uwModelJob` null and skip
  `finishCustomNodeInstall` entirely — the same lost-nodes bug one layer up. Both were
  swept (`_provisionWindowsEngine` archive, `_provisionUvEngine` uv-bootstrap); a
  one-platform fix here is a false done.
- `/engine/repair-deps` distinguishes an outstanding **node** from an outstanding
  **weight**. It runs behind the boot gate, which releases on `engine:ready` /
  `engine:gate-release` and NOT on `engine:error` — so reporting an error when every node
  is installed locked the user out of the app entirely, behind a Retry that failed
  identically every time. Nodes all present → `engine:complete` (ComfyUI can run, let them
  in). Nodes genuinely missing → the error, which now carries a "Continue without them"
  escape emitting `engine:gate-release` (deliberately NOT `engine:install-skipped` — that
  means "I will use RunPod instead" and `MpiRunpodSettings` syncs its switch to it).

Guard: `tests/uw-partial-install.test.cjs` checks the ordering and the both-platform sweep
lockstep against the source; a mirrored copy of the logic would pass while the shipped
file regressed.

## Node commit-drift + `.mpi_node_commit` marker (MPI-222)

A pinned custom-node commit bump (`dev_configs/node_lock.json`) used to leave the
installed node silently STALE — the install-check was folder-exists only. Now each
node install stamps `<node>/.mpi_node_commit` with its pinned commit (written LAST =
success sentinel). `checkUniversalWorkflowDepsStatus` (`routes/shared.js`) drift-checks
every folder-present `custom_nodes` dep (marker ≠ pinned, or absent → drifted) and
returns `driftedDeps`.

- **Local heal:** `/engine/repair-deps` (`routes/engine.js`) unions
  `missingDeps + driftedDeps` and **pre-wipes** each drifted folder with `fs.remove`
  BEFORE `startUniversalWorkflowInstall` — else the installer skips it as
  already-on-disk (`isCompleteOnDisk`) and the wrong commit survives. **Gotcha:** the
  pre-wipe nukes the WHOLE node folder, including any in-folder weight (see `targetPath`
  below); a tracked `targetPath` weight self-heals on the next boot-install, an
  untracked one is lost.
- **No dev skip (2026-08-08):** the drift check treats `ComfyUI-MpiNodes` like every
  other node on a source run. The junction it protected is gone — live node editing moved
  to the standalone bench, so an unpinned node fails on dev instead of passing there and
  reaching no user. See `.claude/rules/comfy_engine.md` § NO dev escape hatch.
- **Remote heal:** a drifted volume node installs with `force:true` so the wrapper
  re-clones at the pinned commit; without force it short-circuits `already_installed`
  → an endless install loop. See [runpod-remote-engine.md](runpod-remote-engine.md) § 6.

### `targetPath` — a weight that lives INSIDE a node folder

Most weights resolve to `mpi_models/<type>/`. A node that hard-codes its own scan dir
(RIFE reads only `custom_nodes/comfyui-frame-interpolation/ckpts/rife/`) needs its
weight there instead. Such a weight dep declares
`targetPath: 'custom_nodes/<node>/<subdir>'` + `engineAsset: true`; `resolveComfyPath`
(`routes/shared.js`) installs it under the ComfyUI repo root, bypassing the type→subdir
map. **Trap (MPI-222):** `downloadManager.js` has its OWN resolve at 3 sites
(size-calc, preserve-rule, installer) — each must pass the FULL dep so `targetPath`
survives; a stripped `{type,filename}` falls back to `mpi_models/` and the node never
finds the weight. Being `engineAsset`, the weight boot-installs + self-heals; on remote
it's image-resident (baked inside the node folder, so the wrapper never installs it).
Guard: `tests/node-drift.test.cjs`.

**Trap (MPI-293) — reading the dep registry as TEXT.** `dependencies.js` is a
FACADE: it only spreads the four split files (`modelDeps.js`, `assetDeps.js`,
`loraDeps.js`, `nodesDeps.js`) and holds NO inline block text. Runtime
`import {DEPS}` consumers are fine (spread resolves at load), but any code that
regex-scans the *source* of `dependencies.js` finds NOTHING — silently. This
killed three scanners: `remoteModels.js` `_universalNodeFilenames` (empty baked
set → every baked node hit the wrapper → `comfyui_controlnet_aux` Errno-2 on a
fresh volume), `controlnet-aux-torch-guard.test.cjs` (asserted null → dead), and
`release-health-check.mjs` folder-type scan (MPI-143 map guard passed on
nothing). Fix: text-scanners must read the split file(s) that hold the blocks
(`nodesDeps.js` for custom_nodes; glob `*Deps.js` for a folder-type sweep).

## The remote ATTACH guard trusts the WRAPPER, not its own cache (MPI-97 / 100 / 481)

`_startRemoteDownload` skips any dep it believes is already handled, so model B
never fires a second `/wrapper/models/install` for a dep model A is already
installing (the wrapper 409s a duplicate, which was surfacing as a
Download-Failed + Report-on-GitHub dialog — MPI-97). B ATTACHES instead: the dep
stays in B's `modelJob.deps` and the shared install SSE fills B's bar.

**Every arm of that guard is module-level cache, and cache is not truth.** The
maps outlive what produced them, so each arm needs a cross-check against a live
source before it may skip an install:

| Arm | Goes stale when | Fresh truth |
|---|---|---|
| `depJob.status === 'complete'` | an uninstall deleted the weight (MPI-100) | `remoteModelsCheck` (`statusResults[dep.id].installed`) — real on-disk volume state |
| `_remoteDepIds.has(dep.id)` / `depJob.status === 'downloading'` | the Pod dies, is deleted, or warm-cycles mid-install (MPI-481) | `remoteActiveInstallIds()` (`GET /wrapper/models/install/active`) — the ids the wrapper is really installing |

Both failures look identical from the outside and neither logs anything: the dep
never reaches `toInstall`, **no wrapper install fires at all**, and the app waits
on a stream with no producer. MPI-100's version faked a green INSTALLED over a
missing weight; MPI-481's froze 13 model jobs across a session (only an app
restart cleared them, because the maps are module-level).

Two things that are NOT interchangeable here:

- **`statusResults` cannot settle the in-flight arms.** `installed: false` is
  what a corpse AND a genuinely live download both report, so reading it as
  "not in flight" fires a duplicate install for every real attach — straight
  back into the MPI-97 dialog. Only the wrapper's install registry separates them.
- **A dep the wrapper disowns must also leave `_remoteDepIds`.** Otherwise the
  set never empties: the MPI-136 stall watchdog keeps polling and
  `_teardownRemoteEventStreamIfIdle` never closes the SSE, both for an install
  that does not exist. (The re-install path re-adds it a moment later and hides
  this; the already-on-the-volume path is where it leaks.)

Unknown beats wrong when the wrapper cannot be asked (unreachable, or an image
old enough to lack the endpoint — none are: it ships since v0.2.1): fall back to
trusting the cache. A false attach only delays one install; a false duplicate
fails the whole model.

**The LOCAL path has no equivalent hole.** `startModelDownload` /
`startUniversalWorkflowInstall` also skip a dep whose job reads `downloading`,
but a local download and its `_activeDownloaders` entry live and die in the SAME
process — the state cannot outlive its producer, so there is nothing to
cross-check against.

## Remote (RunPod) Disk-Full Pre-Flight

An old comment in `downloadManager.js` (MPI-100 era) claims a truthful remote
pre-flight is impossible — that's now WRONG and superseded. `remoteVolumeFreeBytes()`
in `routes/remotePodLifecycle.js` resolves real free space: `used` from the
wrapper's `GET /wrapper/disk` (`du -sb` on the mounted volume — the only honest
usage source, MPI-169), `size` (GB) from the RunPod REST volume object matched
to the pod's `networkVolumeId` (falls back to the sole volume if only one
exists). `_startRemoteDownload` in `downloadManager.js` gates on it the same
shape as the LOCAL statfs gate (MPI-99): `toInstall` deps' seed bytes × 1.05 >
free → reject with a 400 `[Errno 28] No space left on device` BEFORE any
wrapper install call fires, instead of letting a doomed multi-GB download run
and die near 100%. Either half unknown (old wrapper, `du` fail, volume
unresolved) → skip the gate, never false-block. `downloadService.js`'s
`_firePost` 400-handler must route this through `_isOutOfSpaceError()` to a
warning TOAST, not the GitHub-report dialog — the same matcher the reactive
`download:failed` SSE path already used. **MPI-237:** the same telemetry backs
the UI disk bar via `GET /remote/pod/disk`, which returns `{used,total,ephemeral}`
— total resolved by the pure `resolveDiskTotalBytes(pod, volumeList)` (volume
size, or ephemeral `containerDiskInGb`).

**Why the reactive-only catch used to miss it live:** MPI-136 (stall/speed-limit
abort + httpx chunk-deadline) can make a genuinely-full volume manifest as a
"peer closed connection" / "download stalled" error on the Pod wrapper BEFORE a
clean `errno 28` ever gets raised — so the reactive string-match in
`downloadService.js` silently missed a real disk-full and showed the wrong
(GitHub-report) dialog. The pre-flight gate above sidesteps this entirely by
never starting the doomed download. `wrapper.py` (≥0.2.31) also fast-fails a
genuine mid-write `ENOSPC` (no pointless retry) and gives the httpx fallback
path resume+retry so a transient CDN drop doesn't restart a multi-GB file from
byte 0.

## The second origin — Hugging Face mirror failover (MPI-429)

Every model weight ships with one primary URL on `models.cubric.studio` (R2). One ISP
filter on that host takes the whole catalogue with it, so a **transport** failure — and
only a transport failure — retries the same object against a second origin before the dep
is declared failed. A 404 or a SHA256 mismatch would fail identically everywhere, so those
do not qualify.

**The mirror is Hugging Face, not a second Cloudflare hostname.** A second `cubric.studio`
subdomain only defeats an FQDN-keyed filter, and MPI-427 named the likely trigger as
`cubric.studio` being a young uncategorised domain — category filters key on the
REGISTRABLE DOMAIN. HF beats FQDN, domain and provider keying at once.

Two shapes, because the copies do not all live in one place. All 97 R2 deps were
classified by matching our recorded `sha256` against HF LFS oids (the tree API exposes
`lfs.oid`, which IS the sha256 — so the match is by HASH, not by path):

| Set | Deps | Mirror |
|---|---|---|
| our own bakes, re-hosted to `Mad-Pony-Interactive/cubric-studio` | 30 | generic prefix rewrite, no per-dep data |
| byte-identical copies already published by third parties | 66 | explicit per-dep `mirrorUrl` |
| a dep with neither | 1 of the 97 | `noMirror: true` |

**The 97 are MODEL deps. Three engineAssets added since carry `noMirror: true` too** — `taesdxl-decoder`, `taef1-decoder`, `taef2-decoder` (MPI-420). They are not a gap in the sweep: no HF repo serves those bytes in the split/strict-load form ComfyUI's TAESD needs, so a generic rewrite could only 404. Counted 2026-08-05 during MPI-450's claim audit, because the release note said the whole catalogue had a second route and four deps did not.

**One dep is deliberately single-route until 2026-08-10.** `krea2-raw-transformer-nsfw`
(coyotte's LUSTIFY V10) was re-hosted by the sweep and then **deleted from HF by the user**
— V10 is in a paid early-access window that opens 2026-08-10, and a public HF copy
redistributes it in a way our own app-gated R2 does not. It carries `noMirror: true` for
exactly as long as that holds; re-upload and remove the flag after 2026-08-10. Verified
2026-08-03 by HEAD-ing all 31 generic-rewrite mirrors: 30 × 302, this one 404. Reasoning:
`docs/models/krea2/licences.md`.

`qwen-lora-headswap` was
the lone exception and it is instructive: it shipped with an empty `origin`, so the
968-repo sweep could not place it and it carried `noMirror: true` until Fabio named the
repo (`Alissonerdx/BFS-Best-Face-Swap`, MIT) by hand — confirmed by hash, byte-identical
upstream all along. `origin` is the sweep's input, which is why
`docs/playbooks/add-model/02-dependencies-r2.md` now treats it as load-bearing rather than
informational.

- **The base carries a PATH PREFIX, not just an origin.** HF serves at
  `huggingface.co/<repo>/resolve/main/<path>`; an origin-only swap emits
  `huggingface.co/vision/models/…` and 404s on every dep.
- **`mirrorUrl` wins and suppresses the rewrite.** Those 65 sit under a different repo AND
  a different filename, so no rewrite reaches them, and emitting our path too would spend
  a retry on a certain 404. Generate it from the sweep — never hand-write it.
- **`noMirror: true` for any R2 dep with no HF copy.** Without it the rewrite hands it a
  URL that 404s. Adding a dep to R2 without re-hosting it means setting this.
- **Only `/vision/models/` paths are rewritten.** `FileDownloader` also pulls the engine
  archive (`engine.js`) and the custom-node zips, both from github.com — MPI-427 measured
  github 45/45 against models.cubric.studio 0/44. Keyed on the PATH, not the host, because
  the host is the thing a failover changes.
- **Mirrors are always derived from `_originUrl`, never from the mutated `depJob.url`.** A
  mirror pathname already carries the previous base's prefix, so rewriting from it would
  double the prefix; `_triedUrls` is what stops the walk repeating.
- **A mirror that fails does not cost the user his diagnosis.** The blocked message is
  remembered (`_blockedMsg`): if R2 was blocked and the mirror then 404s, the failure still
  reports the VPN remedy and `networkBlocked`, not a bare "status code 404".

**Local-only by construction.** `_mirrorUrlsFor` lives in the `downloadManager.js`
`FileDownloader`; the Pod wrapper's aria2c downloader never consults it, so R2 stays
primary on the remote engine and the HF/Xet multi-connection throttling that the R2
migration (MPI-129/140) fixed cannot come back **for the deps that have an R2 copy**.
It very much came back for the six that do not — see § "HF weights take the Xet-native
transport, not plain HTTP" (MPI-491). No engine-split sweep applies here.

Proven 2026-08-03: all 96 mirrors HEAD-checked live, `X-Linked-ETag` (the LFS oid) equal
to the dep's recorded sha256 on every one; and an end-to-end run against a dead origin
completed off huggingface.co and passed the SHA256 verify with the shipped default and no
env override. **NOT proven against the original reporter's transfer-stage DPI** — he is
unreachable. This defeats host-, domain- and provider-keyed blocking; it is not a proven
fix for deep-packet interference.

`CUBRIC_MODEL_MIRRORS` (comma-separated) REPLACES the default at runtime for testing
without a rebuild. Guard: `tests/transport-error-message.test.cjs`.

## HF weights take the Xet-native transport, not plain HTTP (MPI-491)

`https://huggingface.co/<repo>/resolve/<rev>/<path>` is the **compatibility** route. It
302s to `us.aws.cdn.hf.co/xet-bridge-us`, a shim for clients that only speak plain HTTP,
and from RunPod EU-RO-1 that shim is capped at **~1.7 MB/s** — a per-IP TOTAL cap, not a
per-connection one. Measured 2026-08-08 on `h3-qwen3vl-32b-clip` (24.55GB):

| where | transport | conns | MB/s |
|---|---|---|---|
| Pod | aria2c | 16 | 1.66 |
| Pod | httpx | 1 | 1.74 |
| Pod | **hf_xet (`_download_hf`)** | — | **541 peak, ~350 avg** |
| Pod | aria2c, R2 control (`sdxl-realistic`) | 16 | 297 |
| home | curl, same url | 1 | 41.0 |

**Read the first two rows before theorising.** 1 connection and 16 land within 5% of each
other, so connection count is not the lever and never was — a plausible story about HF's
request-count limiter (3,000 resolver requests / 5 min per anonymous IP) predicted
single-stream would win, and it lost. The R2 row proves the NIC is healthy in the same
minute. The home row is the *same URL* at 24x the datacenter.

What actually works is skipping the bridge. `huggingface_hub` + `hf_xet` asks CAS for the
file's reconstruction metadata and pulls the xorbs from **presigned S3** — a different
origin, which the R2 row already showed this Pod can saturate. **~320x on the same file,
same volume, same minute.** The full MiniMax H3 set (~46GB across five deps) went from a
projected 10 hours to about 2.5 minutes of transfer.

Order in `_run_install`: `_download_hf` → `_download_httpx` → (non-HF only) `_download_aria2`.
`_download_hf` returns `None` when it does not apply (not a `/resolve/` url, or
`huggingface_hub` absent) and raises on real failure; both fall through, so an install can
never hard-fail because the fast path stumbled. HF is kept out of aria2 entirely by
`_is_hf_url` — at 1.66 vs 1.74 aria2 is strictly the worse fallback there, and its
`--lowest-speed-limit=1M` makes it worse still (with 16 connections sharing a 1.7 MB/s
bucket every connection sits under the floor and gets culled every 30s, and each reconnect
is another request).

### Getting it onto the image that matters

The Pod that actually installs models is the **slim `-cpu` one**, and it had none of this:
`wrapper/requirements.txt` was five lines, and `publish-runtime.sh` floats **code, not pip
packages**. So the install is a guarded line in `start-cpu.sh` — which *is* floated, unlike
`bootstrap.sh` (baked; putting it there would force a rebuild):

```sh
python -c "import huggingface_hub" 2>/dev/null || pip install --no-cache-dir huggingface_hub
```

Non-fatal by design: the wrapper falls back to httpx and must always boot.
`huggingface_hub` is also in `wrapper/requirements.txt` now, so the next image build bakes
it and that line becomes a no-op.

### Fine print

- **`HF_XET_CHUNK_CACHE_SIZE_BYTES=0`** is set explicitly. The chunk cache only pays off on
  repeated/incremental pulls; here it would be pure container-disk growth, and a full
  container disk is its own outage (MPI-483).
- **`HF_XET_HIGH_PERFORMANCE` is deliberately NOT set** — it wants ≥64GB RAM and degrades
  below that. A cpu3c download Pod has nothing like it.
- **The Xet path discards a partial.** It re-downloads into a stage dir and `os.replace`s
  over `part`. ref2va threw away a 20.23GB partial and still finished the whole 20.97GB in
  ~60s. At 550 MB/s resume is not worth the complexity.
- The stage dir lives at `<part>.hfstage`, inside the models tree, so the finishing move is
  an `os.replace` on one filesystem and never a cross-device copy of 20GB.
- It is a **subprocess**, not an in-process call: cancel is a kill (huggingface_hub has no
  cancellation hook), and an hf_xet segfault cannot take the wrapper down with it.

### Why H3 cannot just move to R2 like everything else

The MiniMax H3 Community Licence's trigger covers "reproducing, modifying, distributing",
so pointing the dep at Comfy-Org's own repo is what kills the §III redistribution claim
(`modelDeps.js:425-433`, MPI-449 `research.md` § 0). H3 is HF-primary permanently and by
design. **Do not "fix" a slow H3 download by re-hosting it on R2.**

### Dead ends — do not re-tread

- **`hf_transfer` / `HF_HUB_ENABLE_HF_TRANSFER=1`**, the well-known Colab "100 MB/s" trick,
  is **silently ignored** since `huggingface_hub` v1.0. No error, no warning, no effect.
- **`hf-mirror.com`** — unreachable from here, `http=000`.
- **A non-Xet HF repo as a fallback.** `Dockerfile:348` calls `marduk191/rife` "a plain
  non-Xet repo, never 403s" — that is **stale**. Every HF path now 302s to
  `xet-bridge-us`, rife included.
- **Raising aria2's `-x`** — hardcoded ceiling of 16, and wrong-signed anyway.

### BOTH remote download paths stage ON the volume, and a stopped Pod strands what they left

The HF path stages into `<dest>.part.hfstage/` — *inside* MODELS_DIR, deliberately, so the
finishing move is an `os.replace` on one filesystem instead of a cross-device copy of 20GB
(`wrapper.py`, `_download_hf`: "Stage INSIDE the models tree"). The aria2/R2 path writes
`<dest>.part` next to the final file. Neither one is off-volume.

**A 2026-08-09 note here claimed the opposite** ("stages OFF the volume", 49,664 bytes on
the volume with 1.27GB fetched). That reading came from `GET /remote/pod/disk`, whose `du`
is cached for 60s and is invalidated only by an install COMPLETING or a delete — never by
one starting. It was the pre-install number, not a live one. Measured 2026-08-10 with
`GET /remote/pod/ls` (live `du`, no cache): mid-install the volume carried
`text_encoders/<file>.safetensors.part.hfstage/.cache/huggingface/download/….incomplete`
and its bytes. **Sample volume usage with `/remote/pod/ls`, never with `/remote/pod/disk`,
while anything is downloading.**

Consequences that cost a live session on 2026-08-10:

- **An interrupted install strands its staging on the volume and nothing sweeps it.** A Pod
  STOP kills the container before `_download_hf`'s `shutil.rmtree(stage)` runs, so the tree
  survives — 11.5GB of it after one killed 24.55GB install. `POST /comfy/models/uninstall`
  for that same dep answered `already-absent` (it removes `dest` and `dest + ".part"`, not
  the `.hfstage` directory) and the app's orphan sweep maps volume files to deps, so an
  unmappable staging path is invisible to it too.
- **The disk gate counts a dep's own stranded `.part` against its retry.** aria2 removes the
  old `.part` at the start of the next install ("clean slate", MPI-136) — but the app's
  free-space gate runs before that and refuses the retry for space the install is about to
  reclaim. Live: `remote install blocked — volume full: need 13.3 GB, have 12.0 GB free`
  for the very dep whose 13.3GB `.part` was the thing occupying the volume.

## A blip is not a verdict — same-url retry (MPI-460)

The mirror walk above answers "this ROUTE is blocked". It does not answer "this route
hiccupped", and until MPI-460 nothing did: `FileDownloader.on('error')` fell straight to
`_setDepStatus('failed')`. Live 2026-08-06 that made a 60-second quiet socket terminal for
the 25GB `ltx23-transformer-fp8` at 8.4GB, with the origin healthy throughout (a
`Range: bytes=8446279680-` against the same object answered 206 minutes later).

The stall watchdog (MPI-291) is what surfaces the quiet socket, and its own error string
(`Download stalled - no data received.`) matches NO `_TRANSPORT_ERROR_PATTERNS` entry, so
the failover never even considered it. MPI-291's brief assumed it was routing into
"the EXISTING failed/retry logic"; MPI-427's retry is the USER clicking Install again
(`installStore.requeueDep`). Nothing automatic existed.

Now: three retries of the SAME url on `RETRY_BACKOFF_MS = [2s, 5s, 15s]`, re-entering
`download()` so the MPI-317 resume contract picks the partial back up via Range. Gates:

- **Bytes on disk (`depJob.downloadedBytes > 0`) — the load-bearing one.** MPI-427's user
  had every connection killed in <200ms, zero bytes, 44 times; for him a budget is 22s
  bought before the remedy he needs to read. Retry defends PROGRESS, it does not argue
  with a route that never delivered. This is also what keeps the mirrors-exhausted →
  `failed` contract intact.
- A definite 4xx is not retried (416 excepted — the scrub above just made the next attempt
  a clean start).
- The retry timer is cleared by `cancel()`/`stopKeep()`, so a cancel during the backoff
  cannot resurrect the download.

**This matters most where there is no second origin**, and the catalogue is NOT uniformly
"R2 primary, HF fallback" in either direction (counted 2026-08-06):

- **HF-primary with no alternate** — the four MiniMax H3 deps (`minimax-h3-fl2va-transformer`,
  `h3-qwen3vl-32b-clip`, `vae-minimax-h3-video`, `vae-minimax-h3-audio`) plus
  `controlnet-union-flux`. H3 is HF-only; nothing was staged to R2.
- **R2-primary with no alternate** — the `noMirror` set: `krea2-raw-transformer-nsfw`
  (until 2026-08-10, MPI-433) and the three TAESD decoders.
- The other 100 R2 deps have a second route: 66 by explicit `mirrorUrl`, the rest by the
  generic HF prefix rewrite.

A blip used to kill every single-route dep outright — there was nothing to fail over to.

`_rearm()` is what puts the downloader back in `_activeDownloaders` before ANY in-place
restart. That register is written in exactly one place (`_startPendingDeps`), so the
failover branch — which only nulled `_downloader` — had been dropping off it for its whole
life: invisible to the stall watchdog, to cancel/uninstall and to shutdown, while the
launcher counted the freed slot and handed it to another dep.

**Reachability is a separate question from logic, and only one thing asks it.**
`npm run release:deps` (`scripts/check-dep-urls.mjs`) HEADs every dep `url` plus every
mirror `_mirrorUrlsFor` would try, and exits 1 on anything unreachable — the MPI-429
hand sweep, scripted. Release step, never CI: it is network-bound and would flake.
`custom_nodes` are excluded from the single-route report (github zips, single-route by
design — MPI-427 measured github 45/45 against models.cubric.studio 0/44). It reuses the
real `_mirrorUrlsFor` rather than re-deriving the rewrite, because a second copy of that
math would drift, and drift is the bug class it exists to catch.

Guard: `tests/download-retry.test.cjs` — a local server kills the first connection
mid-body, and the test asserts the retry's request carries `Range: bytes=<partial>-` and
the finished file matches the expected sha256. It drives `forceStall()` directly because
NDH v2.1.11 does **not** emit `error` on a socket that dies mid-body (re-measured 2026-08-06,
the same finding MPI-291 built the watchdog on).
