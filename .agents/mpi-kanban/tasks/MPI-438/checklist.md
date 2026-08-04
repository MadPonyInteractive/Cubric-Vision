# MPI-438 Checklist

- [x] Diagnose + sweep the blast radius (brief.md — 2 live-broken ops, 1 structural)
- [x] Implementation — `ensureUniversalNodesOnVolume()` + the connect hook
- [x] Unit test — the code-only universal packs are selected, baked ones excluded
      (3 sabotages caught; a 4th found DEAD CODE and removed it — see validation.md)
- [x] Suite green — 390 tests, 0 fail; eslint 0 errors / 0 new warnings
- [ ] LIVE verify on the next Pod boot (folds into MPI-413's image test): a volume
      with no Wan 2.2 and no Klein/Boogu runs Resize Video AND Head Swap
