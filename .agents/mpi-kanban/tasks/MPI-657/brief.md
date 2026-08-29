# MPI-657 — the install queue's 30-minute ceiling is fixed, not size-derived

## What is wrong

`js/services/downloadService.js` (`_awaitDownloadDone`) hard-codes:

```js
// 30 min ceiling — longer than any single model download; a lost signal
// releases the queue instead of stalling it. MPI-395: say so.
const timer = setTimeout(() => { ... finish(); }, 30 * 60 * 1000);
```

**"longer than any single model download" is false**, and has been since the app started
shipping 20GB+ deps. The ceiling exists to release a serial install chain wedged by a LOST
terminal event (MPI-395). When it instead fires on a download that is still healthy and
streaming, it does the opposite of its job: it logs a phantom wedge and releases the chain
while the real download is still running.

## Evidence — it fired on a live install

2026-08-29, the MPI-653 acquisition. The app began the `minimax-h3-ref2va` install at
07:27:06Z, whose deps include `h3-qwen3vl-32b-clip` (24.55 GB). Exactly 30 minutes later:

```
[2026-08-29T07:57:06.864Z] [WARN] [downloadService] no terminal event for
minimax-h3-ref2va within 30min — releasing the install queue on the safety ceiling
```

The ceiling is keyed by MODEL id, not dep id — `_awaitDownloadDone(modelId)` — so it fires
against the whole install, however many deps are still streaming under it.

The dep cannot finish inside 30 minutes on the shipped transport at any plausible rate:

| transport | measured | 24.55 GB takes |
|---|---|---|
| `node-downloader-helper` vs HF `/resolve/main`, cold Xet (what the app uses) | 0.66–2.8 MB/s | 2.5–10 h |
| curl, 8 parallel ranges | ~5 MB/s | 1.4 h |

Every one is past the ceiling. So is any 20GB dep on a slow link — this is not an H3
problem, it is a size problem, and the catalogue has several (`ltx23-transformer-bf16`
39.13 GB, `minimax-h3-*-transformer` 19.53 GB each).

## What the firing did and did NOT do

**It did not delete anything.** `finish()` clears the listener set, resolves the chain
promise and decrements `_inFlight`. It writes no job status, issues no cancel, unlinks no
file. The partial that vanished from `G:/CubricModels/text_encoders/` that morning went to
a USER CANCEL at 08:49:36Z — 52 minutes after the ceiling — which is the MPI-317 resume
contract working as designed (cancel is intent, partial deleted). The log proves the two
are separate: five deps rejected that cancel because they had already finished
(`Illegal transition …: complete → cancelled (cancel) — rejected`), and the clip is absent
from that list because it was still downloading, so its cancel succeeded.

**Nothing was queued behind this install**, so this particular firing cost the user
nothing. The harm is structural, not observed on this log:

- With a second model queued, the released chain fires the next `/download/start` while
  the first is still streaming — breaking the "still only ONE aria2 download stream at a
  time, so no CPU-pod starvation" invariant the chain comment is written to guarantee.
- The WARN is a false wedge report, which is worse than silence: MPI-395 added that line
  precisely so a real wedge would be readable in a log.

## The fix — an IDLE ceiling, not a size-derived one

Reset the timer on every `download:progress` tick for this model rather than computing a
budget from `bytes`. The backend broadcasts `download:progress` with `modelId` on every
NDH chunk (`routes/downloadManager.js`), and `_awaitDownloadDone` already listens to that
event for the `phase === 'verifying'` finish — so the reset lands inside a handler that
already exists.

Why not bytes-derived: it needs an invented "pessimistic assumed rate" constant, and the
measured rates above span 0.66–5 MB/s — an 8× spread. That is the same guess as
`30 * 60 * 1000`, just wearing a hat; pick it wrong and the ceiling fires again. An idle
ceiling needs no size and no rate.

It is also strictly better on the criterion this card already argues: a genuinely lost
signal releases in 30 minutes flat, instead of the 10 hours a bytes-derived budget would
impose on a 39GB dep. "Do not just raise the constant" is an argument against
bytes-derived too — it is a per-dep raised constant.

Keep the MPI-395 log line — it is what made the original wedge diagnosable. Reword it to
say it is 30 minutes of NO PROGRESS, so the next firing is readable.

## Watch out for

- **The ceiling is a SAFETY NET, not the stall detector.** The real stall watchdog is in
  `routes/downloadManager.js` (MPI-291), and MPI-460's same-url retry sits between them.
  Do not merge the three or make this one shorter to "catch stalls faster".
- **The timer must exist before a listener touches it.** The handlers are registered above
  the `setTimeout` in the current code; a `timer.refresh()` in a listener that fires
  before that assignment is a TDZ throw inside an event handler.
- The remote/Pod path does not use this timer — it is the renderer-side chain release.

## Not in scope

Making the shipped LOCAL download transport faster. The Pod wrapper already takes the
Xet-native path (`docs/download-manager.md` MPI-491, measured ~350 MB/s avg on this exact
dep); `routes/downloadManager.js` still uses `node-downloader-helper` against the plain
`/resolve/` URL. Whether that gap should close is a separate question with its own
history — file it on its own evidence, not here.
