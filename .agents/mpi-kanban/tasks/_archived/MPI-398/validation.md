# MPI-398 Validation

All numbers below are MEASURED on a live CPU Pod (`1fb5wwvnf2d9es`, no-GPU, EU-RO-1,
150 GB network volume, warm resume) on **2026-07-30 ~01:55-02:05Z**, app v1.2.0 dev
run on 127.0.0.1:3000. Nothing here is reasoned; every figure came out of the probe or
a curl. Where a hypothesis was killed by the measurement it is recorded as killed.

## Instrument

`routes/_probe398.js` — temporary, mounted with one line in `server.js` after
`express.static`, **reverted after the run**. Two counters in one file:

- an Express middleware counting every LOCAL route hit (which renderer poll fires);
- a wrap of `globalThis.fetch` recording every OUTBOUND call with its round-trip ms.

The global-fetch wrap was the load-bearing choice. `/wrapper/models/status` goes
through `remoteModels.wrapperFetch`, but the telemetry GETs `/wrapper/stats` and
`/wrapper/disk` use a **raw `fetch()`** in `routes/remotePodLifecycle.js` — a
`wrapperFetch`-only counter would have missed the very calls that turned out to be
the problem. Read with `GET /_probe398`, window zeroed with `?reset=1`.

Baseline before connecting: `outbound: []`. Local mode makes zero outbound calls, so
every figure below is remote-attributable.

## 1. IDLE on the Model Library, remote-connected — 62.1s window

No clicks, no scroll, no generation. Requests-per-minute, measured:

| outbound | /min | p50 | p95 | max |
|---|---|---|---|---|
| `GET /wrapper/stats` | 22.2 | 94ms | 320ms | 3576ms |
| `GET /health` | 15.5 | 151ms | 1573ms | 1573ms |
| `GET /v1/networkvolumes` (RunPod REST) | 7.7 | 547ms | 560ms | 560ms |
| `GET /wrapper/disk` | 6.8 | 590ms | 4241ms | 4241ms |
| `GET /v1/pods/<id>` (RunPod REST) | 6.8 | 782ms | 1032ms | 1032ms |
| **`POST /wrapper/models/status`** | **0** | — | — | — |

Local routes driving them: `/remote/pod/stats` 22.2/min, `/remote/comfy/status`
15.5/min, `/remote/pod/specs` 9.7/min, `/remote/mode` 9.7/min, `/remote/ws-token`
9.7/min, `/remote/pod/disk` 6.8/min.

**Total ≈ 59 outbound requests/min — one per second, doing nothing.** Summed round
trip ≈ 18.6s inside a 62.1s window, i.e. ~30% of idle wall-clock is spent in flight.

### The card's prime lead is WRONG as stated — recorded, not softened

**`POST /wrapper/models/status` fired ZERO times in 62s of idle.** MPI-326's
per-second storm has **not** regressed and is **not** the idle cost. The card
predicted the storm was "silenced rather than fixed"; at idle it is genuinely absent.
`js/data/modelRegistry.js`'s "~5s heartbeat re-checks install-state" comment does not
describe idle behaviour on this build. Do not re-open MPI-326 on this evidence.

### Duplicate pollers (secondary finding, from the inter-arrival gaps)

`/wrapper/stats` gaps (s): `1.83, 1.99, 3.58, 0.06, 0.36, 5.24, 5.98, 5.95, 0.84,
5.17, 6.18, 5.78`. `/wrapper/disk` gaps (s): `7.76, 2.02, 7.98, 4.97, 17.04, 1.98`.
Both show **pairs** — a 0.06s and a 0.36s gap inside an otherwise ~6s cadence. Two
subscribers appear to poll the same endpoint near-simultaneously rather than one
timer firing on schedule. Not chased further; noted for the fix.

## 2. Per-call latency, isolated — the volume-vs-latency split

Synthetic `POST /comfy/models/check` (routes to `remoteModelsCheck` ->
`POST /wrapper/models/status`), fake non-existent deps, dep count swept:

| deps in payload | run 1 | run 2 |
|---|---|---|
| 1 | 0.328s | 0.343s |
| 25 | 0.204s | 0.182s |
| 100 | 0.386s | 0.298s |

**Flat. No slope from 1 to 100 deps.** EU-RO-1 round trip for a wrapper POST is
~0.18-0.39s, and that is the floor: proxy RTT plus wrapper overhead.

