# MPI-191 Validation

**Root cause LIVE-PROVEN 2026-07-05** (same-pod bisect, 5090 32GB / 190GB-RAM host, v0.12.0, bf16):

- Network volume dd: 750 MB/s. Weights on volume: warm gap 36-39s, cold 280s, warm full 81s.
- Same pod, transformer cp'd to container disk: **warm gap 9s, cold 128s, warm full 47s.**
- Acquitted by direct measurement (do NOT re-test): wrapper (direct-8188 identical), launch
  flags, dup/stale node packs (removed → 38s), ComfyUI 0.27-vs-0.26.2 (in-place rollback → 36s),
  torch minor, hardware, aimdo version.
- Mechanism refined by user counter-evidence: re-fault reads fastest tier holding the bytes
  (page cache → disk → volume); stock test was cache-warm by accident (386GB RAM +
  just-downloaded files). Full trail: docs/builder/research/pod-perf-investigation.md SOLVED banner.

**The card's original premise ("pin resident via aimdo") is DEAD** — the fix is storage-tier,
not allocator: carded as **MPI-194** (>=15GB hot-store to disk, sticky, user-settled design).
Shipped under this card: wrapper 0.2.24 hardening (stats readers off the event loop,
stdout single-decode) — published to R2 stable.

Close-out decision for the user: mark MPI-191 done as "root-caused + fix carded (MPI-194)",
or keep in doing until MPI-194 ships. Side-effect to remember: the test volume still has packs
parked in /workspace/_disabled_nodes/ (user replacing the volume anyway).
