# MPI-185 Checklist

- [x] Pin root cause (dequant.py:62 BF16 upcast spike on headroom-starved 24GB)
- [x] Confirm not a v0.27 regression (Wan+PiD clean on same Pod; GGUF path untouched)
- [x] Confirm Pod LTX is hard-GGUF (dependencies.js:305 / models.js:310), not VRAM-gated
- [x] DECISIVE: LTX i2v clean on 32GB 5090 (cu128) → OOM is 24GB-inherent → MPI-148 closed ✅
- [x] `--vram-headroom` is the fix knob (GB, aimdo-native); mechanism LIVE-PROVEN local 2026-07-04
      (headroom 4 dropped inference peak 14GB→stable 11GB, obeyed, gen clean; freed VRAM → RAM offload)
- [x] BAKED + SHIPPED: env-at-boot path DEAD (wrapper caches CUBRIC_VRAM_MODE in __init__:193,
      not re-read on restart-comfy; baked in image; shell export can't reach running wrapper).
      So baked gated default into start.sh (`VRAM_GIB -gt 0 && -le 24` → `--vram-headroom=1`;
      32GB+ untouched; env override still wins). Published R2 stable 2026-07-04; local SHA
      59f2e38 == manifest == live-served (13752 B, flag ×3). `=` form used (wrapper single-token).
- [x] POD CONFIRM DONE → ☠️ --vram-headroom=1 DISPROVEN (2026-07-04, live 24GB 4090 Pod, GGUF).
      Boot log confirmed the flag applied (detected 23GiB, start_sha matched); OOM'd ANYWAY,
      identical numbers: allocated 22.58 GiB / requested 576 MiB / device limit 23.64 GiB, in
      LTXVNormalizingSampler (=Stage1_Bypass, stage-1 sample time). VRAM plateaued 23.6/24, RAM
      climbed (offload happening) → OOM. Local "proof" was bf16 (aimdo-pool headroom); the GGUF
      +576MB is a raw torch alloc inside ComfyUI-GGUF/dequant.py:62, OUTSIDE aimdo's pool → the
      flag reserves the wrong allocator. Docs corrected (pod-perf-investigation.md § disproof).
- [ ] ESCALATE to the real 24GB levers (plan.md fixes 2-4, attack the dequant working set, NOT
      aimdo flags): (1) lower res/tier ceiling on 24GB, (2) smaller quant Q6_K/Q5_K_M per-tier,
      (3) bf16 transformer last-resort. `--vram-headroom=1` still baked in start.sh doing nothing
      useful → revert or repoint to the winning fix (needs another R2 push). NEXT SESSION.
- [ ] RAM-tradeoff caveat: headroom moves VRAM→system RAM. 24GB Pods have ~40-57GB RAM (less than
      local 64GB). headroom 1 (gentle) should offload little; watch for VRAM-OOM → RAM-OOM swap.
- [x] SHIP stage-2 sigma fix 0.65→0.85: user re-exported template (node #28 live sampler #39 =
      "0.85, 0.7250, 0.4219, 0.0"); ran generate.bat → 8 LTX workflows fanned + auto-verified
      (live 0.85 in all 8, old 0.65 = dead node #440 zero-consumers). 2026-07-04
- [x] Fold cloud-4090-slow perf datapoint into pod-perf-investigation.md
- [ ] Sub-issue (2): confirm/fix TAESD-None preview wiring on Pod (split if diverges)
- [ ] Sub-issue (4): gallery blob-404 revoke race in renderer (split if diverges)
