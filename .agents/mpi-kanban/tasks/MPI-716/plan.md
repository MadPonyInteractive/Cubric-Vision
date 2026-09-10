# MPI-716 — plan

Three independent additions to the local download path. Each one is a log line that did not
exist; none changes download behaviour, so the risk is log volume, not regression.

Read `brief.md` first — the evidence is what sets the thresholds.

## Phase 1: Free space on the volumes that matter

`fs.statfs` is already imported and used by the disk gate
(`routes/downloadManager.js:1802`), and today it speaks ONLY when it refuses an install.
Log it unconditionally at two moments:

- app boot — models root and the `APP_USER_DATA` volume (they are often the same drive, and
  saying so is the point)
- each install start — the models root, before the first dep is fired

Free bytes, total bytes, and percent used. Percent is what makes a filling volume readable
at a glance; a bare "41 GB free" does not.

→ verify: start the app on this box, `grep '\[download\].*free' logs/app.log` shows one boot
line and one per install. Then point the models root at a nearly-full volume and confirm the
percentage reads high. Per-folder data trap on a fresh portable:
`docs/playbooks/install-test/README.md`.

## Phase 2: Slow-stream WARN

The rate sampler already exists — `_modelSpeedLabel` (`routes/downloadManager.js:1320`) keeps
an EMA per model job for the UI. Reuse it; do not write a second one, and do not compute this
per NDH chunk.

Fire once per dep when the sampled rate stays under a floor for a sustained window, carrying:

- the rate
- the host
- the resolved IP (`dns.lookup` on the host, once per dep, cached)
- the `cf-ray` response header, when the origin sends one

`cf-ray`'s trailing token is the Cloudflare POP code. That single field answers "is this user
landing on his nearest edge", which no amount of rate data can.

Thresholds come from the brief's measurements, not from taste: the observed floor was
0.05 MB/s and the healthy baseline 16.51 MB/s, two and a half orders apart. A floor around
1 MB/s sustained for ~60 s separates them with room on both sides. Latch it — one WARN per
dep per download, re-armed only on a resume — or a genuinely slow link writes a log nobody
can read, which is the defect this card exists to fix.

Explicitly NOT a new failure path. It logs and returns. MPI-657 § Watch out for already warns
against merging the ceiling, the watchdog and the retry; this is a fourth observer and must
stay one.

→ verify: a local server that serves a body at a throttled rate, asserting exactly one WARN
with a rate field. `tests/download-retry.test.cjs` already stands up a local server that
interferes with a body mid-flight — extend that harness rather than building a second one.

## Phase 3: Timed write probe on the Phase 2 trigger

When Phase 2 fires, write a few MB to the models root, timed, and log MB/s. Delete it. This
is the `curl -o B:\...` test the user could not be asked to run, executed by the app at the
moment it matters.

Gate it on the Phase 2 latch so it runs at most once per dep. A probe that writes on a timer
is a probe that competes with the download it is measuring.

Read it against Phase 1: a slow probe on a volume that is also nearly full is one finding, not
two.

→ verify: force the Phase 2 trigger on this box and confirm the probe logs a plausible MB/s
for a known-good SSD, and that the temp file is gone afterwards.

## Parallel Batch

None. Phase 3 fires off Phase 2's latch and reads against Phase 1's numbers; the three land in
one file. A fan-out would contend on `routes/downloadManager.js`.

## Definition of done

The two captured logs in `C:/AI/Mpi/_private/cubric-download-telemetry/` are the acceptance
test: re-read them and name, for each of the three additions, the line it WOULD have written
and the question that line answers. If a phase cannot be shown to shorten that investigation,
it is log noise and should not ship.
