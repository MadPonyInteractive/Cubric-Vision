# MPI-716 — validation

Umbrella MPI-717, Phase 1. Three log lines added to the local download path; no behaviour
change. Evidence folder (outside every git root, third-party username and folder layout):
`C:/AI/Mpi/_private/cubric-download-telemetry/`. **Paths and usernames from those captures
are deliberately not reproduced here — the board is public.**

## Executed checks

| Check | Result |
|---|---|
| `node tests/download-retry.test.cjs` | **4 passed** — the MPI-460 retry case plus three new |
| `npm test` (full suite) | **917/917, 0 fail**, exit 0 |
| `npx eslint routes/downloadManager.js server.js tests/download-retry.test.cjs` | exit 0 |
| Phase 1 in a real app boot (`npm run app:isolated`, own profile + own port 50666) | both lines land immediately after `Server started`; user's `:3000` untouched throughout and still listening afterwards |
| Phase 3 probe on a known-good SSD | `write probe — 800.0 MB/s writing 8 MB (fsynced)` |

Real lines from the isolated boot (this box, models root on a second drive):

```
[INFO] [download] free space — models root: 14.6 GB free of 238.5 GB (93.9% used) at G:/CubricModels
[INFO] [download] free space — userData: 98.5 GB free of 930.5 GB (89.4% used) at <profile>
```

Real WARN from the throttled harness (dep id substituted to read as production would):

```
[WARN] [download] klein-4b-transformer: slow stream — 88 KB/s sustained 1s from 127.0.0.1:62261 (peer 127.0.0.1, cf-ray: -)
```

The 93.9%-used models volume also satisfies the plan's "point the models root at a nearly-full
volume and confirm the percentage reads high" — it is a real volume, not a contrived one.

New test cases on the existing harness (no second harness was built):

1. a slow-but-alive stream warns **exactly once**, naming rate, host, peer and POP;
2. the write probe fires once off that same latch, names an **fsynced** rate, and leaves no
   temp file;
3. a probe that cannot even open its file logs and **resolves** — telemetry never becomes a
   new failure path.

`_setSlowStreamThresholdsForTests` compresses the 60 s window for the test only; production
never reassigns it. Same contract as the existing `_setTrashFnForTests`.

## Definition of done — re-reading the two captured logs

The card's own acceptance test: name, per addition, the line it WOULD have written into
those captures and the question that line answers.

### 1. Free space

**Would have written:** one pair of lines at each of the FOUR boots in the capture
(16:59:59, 17:41:28, 17:56:24, 17:59:21), plus one at each install start — 17:00:43 (the
28 universal deps, the healthy 16.51 MB/s baseline) and 17:43:12 (the 11 queued deps that
crawled).

**Answers:** was the volume near full, and is it the same volume as `userData`? The capture
shows the portable root, engine, models and `userData` all on one drive — the fact the whole
"process or volume" question hangs on — but says **nothing** about how full it was, at any
of the four boots. Four boot lines would also have made a *series*: free space at 17:00
against free space at 17:59, read beside the bind times that degraded across exactly those
boots (0.07 s → 14.2 s → 11.2 s → 14.4 s).

### 2. Slow-stream WARN

**Would have written:** three lines at about **17:44:12** — one per dep started at 17:43:12,
sixty seconds after each went under the floor. Derived rates were 0.78, 0.29 and
**0.05** MB/s against a 1 MB/s floor, so all three latch with room to spare; each line
carrying the rate, `models.cubric.studio`, the peer IP and the Cloudflare POP.

**Answers:** how slow, from where, and via which edge — and it answers it for deps the log
is otherwise **silent** about. This is the sharpest result of the re-read:

- The only diagnostic the capture contains for that window is **one** stall-watchdog line,
  `qwen3-4b-clip` at **17:47:27** — 3 min 15 s later than the WARN would have fired.
- `klein-4b-transformer` and `klein-lora-nsfw` never stalled, so they produced **no
  diagnostic line at all** in the entire capture. `klein-lora-nsfw` — the worst performer
  in the whole investigation at 0.05 MB/s — appears only as `Starting download` (three
  times) and one `resuming`. Its 15× gap to its own sibling in the same window, the fact
  that killed the "ISP throttle" theory, is currently derivable only by differencing
  resume offsets, and only because a *different* dep happened to stall.

The POP half is not reachable by any amount of rate data: run 1's baseline install at
17:00:43 hit the same origin at 16.51 MB/s aggregate. Same edge as run 2, or a different
one? Two `cf-ray` values, seventy minutes apart, would settle it in one look.

### 3. Write probe

**Would have written:** one line at about **17:44:12**, off the same latch, on the models
volume, as MB/s of an 8 MB fsynced write.

**Answers:** disk or network — the one question the entire investigation could not answer,
and the reason it dead-ended on "please run `curl -o NUL -w %{speed_download}`". Read beside
the free-space line from 17:43:12 it is one finding rather than two: a slow probe on a volume
that is also nearly full says volume; a fast probe says the network, and the `cf-ray` from
(2) says which edge.

**Verdict: all three additions shorten that investigation, and none is log noise.** Two of
the three deps in the crawling window currently produce nothing at all; after this card they
produce a rate, an origin, a peer, a POP and a disk figure within sixty seconds of going
slow.

## Known interaction, deliberately not fixed here

The probe's `unlink` opens a millisecond-wide window in which a concurrent tree walk can
`stat` a file that has just vanished — the reader-side race **MPI-719** fixes in
`findFileRecursive`. It is not introduced by this card (`cancel()` opens a far wider one on
every partial), only brushed by it, and the umbrella already sequences MPI-719 after this.
Named in the code comment beside the unlink so it cannot be found later without its context.

## Not done here (unchanged from the plan)

- Making the local transport faster — MPI-657 § Not in scope. This card produces that
  evidence; it does not spend it.
- `LOCAL_DOWNLOAD_CONCURRENCY` — rejected on the record, and the user reproduced the crawl
  with a single model.
- The probe's `PROBE_MIN_FREE_BYTES` stand-down path is unit-covered only by inspection: it
  needs a genuinely near-full volume to exercise, and no harness here can fake one.
