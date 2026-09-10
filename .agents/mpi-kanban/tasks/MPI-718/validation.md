# MPI-718 — validation

Executed 2026-09-10. MPI-717 Phase 2.

## The bug, reproduced before any fix

`tests/download-retry.test.cjs`, six blips of 32 KB across a 200 KB body, every blip
preceded by real bytes landing:

```
retry 1/3 ... retry 2/3 ... retry 3/3
AssertionError: six blips with progress between them must finish, ended failed:
  Download stalled — no data received.
```

Terminal on the fourth blip, partial kept, SHA never checked — exactly the shape the
brief traced in code and the capture showed in the wild.

## After the fix

`node tests/download-retry.test.cjs` → **7 passed**:

- a killed connection retries the same url and resumes from the partial (MPI-460, unchanged)
- a slow-but-alive stream warns exactly once (MPI-716, unchanged)
- the write probe fires once off that latch and cleans up (MPI-716, unchanged)
- a write probe that throws logs, resolves, leaves nothing behind (MPI-716, unchanged)
- **six blips with real progress between them complete, budget reset each time** — every
  one of the six WARN lines reads `retry 1/3`, every request resumes from the previous
  offset, and the finished file matches the expected sha256
- **zero bytes on disk still fails immediately** — `_attempts === 0`, one request, no
  retry bought (MPI-427 gate unmoved)
- **a dribble under the floor never resets and still dies at 3/3** — the lines count
  `1/3, 2/3, 3/3` and the dep goes terminal, which is why no separate attempt cap exists

`npm test` → **917 pass, 0 fail** (`tests\download-retry.test.cjs` runs inside it, green).
`npx eslint routes/downloadManager.js tests/download-retry.test.cjs` → clean.

## The line the captured log would have carried

Re-read the two captures (kept outside git). **Two** deps hit this, not one:

| dep | retry 1 resumed from | retry 2 resumed from | apart | reads today | would read |
|---|---|---|---|---|---|
| `qwen3-8b-clip` | 2.56 GB | 3.42 GB | 0.86 GB | `retry 2/3 in 5s` | `retry 1/3 in 2s` |
| `klein-9b-transformer` | 2.03 GB | 3.00 GB | 0.97 GB | `retry 2/3 in 5s` | `retry 1/3 in 2s` |

Both gaps are ~100x the 8 MB floor, so both hand the budget back. Under the old code one
more blip on either would have failed the install with 3.4 GB / 3.0 GB of good bytes on
disk.

## Found while reproducing — folded in, same file, same handlers

`_rearm()` swaps `this._downloader` while the old NDH request is still in flight, and
every handler closes over `this`, so the replaced stream's late events landed on the
live one. Both faults were reproduced by the multi-cut harness before being fixed:

1. **Uncaught `TypeError: Cannot read properties of null (reading '__response')`** — a
   late `'download'` hitting MPI-716's peer/POP read after `_rearm()` nulled the field.
   In production this kills the Electron main process, not a test.
2. **One blip spending TWO attempts** — a late `'error'` from the replaced stream logged
   `retry 2/3` 4 ms after `retry 1/3`. Directly the budget this card is about, miscounted
   at source.

Each handler now captures its downloader at bind time and returns when it is no longer
the current one.

Also measured, and the reason the new cases hold a socket open instead of killing it:
NDH's `resumeOnIncomplete` defaults to **true** with `resumeOnIncompleteMaxRetry: 5`, so
a socket that DIES mid-body is silently re-requested up to five times inside the
downloader — five server requests for two logged retries. Our budget never sees it.

## Not verified here

No live install was run against a real blippy link; the behaviour is proven by the
harness driving the real `FileDownloader` plus the two captured logs. Phase 3 (MPI-719,
cancel race) is untouched.
