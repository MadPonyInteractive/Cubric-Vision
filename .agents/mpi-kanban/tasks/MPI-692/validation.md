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

## NOT verified — stated, not rounded up

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

**First real evidence** will be the next live smoke run: `⚠ [download] …` lines
appearing under the dots during the install phase, and `dev_configs/smoke-run.txt`
carrying them beside the transcript.

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