### Second hypothesis killed by this table

Before running it, the wrapper source suggested the 2088ms `models/status` p50 seen
at connect was ~100 sequential `os.path` stats on a network volume
(`_is_complete_on_disk`, `wrapper.py:1107`, called per dep on the event loop with the
app sending every model x every volume dep in one POST, `remoteModels.js:374`). The
sweep refutes it: 100 deps cost no more than 1. Per-stat cost is negligible. That
explanation is dead — the 2s was contention, not stat count.

## 3. ROOT CAUSE — head-of-line blocking on the wrapper's single event loop

`GET /wrapper/disk` (`wrapper.py:750`) runs `du -sb /workspace` — a full walk of the
150 GB network volume — as a **bare `subprocess.run` inside an `async def` handler**.
It therefore blocks the wrapper's only asyncio loop for its entire duration, and
every other wrapper request landing in that window queues behind it.

Measured, with the negative control in the same run:

```
A: models/check alone            0.644s  0.188s  0.437s
B: /remote/pod/disk alone (du)   1.761s  1.825s
C: models/check DURING a du      1.365s  0.979s   <- overlapped the du
   (du returns here)             0.183s  0.193s   <- immediately after
```

Same endpoint, same payload, same session: **~7x inflation while a `du` is in
flight, collapsing back to the 0.18s floor the instant it returns.** That ordering is
what a blocked event loop produces and nothing else in the path explains it.

Cost at idle: `du` fires **6.8/min at ~1.8s each ≈ 12.2s of every 60s**, so the
wrapper is stalled roughly **20% of idle wall-clock**, and any request unlucky enough
to land in a stall pays up to `4241ms` (the measured `/wrapper/disk` max) or
`3576ms` (the `/wrapper/stats` max — a 94ms endpoint, stalled 38x).

**This is MPI-191's fix, applied to one endpoint instead of to the class.** MPI-191
moved `/wrapper/stats`'s cgroup + `nvidia-smi` readers to `asyncio.to_thread`
(`wrapper.py:730`) for exactly this reason, and `/wrapper/stats` duly measured a
healthy 94ms p50 here. `/wrapper/disk`, written later for MPI-169, kept the blocking
call — its own comment concedes "a big volume takes a couple seconds, acceptable for
an on-demand poll." It is no longer on-demand: it is polled 6.8/min.

## 4. What is NOT yet attributed

The original headline symptom — **10-15s blank Model Library grid on a COLD
renderer** — is not fully accounted for by these numbers alone. The mechanism above
is proven and explains the multi-second Settings disk bar, the late Disconnect
unlock, and the 2088ms `models/status` seen on the connect edge, but a cold-renderer
sample (window reset immediately before a Ctrl+R) has not been taken. Do that before
claiming the whole symptom, and do not back-fill it by reasoning.

## 5. THE FIX — wrapper 0.2.39, and what it measured afterwards

Shipped in `c:\AI\Mpi\mpi-ci\cubric-vision-pod\wrapper\wrapper.py` (`/wrapper/disk`),
R2-floated to the **dev** channel via `./publish-runtime.sh dev` — no image rebuild.
Three coupled changes, one per measured cause:

1. `du` runs via `await asyncio.to_thread(...)` — off the event loop. This is MPI-191's
   fix applied to the endpoint it missed.
2. **Single-flight**: an `asyncio.Lock` with a re-check of the cache *inside* the lock,
   so N concurrent callers cause ONE walk instead of N rival ones.
3. **60s TTL cache**, invalidated on real volume change — `_disk_cache_invalidate()`
   called from `_manifest_record_model` (the single choke point for all three
   install-complete paths) and from `models_delete` when something was actually
   removed. So the disk bar still drops immediately after a 9GB uninstall; it does not
   lag a timer.

App-side floor pin `WRAPPER_VERSION` in `routes/remotePodLifecycle.js` deliberately
LEFT at `0.2.36`: this is a perf fix, not a protocol change, and an older wrapper must
not be rejected. Client poll cadence deliberately NOT touched — the TTL makes the poll
rate irrelevant, and changing both at once would have muddied the attribution.

**Class sweep** (ROOT-CAUSE RULE step 3): `/wrapper/ls` has the identical pattern
(`du` per top-level dir + `os.walk`) and is worse, but has **zero consumers** in
`routes/` or `js/` — manual diagnostic only. Left alone, deliberately, and recorded
here. `/wrapper/models/status` is also synchronous but measured cheap (the flat
1-vs-100-dep table above), so it stays as-is.

