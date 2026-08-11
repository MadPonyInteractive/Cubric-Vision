# MPI-542 - checklist

Closed only when every child is fixed AND proven live. Two of the three roots were
themselves patched fixes with holes; green tests are not the bar here.

- [x] MPI-539 - download-mode Pod is not a generation engine. Six failures, fixed,
      560/560, every guard mutation-checked. Commits 629ab6cb, a75c8a3e.
- [x] MPI-539 - live proof. Fabio ran the drill himself 2026-08-11: download-only Pod,
      install with a second queued behind, Pod stopped mid-download. All six failures
      held; Model Library returned to LOCAL truth; the queued install cancelled with a
      named reason and did NOT land locally. Detection measured at 9s. Full write-up in
      tasks/MPI-539/validation.md. Residual: failures 1-3 were never re-exercised live
      (no generation was dispatched against the CPU Pod) - they rest on the incident
      evidence plus mutation-checked tests.
- [x] The disk-space message. Both gates now print the number the gate USED (margin
      included) and set `toast: true`; the client shows a server-authored message
      verbatim, checked BEFORE the out-of-space matcher that was swallowing it. The
      remote case names the Pod volume instead of telling you to free local space.
      562/562, both guards mutation-checked.
- [ ] The disk-space message - live proof. Local: install a model bigger than the free
      space on G: and read the toast. Remote: install onto the ~140/150GB Pod volume.
- [x] MPI-540 - stale completion notification. Fixed, mutation-checked. Commit ef3ebd2e.
- [ ] MPI-540 - Fabio confirms no late completion toast over a normal session.
- [ ] MPI-541 - the Pod OOM on HF weights. Open. Evidence step named on the card.
- [x] The install-toast spam is carded as MPI-544 and OUT of 1.4.1. Still unreproduced;
      the card carries the two ruled-out paths and the SSE-replay candidate so nobody
      re-walks them. Unreproduced means unfixable, not ignored - a speculative fix here
      is a guess at a mechanism nobody has observed.
- [x] Toast readability. Duration now derives from the message (reading time, clamped
      3-12s) and only the oldest visible toast counts down - reading is serial, so two
      live timers meant the second expired mid-read. Also fixed the FIFO drain it
      depends on. Commits 2730a7b8, 1eba614a. CONFIRMED LIVE by Fabio: "I was able to
      read all toasts now, even the big ones."
- [ ] Local disk-full message - live proof. The REMOTE half is proven (Fabio's Pod
      install, toast quoted the volume and the margined figure). The local half shares
      the same client arm; only the server string differs. Cheapest check: local engine,
      Install on Qwen Image Edit (32.1 GB) against ~29 GB free on G:.

## The app needs a restart before any of this is re-tested

`routes/downloadManager.js` changed, so a renderer reload does not pick it up.
