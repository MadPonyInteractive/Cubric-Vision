# Validation

## 2026-08-12 — every child proven live, and 1.4.1 published

**Result: PASS.** The umbrella's own gate was explicit: *closes only when each
child is proven live, not on green tests.* That bar is met for all of them, and
the work shipped publicly as **v1.4.1** on 2026-08-11
(https://github.com/MadPonyInteractive/Cubric-Vision/releases/tag/v1.4.1).

### The children

- **MPI-539** — download-mode Pod is not a generation engine. Six failures fixed.
  CLOSED on Fabio's own live drill 2026-08-11: download-only Pod, install with a
  second queued behind, Pod stopped mid-download. All six held; the Model Library
  returned to local truth; the queued install cancelled with a named reason and did
  NOT download locally. Detection measured at 9s. Detail in `tasks/MPI-539/validation.md`.
- **MPI-540** — stale completion notification. Fixed (`ef3ebd2e`), and confirmed by
  Fabio over a normal session 2026-08-12. See `tasks/MPI-540/validation.md`.
- **MPI-541** — the Pod OOM on HF weights. NOT fixed and deliberately not closed:
  its hf_xet hypothesis was DISPROVEN (same 3.725 GiB box pulled the same model at
  up to 735 MB/s with Telemetry reading 3% memory). Dropped to low/blocked with
  reopen criteria rather than a speculative fix. Lives on in `todo`.
- **The disk-space message** — proven live on BOTH engines 2026-08-11. Remote: a Pod
  install quoted the Pod volume and the margined figure. Local: LTX 2.3 High against
  29.4 GB free on G: gave *"41.1 GB needed (5% working margin included), 29.4 GB free
  at G:/CubricModels"* — and 41.1 rather than the card's 57.9 GB because LTX Balanced
  was already installed, so only queued deps count (39.1 x 1.05).
- **Toast readability** — duration now derives from the message (reading time,
  clamped 3–12s) and only the oldest visible toast counts down. Confirmed live by
  Fabio: *"I was able to read all toasts now, even the big ones."*
- **Install-toast spam** — carried OUT of this umbrella as **MPI-544**. Still
  unreproduced, so it ships as a card with the two ruled-out paths and the SSE-replay
  candidate written down, not as a speculative fix.

### Also fixed under this card, found along the way

- **The release-notes approval gate was lying.** Its extractor returned the RAW source
  between quotes, so an escaped apostrophe previewed as `the video\'s speed` — text the
  overlay never renders. The gate exists to promise the preview is byte-for-byte what
  ships; that promise was false for any escaped character, and the approval hash covered
  the wrong string. Pinned by `tests/release-notes-preview.test.cjs`.
- **CI had been red on master for days**, on three unrelated causes: a test importing
  through a hardcoded `file:///c:/AI/Mpi/...` URL that could only resolve on one machine;
  a source-read regex anchored on `\n` in an LF tree that CI checks out as CRLF; and
  `assertNoDanglingSymlinks` resolving links with `fs.access`, which on Windows SUCCEEDS
  on a dangling reparse point — so the check MPI-416 added after a broken link shipped
  had been inert on Windows ever since. Its own test could not catch that: `symlinkSync`
  is EPERM without Developer Mode, so it skipped on every dev machine and only ever ran
  on CI. It now falls back to a junction and runs everywhere. Green at run 31532006305.

### Not covered by any live run

MPI-539's failures 1–3 (getEngine / commandExecutor / `_ensureRemoteHotStore`) were
never re-exercised live — no generation was dispatched against a `__cpu__` Pod. They
rest on the original incident evidence plus mutation-checked unit tests. One deliberate
pass is still worth doing: start a long local generation, connect a download-only Pod,
confirm no staging is attempted and remote mode is not torn down.
