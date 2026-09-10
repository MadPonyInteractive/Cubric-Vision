# MPI-716 — a slow install is undiagnosable from the log, so the diagnosis costs the user a terminal session

## What happened

2026-09-10. A beta user on fiber in Portugal reported model installs crawling at 20-40 KB/s
where he normally sees ~50 MB/s. He sent two `app.log` captures. That is all the evidence
a remote user can produce without being asked to type commands, and **neither log contains
a single byte-rate, free-space figure or response header.**

Every number in the table below had to be DERIVED, by differencing
`resuming <dep> from N GB on disk` offsets against their timestamps. That trick only works
when a stall fires — and a stream that is slow but alive never stalls, so it is exactly the
case the log cannot describe. Diagnosis stalled on "please run `curl -o NUL -w
%{speed_download}`", which is not a thing to ask of a user who has work to do.

Raw logs (third-party username and folder layout — kept OUTSIDE every git root per
`.claude/rules/kanban.md` § The board is PUBLIC):
`C:/AI/Mpi/_private/cubric-download-telemetry/`

## What the derivation produced

Run 2, three deps starting from zero, one 608 s window, all from `models.cubric.studio`:

| dep | downloaded | derived rate |
|---|---|---|
| `qwen3-4b-clip` | 0.46 GB | 0.78 MB/s |
| `klein-4b-transformer` | 0.17 GB | 0.29 MB/s |
| `klein-lora-nsfw` | 0.03 GB | **0.05 MB/s** |
| aggregate | 0.66 GB | 1.11 MB/s |

Baseline 70 minutes earlier, same host, the 28 universal deps: **16.51 MB/s aggregate**.

Two facts the table settles, and neither was reachable from the log as written:

- **15x spread between sibling streams in one window.** A uniform ISP cap or CDN throttle
  hits all three equally. This does not, so the network is not the primary cause.
- **A restart partially recovers it.** Same dep across the restart boundary:
  `qwen3-4b-clip` 0.78 MB/s in run 2, **3.56 MB/s** in run 3 (0.46 -> 0.77 GB in 89 s).
  Cloudflare does not care whether the user restarted his app.

An independent code path shows the same curve — time for the Node server to bind:

| run | bind time | renderer `ERR_CONNECTION_REFUSED` retries |
|---|---|---|
| 1 (17:00) | 0.07 s | 0 |
| 2 (17:41) | 14.2 s | 1 |
| 3 (17:56) | 11.2 s | 2 |
| 4 (17:59) | 14.4 s | 3 |

Binding a local port has nothing to do with download throughput. Both degrade together,
which points at the process or the volume. Everything on this install lives on one drive,
**including `APP_USER_DATA`** — Electron's Chromium cache and LevelDB share the volume with
the weights, so a slow volume slows the downloads and the boot, which is the pair observed.
The same log's run 1 shows extract times consistent with it (two small node zips at 25 s and
35 s against a 1.7 s sibling).

**The card does not claim the volume is the cause.** It claims the log cannot tell us,
and that is the defect being fixed. Ruled out on the way: an AV folder exclusion changed
nothing, the user is on fiber, the parallel cap is not implicated (one model at a time
reproduces it), and our own per-dep tree walk is bucket-scoped since MPI-654
(`routes/shared.js:562`) so it is not large enough to do this.

## Why no existing guard catches it

A 20 KB/s stream is *alive*. NDH's `timeout: 30000` is socket-inactivity only, MPI-291's
watchdog needs 60 s of zero bytes, MPI-460's retry needs an error. All three trip on *dead*.
MPI-129's own brief says it outright: the watchdog "rides out self-recovering dips — it does
not fix throttling". So the stream crawls indefinitely, the log stays silent, and the user is
told nothing.

## What to add

Three lines of telemetry, all on our side, none of which ask the user for anything:

1. **Free space**, on the models root and the userData volume, at boot and at each install
   start. `fs.statfs` is already wired for the disk gate (`routes/downloadManager.js:1802`);
   today it only speaks when it refuses an install, so a volume filling up is invisible.
2. **Slow-stream WARN** — rate, host, resolved IP, and the `cf-ray` response header. `cf-ray`
   carries the Cloudflare POP code, so one line says whether a user landed on a far or sick
   edge instead of his nearest one. Logged once per dep when the rate stays under a floor,
   not per tick.
3. **A timed write probe to the models root** when (2) trips, logged as MB/s. That is the
   disk-versus-network split — the one question this whole investigation could not answer —
   run by the app at the moment it matters.

With those three, the next report of this shape is a thirty-second read.

## Not in scope

- **Making the local transport faster.** The Pod takes the Xet-native path (~350 MB/s
  measured, `docs/download-manager.md` MPI-491) while the local path is single-stream NDH.
  MPI-657 § Not in scope asked for that to be filed on its own evidence; this card produces
  the evidence, it does not spend it.
- **Raising `LOCAL_DOWNLOAD_CONCURRENCY`.** Considered and rejected on the record:
  `routes/downloadManager.js:628` documents that parallel pulls "fought over throttled
  bandwidth and made each other worse", and the user reproduces the crawl with a single
  model, so the cap is not the variable.

## Two sibling findings from the same investigation, NOT yet carded

Both are real, both were confirmed in code, neither is this card's job:

- **`cancel()` races every concurrent disk scan.** It deletes the partial and its
  `.cubricdl` marker in two non-atomic steps, while two readers stat what it just removed:
  `findFileRecursive` (`routes/shared.js:532`, `readdir` then unguarded `fs.stat` per entry)
  and `getPartialDownloadState` (`routes/downloadCompletion.js:63`, two `pathExists` then an
  unguarded `fs.stat`). Both throws reached `/comfy/models/check` as a 500 in the captured
  logs, 102 ms after a cancel, which drops one `syncModelInstalled` reconcile
  (`js/data/modelRegistry.js:281`). `findFileRecursive` is shared, so it is one primitive at
  two call sites. Belongs under the MPI-513 umbrella.
- **The same-url retry budget never resets.** `_attempts` is touched in four places in
  `routes/downloadManager.js` (743, 925, 927, 928) and reset in none, so MPI-460's
  `[2s, 5s, 15s]` is a per-file lifetime budget. On a link that blips every few minutes a
  large dep exhausts it regardless of progress: in the captured log `qwen3-8b-clip` sat at
  2/3 spent with 3.42 GB on disk. MPI-460's design assumed a blip is rare; this amends that
  assumption rather than contradicting it. Budget should mean three failures WITHOUT
  progress.
