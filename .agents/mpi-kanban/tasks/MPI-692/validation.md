# MPI-692 Validation

## What ran

```
$ node scripts/smoke-workflows.mjs --self-check
self-check OK (Input_Width=128, Input_Steps=1, Input_Frames=5, Input_Duration=1)
```

Four new asserts drive a synthetic `app.log` body through `downloadWarnings()`,
in the exact shape `routes/logger.js:102` writes:

| Assert | Proves |
|---|---|
| `dw.length === 2` | `[INFO] [download]` and `[WARN] [engine]` are filtered out |
| messages + order | stamp/level/category stripped, file order preserved |
| second call → `0` | dedupe — what makes a 5s poll printable instead of spam |
| fresh text, same `seen` → `1` | survives the 256 KB `app.log` rotation |

## Mutation-verified (an assert suite that never runs is a false pass)

A scratchpad copy with `dw.length === 2` flipped to `=== 3`:

```
self-check FAILED: only [download] WARN/ERROR surfaces — INFO and other categories are noise; got 2: remote install SSE closed (bad-response); 7 dep(s) outstanding — recovering | remote target inactive; failing 17 outstanding dep(s)
exit=1
```

The asserts execute, exit non-zero on failure, and extract the two right
messages. Scratchpad copy deleted.

## CLOSED — proven live, 2026-09-05

Superseded everything below. Two checks against the running app, read-only, no
Pod, no GPU.

**1. The parser, against the real `app.log`** (`scratchpad/check_live_log.mjs`,
importing the real `downloadWarnings` — the module is import-safe because
`INVOKED_DIRECTLY` guards `main()`):

```
app.log: 193330 bytes, 1543 lines (rotates at 256 KB)
lines matching the [stamp] [LEVEL] [category] shape: 1221
download-category lines present: download/INFO=3 download/WARN=15
downloadWarnings() extracted 15
second call over the same text: 0 (must be 0)
independent count of [download] WARN/ERROR lines: 15
MATCH — the parser agrees with an independent scan of the real log.
```

15 of 15, cross-checked against a scan written independently of the function, so
a regex silently matching nothing could not have passed as "no warnings today".
3 `download/INFO` lines and ~1200 shaped lines from other categories correctly
ignored. Dedupe holds on a real body.

The log still held the **2026-09-04 incident this card was written about** — the
brief's own four lines came back out of it:

```
⚠ [download] remote install SSE closed (bad-response); 7 dep(s) outstanding — recovering
⚠ [download] remote install silent for 94s with 1 dep(s) outstanding — treating as stalled
⚠ [download] remote install SSE closed (error); 17 dep(s) outstanding — recovering
⚠ [download] remote target inactive (remote inactive); failing 17 outstanding dep(s) …
```

(The last one's wording moved with MPI-691; the logged line predates that change.)
Also found a family the brief did not name: `remote dep reconcile failed:
wrapper status 404` ×4.

**2. The wiring** (`scratchpad/driver_wiring.mjs`, appended to a copy of the
runner with its `main()` call stripped — verified 0 remaining before running):
the real `waitReady(..., { watchLog: true })` drove the real
`drainDownloadWarnings()` from inside its poll loop against the live app. All 15
warnings printed in the intended `  ⚠ [download] <msg>` form, then two bare dots
for polls 2 and 3 — dedupe holding live — and the wait returned true normally.
`_seenDownloadWarnings.size === 15` afterwards proves the drain ran *inside* the
loop, not merely in the standalone call.

That is the brief's `## Verify` satisfied on real data rather than a fixture:
the line appears in runner stdout within one poll interval.

Footnote: this verification was blocked all morning by `guard-gpu` refusing any
command naming the runner — a plain `sed` of the file. MPI-697 fixed that, and
this is the first thing the fix paid for.

## Was: NOT verified — stated, not rounded up (superseded above)

**The wiring is verified by reading, not by execution.** `downloadWarnings()` is
proven by fixture. `drainDownloadWarnings()` (one `app('/logs/read')` call + a
loop) and the `if (o.watchLog)` branch in `waitReady()` have never executed.
The `--self-check` run does prove the whole module parses and loads — a bad
reference would have thrown at import — but not those two bodies at runtime.

Why it stopped there: driving them needs a fake `/logs/read` server and a copy
of the runner with `main()` stripped, and every Bash command naming
`scripts/smoke-workflows.mjs` is refused by `guard-gpu` (see below). Taking the
GPU lease for a command that uses no GPU, or renaming the path to slip the
regex, are both worse than saying the gap out loud. The brief's `## Verify`
allows "a synthetic `[download]` WARN in a fixture log", which is what ran.

## How this card closes

**Not on just any smoke run.** The 2026-09-05 release run (minimax-h3) proves
why: its volume was already full, so the install read

```
[09:10:06.336Z]   installing 9 deps on a CPU Pod (download mode)…
[09:10:06.337Z]   [1/1] minimax-h3
[09:10:07.000Z]   installs verified: no failed deps
```

One second, zero polls. The drain would have run at most once. A run that
re-verifies an already-filled volume can never close this card.

It needs a run that actually **downloads** weights. Expected: the music-maker
models (MPI-664 MiniMax Music 3, MPI-694 Stable Audio 3), which will be the first
new weights on the volume in a while. MPI-664 has been asked (message
`65ea3341`) to preserve the install section of `dev_configs/smoke-run.txt`,
which is opened with `'w'` and destroyed by the next run.

**Two-part closure, because absence is not evidence here:**

1. A clean download proves the drain polls without crashing or spamming — but a
   healthy install emits no `[download]` WARN at all, so "nothing printed" is
   also exactly what a totally broken drain looks like. That half is necessary,
   not sufficient.
2. The card is only really proven by a `⚠ [download] …` line actually appearing.
   Either one occurs naturally (SSE drops mid-install are common enough that
   MPI-97, MPI-690 and MPI-691 all exist because of them), or it is induced —
   `POST /remote/pod/delete-active` mid-download, on a small pinned volume,
   `--install-only`, no GPU rented, ~20 min. Not to be added to MPI-664's run.

A cheaper partial, available any time with no Pod: run `downloadWarnings()`
against the live app's `GET /logs/read` to prove it parses a REAL `app.log` —
format, stamps and rotation are the likeliest things to be wrong, and that check
costs one read-only GET.

## Volume headroom — may block the run that closes this

The same transcript measured `free 25.8 GB` on `cubric-smoke` (340 GB,
`uebvm3350f`). The fit verdict refuses a set that does not fit with 5% headroom,
*after* the CPU Pod is up. The music-maker deps may not fit. Flagged to MPI-664.

Live verification was refused by design, per the brief: GPU 0 is held by the
1.4.5 release matrix, and a live run rents a CPU Pod and pulls ~290 GB.

## Constraints honoured

- `dev_configs/` untouched — no `node_lock.json`, no `smoke-evidence.json`
  (claimed by MPI-687), no `smoke-run.txt`. The `smoke-run.txt` churn in
  `git status` is the peer's live run, not this card.
- One file changed: `scripts/smoke-workflows.mjs`, claimed in `files.json`
  before the first edit.
- The peer's run (`pid 17864`) read the file at import; a disk edit cannot
  reach it.
