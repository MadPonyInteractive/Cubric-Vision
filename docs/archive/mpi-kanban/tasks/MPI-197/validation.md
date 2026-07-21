# MPI-197 Validation

2026-07-05/06 — USER-VERIFIED LIVE, real app flow, both pod types (ephemeral d6z4siy8h4z789 + volume h7lo80x4819i00, both 5090, .expose-comfy door):
- 10s 1216x704 t2v+loras warm gap 31-34s / totals 107-179s (cold-load explains delta); 20s gap 77s / 209s; vs morning old-runtime 111s@10s / 620s@30s.
- UI time == pod /history to the second, 6/6 runs. User's own repeated app-vs-browser total A/Bs: always close, app sometimes faster.
- Per-phase pod log (/internal/logs/raw): boundary region 48.4-48.9s constant, submitter-independent; step-1 fault-in = page-cache warming trend (44->20.3s).
- Lora-rewire hypothesis live-DISPROVEN (boundary 48.4->63.2s worse). Stage-2 stays lora-less.
- Fix attribution: runtime stack shipped 03:30-04:46 2026-07-05 (wrapper 0.2.24 loop fixes + MPI-193 dedupe + MPI-194 hot-store); not isolated per-fix, gap gone.
Residual floor (48s@10s) = structural bf16-on-32GB eviction — addressed by quant tiers (research/quant-tiers.md, new card).
