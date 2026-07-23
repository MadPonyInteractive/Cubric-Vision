# MPI-329 Checklist

- [x] Root-cause the switch cost (live 4090) — network-volume read for fits-VRAM models
- [x] Rule out torch-minor, dup node packs, --highvram, API path
- [x] Prove disk-staging fix (Krea2/Qwen swap 3-19s vs 80s volume)
- [x] Draft the fix (threshold 0.1 + wrapper floor env + disk 150)
- [ ] Settle open design decisions (disk size, stage scope, LTX exclusion, trigger)
- [ ] Live-verify end-to-end through the app (restart app -> fresh pod -> switch)
- [ ] Commit + close