### Post-fix measurements (wrapper 0.2.39 confirmed live via `wrapperVersion`)

**(a) Blocking is gone — the pre-fix negative control, inverted.** `models/check`
during a real cold-cache `du` vs with none running:

```
during a real du   0.696s  0.484s  0.454s  0.869s
alone              0.936s  0.957s  0.515s
```

Indistinguishable. Pre-fix the same pair was 0.18s alone vs 1.37s during.

**(b) Telemetry survives a real walk.** A later idle window caught a genuine
`1759ms` `du` in-window. Across 15 samples each during it: `/health` max **513ms**,
`/wrapper/stats` max **314ms**. Pre-fix, one ~1.8s `du` drove `/wrapper/stats`
(a 94ms endpoint) to **3576ms**.

**(c) Single-flight holds under concurrency.** 8 simultaneous `/remote/pod/disk`
calls on an expired TTL: all 8 returned **200** within **240ms of each other**
(3.875-4.116s), wrapper hop p50 `2735ms` — one walk's cost, shared. Pre-fix that same
shape produced 32s p50 and a 125s call that Cloudflare **524**'d.

**(d) Idle, focused, same conditions as §1** (disk bar mounted and polling 6.5/min vs
6.8/min pre-fix — the client is unchanged, so the rate should and did stay put):

| | pre-fix | post-fix |
|---|---|---|
| `/wrapper/disk` p50 / max | 590ms / **4241ms** | 194ms / **258ms** |
| `/wrapper/stats` max | **3576ms** | 550ms |
| `/health` p50 / max | 151ms / **1573ms** | 105ms / 236ms |

All six disk polls in that window came back under 258ms — no walk can be that fast,
so the TTL absorbed every one of them.

### Measurement trap found while doing this — record it

**Chromium clamps a backgrounded window's `setInterval` to ~1/min.** `podDiskBar` uses
a 10s interval (`js/services/podDiskBar.js:97`), so the disk-poll rate reads 6.8/min
with the app FOCUSED and 0.9/min when it sits behind a terminal. Two post-fix samples
were nearly discarded as a false improvement before this was spotted: the client was
never changed, so a poll-rate drop could not have been the fix. **Any before/after
poll-rate comparison in this app must hold window focus constant**, and the
user-visible worst case is the focused one.

## 6. SECOND OFFENDER — the one this write-up had already cleared, wrongly

After 0.2.39 the user opened the Model Library and reported it opened "really fast",
but the probe disagreed and the probe was right:

```
POST /wrapper/models/status   2 calls   min=2248ms  p50=9942ms
GET  /wrapper/stats                     max=8693ms      (a 94ms endpoint)
GET  /health                            max=5014ms  + 1 hard ERR
```

`/wrapper/disk` was healthy by then (p50 310ms), so the starvation signature had simply
moved to a second endpoint: `/wrapper/models/status`, whose per-dep `_is_complete_on_disk`
loop is also synchronous and also on the event loop.

**§2 cleared it on a bad measurement, and this is the correction.** That sweep used 100
`probe_nonexistent_*.safetensors` paths in a SINGLE `checkpoints/` directory — negative
lookups against one warm dentry cache — and read 0.18-0.39s flat, from which §2
concluded "per-stat cost is negligible, that explanation is dead." Re-measured with 86
REAL filenames spread across their real subdirs:

| 86 deps, same count and shape | run 1 | run 2 | run 3 |
|---|---|---|---|
| REAL filenames | 2.060s | 2.243s | 0.659s |
| absent filenames | 0.994s | 1.089s | 0.639s |

Real paths cost ~2x cold, both are ~5x the synthetic figure, and it warms after the
first pass. The app's actual payload is larger again (18 models, plus `custom_nodes`
deps that `isdir` + `listdir`) and measured ~10s. **A synthetic profile of absent files
in one directory understates this endpoint by roughly an order of magnitude — probe with
real filenames.**

Fixed in **0.2.40**: the whole per-model scan moved into `asyncio.to_thread`. NOT
cached, deliberately — install-state feeds the entire download UI and must stay
truthful, and it is cheap once the volume metadata cache is warm.

### Post-0.2.40 proof, on a FRESH Pod (cold volume cache, wrapper 0.2.40 confirmed live)

