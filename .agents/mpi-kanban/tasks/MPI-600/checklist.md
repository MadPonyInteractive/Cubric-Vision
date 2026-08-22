# MPI-600 Checklist

Derived from `plan.md` (the legs), 2026-08-22.

- [x] Leg 0 - INT8 9B confirmed running 1024x1024 on the 4060 Ti; peak VRAM, the one
      fixed CLIP and the one fixed VAE written into `research/format.md` (2026-08-22)
- [x] Scenarios - **3** stress scenarios + 3 fixed seeds written into `research/scenarios.md`
      and never edited mid-bench (2026-08-22; scenario 1 dropped by Fabio - the localised
      edit already covers character replacement). 9 runs per candidate, not 12.
- [~] Leg A - 9B base vs base+turbo swept by strength (1.0 / 0.7 / 0.25-0.5); concludes
      whether `turboToggle` is a toggle or a slider
      - [x] The open question is CLOSED - rank-128 turbo LoRA DOES apply to an INT8 ConvRot
            base (121 patches attached vs 0; no unmatched keys). fp8 not forced. (2026-08-22)
      - [x] The base weight had to be CONVERTED first - the downloaded file cannot be loaded
            by native ComfyUI at all. Use `...-convrot-comfy.safetensors`. (2026-08-22)
      - [x] Pass 1 ran the full 36-row matrix into `research/results.md` (2026-08-22)
      - [ ] **Pass 2 owed - 27 of those 36 rows are INVALID.** Node 52 zeroed the negative, so
            every arm at cfg > 1 blew out. Re-run `base`, `turbo-070`, `turbo-035` with
            `--set 52.boolean=false`. The 9 `turbo-100` rows stand.
      - [ ] **S2 never tested any arm** - branch 5 hardcodes 2 steps / cfg 1, so every Leg A
            S2 output is a failed edit with the green fill still in it. Run
            `sweep.py --s2-regime`. Both traps: `research/format.md` SS Leg A pass 1.
- [ ] Leg B - does base+turbo@1.0 reproduce distilled, and do intermediate strengths reach
      quality distilled cannot; decides one checkpoint or two
- [ ] Leg C - 9b-kv vs the leg-B winner, edit ops only; quality parity AND the honest
      speedup at our own ref count and resolution
- [ ] `research/results.md` - one row per run, four axes scored independently
- [ ] `research/verdict.md` answers all four deliverable questions, posted onto MPI-598
