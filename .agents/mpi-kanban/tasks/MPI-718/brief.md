# MPI-718 — the same-url retry budget never resets

> **This is a code trace, not executed.** Every claim below was read off the working tree
> and two captured logs on 2026-09-10; nothing was run. Repro is step one.
>
> Umbrella: MPI-717, Phase 2 — lands AFTER MPI-716's telemetry, which instruments the same
> `FileDownloader` handlers and builds the harness this card's test extends.

## What the log shows

A beta user's `app.log`, 2026-09-10 (kept outside git:
`C:/AI/Mpi/_private/cubric-download-telemetry/`). One dep, `qwen3-8b-clip`, on a link
that blipped twice in six minutes:

| time | line | resumed from |
|---|---|---|
| 17:26:26 | `Download stalled — no data received. — retry 1/3 in 2s (resumes from disk)` | 2.56 GB |
| 17:32:36 | `aborted — retry 2/3 in 5s (resumes from disk)` | 3.42 GB |

0.86 GB landed between the two blips, and the budget still read 2/3. One more blip and
3.42 GB on disk goes terminal: `_setDepStatus(..., 'failed')`, the partial kept but the
install failed, the user told to retry a download that was working.

## Where it is

`FileDownloader` in `routes/downloadManager.js`:

- the constructor sets `this._attempts = 0` — the ONLY reset;
- the `'error'` handler reads `RETRY_BACKOFF_MS[this._attempts]`, and when the dep has
  bytes on disk and the error is not a definite 4xx, increments `_attempts` and re-enters
  `download()` after the delay;
- `_rearm()` resets the stall clock (`_lastBytes`, `_lastByteTs`) for every restart — and
  not `_attempts`.

So `[2s, 5s, 15s]` is a per-FILE lifetime budget. MPI-460's own comment says what it was
designed against: *"a transient blip is not a verdict"* — one 60 s hiccup that discarded
8.4 GB. It assumed a blip is rare. On a link that blips every few minutes a 25 GB dep
cannot finish, however well it streams in between. This amends that assumption; it does
not contradict it.

## What must NOT change

- **The MPI-427 gate.** `hasProgress` — bytes on disk — is what keeps a route that never
  delivered anything from buying 22 s of silence before the remedy the user needs to read.
  A reset on progress cannot touch the zero-bytes case, by construction.
- **The budget's size.** `docs/download-manager.md` (MPI-480) says outright: do not fix a
  class of bug by widening the retry budget. This card keeps three attempts and changes
  what they are counted against — three failures WITHOUT progress, not three per file.
- **The mirror walk.** A failover to a mirror "spends its own walk" (`_triedUrls`); leave
  that alone.

## The fix, in shape

Record the byte offset at which an attempt was spent (`_attemptBytes` set in the `'error'`
handler beside the increment). In the `'progress'` handler — the one MPI-291 already uses
for the stall clock — when `stats.downloaded` has moved past `_attemptBytes` by more than a
floor, set `_attempts = 0`.

**The floor is the decision, and it comes from the log, not from taste.** Between the two
blips 0.86 GB streamed; a resume that dies on its first chunk moves a few KB. A floor of a
few MB separates them. The trap on the other side: a stream that delivers a trickle and
dies every 22 s would now retry forever. Two answers, pick one and write it on the card —
a hard ceiling on total attempts per file as a safety net, or accept the trickle case as
exactly the pathology MPI-716's slow-stream WARN exists to make visible. Do not add a
second observer; MPI-657 already warns against merging the ceiling, the watchdog and the
retry.

## Repro — step one

Extend `tests/download-retry.test.cjs` (it drives the REAL `FileDownloader` against a
local `http` server that cuts the body and answers the follow-up Range request):

1. Server cuts the body FOUR times, serving more than the floor between cuts. Today: the
   fourth cut is terminal — dep `failed`, partial on disk, SHA never checked. That is the
   bug, reproduced before any edit.
2. Same server, three cuts with ZERO bytes served each time. Today and after: terminal at
   3/3. That is MPI-427, and it must not move.

After the fix, case 1 completes with the SHA matching and `requests` showing every Range
resume; case 2 is unchanged.

## Verify

- `node tests/download-retry.test.cjs` — both cases.
- Re-read the captured log: with the reset, the 17:32 blip would have read `retry 1/3`,
  not `2/3`. Name that line in the close-out.
- `docs/download-manager.md` § NDH Download Gotchas / the MPI-460 note: the budget's unit
  changed; say so where the old rule is written.

## Not in scope

- The stall watchdog window (`STALL_MS`), the socket-inactivity `timeout`, the concurrency
  cap — none is the variable here.
- Making the transport faster (MPI-657 Not-in-scope; MPI-716 produces the evidence for it).
