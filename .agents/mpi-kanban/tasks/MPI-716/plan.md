# MPI-716 — plan

Three additions to the local download path. Each one is a log line that did not exist; none
changes download behaviour, so the risk is log volume, not regression.

Read `brief.md` first — the evidence is what sets the thresholds.

**Umbrella: MPI-717, Phase 1.** This card lands BEFORE MPI-718 (retry budget), which edits
the same `FileDownloader` handlers and extends the same test harness.

> Reviewed 2026-09-10 against the working tree. Two corrections to the first draft, both in
> Phase 2: the per-dep rate already exists on NDH's `progress` event (the draft pointed at
> `_modelSpeedLabel`, which is the per-MODEL EMA for the UI), and the resolved IP comes off
> the response socket, not a `dns.lookup`. Line numbers replaced by symbols throughout —
> they had already drifted.

## Phase 1: Free space on the volumes that matter

`fs.statfs` is already wired: `_freeDiskBytes()` in `routes/downloadManager.js` feeds the
MPI-99 disk-full gate, and today it speaks ONLY when the gate refuses an install. Log it
unconditionally at two moments:

- **app boot** — in `server.js`, beside the `Server started` line in the `app.listen`
  callback: the models root (`getCustomRoot()` || `getDefaultModelsRoot()`) and the
  `userData` volume the server is handed. They are often the same drive, and saying so is
  the point — the brief's whole "process or volume" question hangs on it.
- **each install start** — the models root, after the disk gate passes and before
  `_startPendingDeps()` fires the first dep.

Free bytes, total bytes, and percent used, one line, category `download`. Percent is what
makes a filling volume readable at a glance; a bare "41 GB free" does not. `_freeDiskBytes`
returns only `bavail * bsize` — extend it (or add a sibling) to return `blocks` too, rather
than a second `statfs` call.

→ verify: start your own instance (`npm run app:isolated`, never `:3000`),
`grep '\[download\].*free' logs/app.log` shows one boot line and one per install. Then point
the models root at a nearly-full volume and confirm the percentage reads high. Per-folder
data trap on a fresh portable: `docs/playbooks/install-test/README.md`.

## Phase 2: Slow-stream WARN

**The per-dep rate already exists.** `FileDownloader._bindEvents()` handles NDH's
`'progress'` event, and `stats.speed` is NDH's own bytes-per-second for THIS dep (it is
already written to `depJob.speed` for the UI). The MPI-291 stall clock (`_lastBytes`,
`_lastByteTs`) lives in the same handler. Put the latch there — not in `_modelSpeedLabel`
(that is the per-MODEL EMA the drawer shows) and not per NDH chunk.

Sustained window, per downloader: `_slowSince` set when `stats.speed` drops under the floor,
cleared when it comes back; when `now - _slowSince` passes the window and `_slowWarned` is
not set, WARN once and set it. Both reset in `_rearm()`, which every restart (retry, mirror
failover, resume) already goes through — that IS the "re-armed on a resume" rule, for free.

The line carries:

- the rate (`_formatSpeed(stats.speed)`)
- the host — `new URL(this.depJob.url).host`, read AT WARN TIME: MPI-429 mutates
  `depJob.url` on a mirror failover, so the host is whichever origin is streaming now
- the peer IP and the `cf-ray` header — **off the response, not a DNS lookup.** NDH 2.1.11
  stores the raw `http.IncomingMessage` on `this._downloader.__response` before it emits
  `'download'`. The existing `'download'` handler (the one that reads `evt.isResumed`) can
  stash `__response.socket.remoteAddress` and `__response.headers['cf-ray']` on the
  downloader. That is the address the socket actually connected to, which a `dns.lookup`
  on our side can only approximate. `__response` is a private NDH field, the same class of
  dependency as `__isResumed` that `docs/download-manager.md` § Resume contract already
  leans on — name the pin (2.1.11) in the comment so an NDH bump re-checks it.

`cf-ray`'s trailing token is the Cloudflare POP code. That single field answers "is this user
landing on his nearest edge", which no amount of rate data can.

Thresholds come from the brief's measurements, not from taste: the observed floor was
0.05 MB/s and the healthy baseline 16.51 MB/s, two and a half orders apart; the worst
per-dep crawl in run 2 was 0.78 MB/s. A floor of 1 MB/s sustained for 60 s catches all
three deps in the captured log with room on both sides. It is a log line, not a user-facing
verdict: a genuinely slow link pays one WARN per dep per download, which is the cost of the
latch and nothing more. Without the latch a slow link writes a log nobody can read, which is
the defect this card exists to fix.

Explicitly NOT a new failure path. It logs and returns. MPI-657 § Watch out for already warns
against merging the ceiling, the watchdog and the retry; this is a fourth observer and must
stay one.

→ verify: `tests/download-retry.test.cjs` drives the REAL `FileDownloader` against a local
`http` server that cuts a body mid-flight — extend that harness with a throttled body (write
a chunk per interval), never build a second one. Assert exactly one WARN per dep (spy
`logger.warn`, or read `_slowWarned` off the downloader) and that it names a rate. The test
server sends no `cf-ray`; assert the line degrades cleanly to "cf-ray: -".

## Phase 3: Timed write probe on the Phase 2 trigger

When Phase 2 fires, write a few MB to the models root, timed, and log MB/s. Delete it. This
is the disk-versus-network split the user could not be asked to run, executed by the app at
the moment it matters.

- `fs.open` → write ~8 MB → **`fsync`** → close → unlink, timed end to end. Without the
  `fsync`, Windows reports the page-cache rate and the number says nothing about the disk.
- Gate it on the Phase 2 latch, so it runs at most once per dep. A probe that writes on a
  timer is a probe that competes with the download it is measuring.
- Skip it when Phase 1's free-space number is under ~1 GB, and say so in the line. The
  disk-full gate's `ENOSPC` handler in `server.js` cancels every active download; a probe
  must never be what trips it.
- Local engine only, by construction: `FileDownloader` never runs for the remote engine, so
  there is no remote twin to write.

Read it against Phase 1: a slow probe on a volume that is also nearly full is one finding,
not two.

→ verify: force the Phase 2 trigger on this box (the throttled harness, or the floor set
high for one run) and confirm the probe logs a plausible MB/s for a known-good SSD, and that
the temp file is gone afterwards — including when the write itself throws.

## Docs

`docs/download-manager.md`: one short block naming the three lines and their grep patterns,
so the next remote report is read from the log and not derived from resume offsets.

## Parallel Batch

None. Phase 3 fires off Phase 2's latch and reads against Phase 1's numbers; the three land in
one file. A fan-out would contend on `routes/downloadManager.js`.

## Definition of done

The two captured logs in `C:/AI/Mpi/_private/cubric-download-telemetry/` are the acceptance
test: re-read them and name, for each of the three additions, the line it WOULD have written
and the question that line answers. If a phase cannot be shown to shorten that investigation,
it is log noise and should not ship. Expected shape:

1. Free space — would have said whether the models volume (which also holds `userData`) was
   near full at 17:41, a fact the log cannot give today.
2. Slow-stream WARN — would have fired for all three run-2 deps within about a minute,
   naming the rate, `models.cubric.studio`, the peer IP and the POP: same edge as the
   16.51 MB/s baseline seventy minutes earlier, or a different one?
3. Write probe — would have split disk from network at 17:42, which is the one question the
   whole investigation could not answer.