The user's Disconnect deleted the Pod rather than stopping it, so this ran against a
brand-new Pod with nothing cached — the harshest case for this endpoint.

```
A: real 86-dep models/check            1.947s  0.948s  0.572s
B: /remote/pod/stats WHILE two real
   models/check ran concurrently       0.092s  0.097s  0.063s  0.060s
   (the two checks themselves)         0.987s  0.970s
```

Probe over the same 5s window: `POST /wrapper/models/status` min 332ms / p50 686ms /
max 1264ms; `GET /wrapper/stats` max **94ms**.

**Telemetry stayed at 60-97ms while two real status scans ran.** Pre-fix that exact
shape produced 8693ms. Both offenders are now off the loop, each proven by the same
negative-control method: run the expensive thing and watch whether a cheap neighbour
notices. Neither does any more.

## 7. THE ACCEPTANCE ITEM — cold renderer, fresh Pod, USER-VERIFIED

Ctrl+R then open the Model Library, on the brand-new Pod (cold volume metadata, cold
renderer — the harshest form of the reported symptom). Reload confirmed present in the
sample, not assumed: `/project-file` x32, `POST /comfy/models/check` x5,
`/comfy/get-path`, `/list-projects`, `/engine/version-check`, `/engine/deps-status` —
the same boot markers the pre-fix cold-open sample carried and the three earlier
false-start windows lacked.

**User's words: "it was instant."** Original symptom was a 10-15s blank grid.

| endpoint | PRE-fix cold open | POST-fix cold open |
|---|---|---|
| `/health` | p50 **5013ms**, **3 of 4 ERR** | p50 141ms, max 357ms, **30/30 OK** |
| `/wrapper/manifest` | p50 **13714ms**, max 31164ms | p50 282ms, max 363ms |
| `/wrapper/disk` | p50 **32294ms**, max **125072ms**, one **524** | p50 371ms, max 4863ms |
| `POST /wrapper/models/status` | p50 **8679ms** | min 92ms, p50 2259ms, max 7774ms |
| `/wrapper/stats` | 702ms (1 sample) | p50 96ms, max 512ms |

### Known ceiling, stated rather than buried

`models/status` still peaks at **7774ms** and `/wrapper/disk` at **4863ms** on a fresh
Pod. Those are real first-touch costs against cold network-volume metadata — `min` is
92ms and 65ms respectively once warm, so it is a one-time-per-boot cost, not a steady
state. What changed is that they no longer starve anything: `/wrapper/stats` held 512ms
max and `/health` 357ms max straight through them, and every request in the window
returned 200. That is why it reads as instant.

If the first-touch cost ever needs to go too, the shape is known: cache install-state in
the wrapper the way `/wrapper/disk` now caches `du`, invalidated by
`_manifest_record_model` / `models_delete`. It was deliberately NOT done here — that
cache would sit under the entire download UI, and correctness there outweighs one cold
scan per Pod boot. Uncarded on purpose; raise it only if a user notices.

## Status

Root cause proven with a negative control, fixed at the source in TWO endpoints, each
fix verified live (§5 a-d for `/wrapper/disk`, §6 for `models/status`), and the
user-facing acceptance item verified by the user on a fresh Pod (§7).

**A process note worth more than the fix.** This card was nearly closed twice on
incomplete evidence, and both times the probe caught it: once when a poll-rate drop
looked like an improvement but was really Chromium throttling a backgrounded window,
and once when the user's own "it opened really fast" coincided with a 9942ms call still
in the log. A subjective read and a synthetic benchmark each pointed the wrong way here.
Keep the instrument mounted until the last acceptance item is measured.

**Still NOT verified — the one user-facing acceptance item:** the 10-15s blank Model
Library grid on a COLD renderer. Three timed windows were opened for a Ctrl+R and the
reload landed in none of them (detected honestly by the absence of the boot markers
`/project-file`, `/list-projects`, `/comfy/get-path`, `/comfy/models/check` that the
pre-fix cold-open sample carried). The probe stays mounted until that check lands. Do
not mark this card complete on the four proofs above alone — §4's cold-open gap is
still open, and the pre-fix cold-open numbers (`/wrapper/disk` p50 32294ms / max
125072ms with a 524, `models/status` p50 8679ms, `/health` failing 3 of 4) are the
control it must be compared against.
