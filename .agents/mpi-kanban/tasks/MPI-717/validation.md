# MPI-717 Validation — umbrella close-out

Closed 2026-09-11. All three members shipped in phase order; this file records only that the
umbrella's own job — the ordering — held. Each member's evidence lives on its own card.

| Phase | Card | Evidence | Landed |
|---|---|---|---|
| 1 — telemetry | MPI-716 | `tasks/MPI-716/validation.md` | `ef011238` |
| 2 — retry budget | MPI-718 | `tasks/MPI-718/validation.md` | `43dab57a` |
| 3 — cancel race | MPI-719 | `tasks/MPI-719/validation.md` | this session |

The ordering was the reason for the umbrella and it paid twice:

- Telemetry first means MPI-718's effect is visible in lines MPI-716 added, not inferred from
  their absence — and it is what the beta user's next run will be read with.
- One harness, extended twice (`tests/download-retry.test.cjs`), rather than two built from
  scratch. Phase 2's own repro then found two live faults in the handlers Phase 1 had just
  instrumented — a replaced stream's late `'download'` crashing the main process on MPI-716's
  `__response` read, and its late `'error'` double-spending the budget. A fan-out would have
  split those across two sessions that could not see each other.

## What the umbrella leaves behind

- **The cause is wider than the cards' titles.** MPI-719's re-read showed only the first
  captured `models/check failed` follows a cancel; the second follows a dep *completing*, since
  `clearDownloadMarker()` on success removes a marker under the same unlocked walk. Recorded in
  the plan's drift note and in `docs/download-manager.md`.
- **`FileDownloader._bindEvents` now depends on a per-downloader identity guard** (`const dh`
  captured per handler, return when `this._downloader !== dh`). Any future work in those
  handlers must keep it or a replaced stream's late events crash the process again.
- **Two of the three fixes cannot be verified on this machine** — no link here sustains
  20-40 KB/s and no harness can fake the reporter's disk. **MPI-720** carries that: an
  unreleased 1.5.1 built off the release line, handed to him as a delta bundle.

## Members

Untouched by this close-out, as the umbrella contract requires — each closed on its own
evidence when its phase landed. The umbrella moves last and alone.
