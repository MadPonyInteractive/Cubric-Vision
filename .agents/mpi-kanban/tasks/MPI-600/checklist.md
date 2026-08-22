# MPI-600 Checklist

Derived from `plan.md` (the legs), 2026-08-22.

- [x] Leg 0 - INT8 9B confirmed running 1024x1024 on the 4060 Ti; peak VRAM, the one
      fixed CLIP and the one fixed VAE written into `research/format.md` (2026-08-22)
- [x] Scenarios - **3** stress scenarios + 3 fixed seeds in `research/scenarios.md`.
      **S2 was corrected THREE times on 2026-08-22 by Fabio** and every earlier S2 row is
      void or superseded. It is now: `wf_type` **4** + a **BOX** mask + the man supplied as
      **image 2** (node 236). Detail: `research/format.md` SS "Leg A pass 2".
- [x] Leg A - 9B base vs base+turbo swept by strength (1.0 / 0.7 / 0.35) (2026-08-22)
      - [x] The open question is CLOSED - rank-128 turbo LoRA DOES apply to an INT8 ConvRot
            base (121 patches attached vs 0; no unmatched keys). fp8 not forced.
      - [x] The base weight had to be CONVERTED - the downloaded file cannot be loaded by
            native ComfyUI at all. Use `...-convrot-comfy.safetensors`.
      - [x] Node 52 fixed - `sweep.py` now sets it from the arm's cfg, so the zeroed-negative
            blowout cannot recur by default. Re-verified by eye at the same seed.
      - [x] Full matrix re-run on the corrected scenario. **`turboToggle` is NOT a real
            control**: the base arm is 6-7x slower than distilled AND scores 0/3 on placement;
            intermediate strengths are worse than 1.0. No monotonic quality/speed axis exists.
- [x] Leg B - base+turbo@1.0 vs distilled. **Answer: ONE checkpoint.** turbo@1.0 matches
      distilled's 2/3 placement but needs 8 steps / 32-48 s against 4 steps / 20-28 s, plus a
      second file to host and version. It buys nothing. (2026-08-22)
- [~] Leg C - 9b-kv vs the Leg B winner. **The weight was benched; KV ITSELF WAS NOT.**
      - [x] `kv` loads, runs, and is quality- and VRAM-indistinguishable from distilled (2/3
            placement, same wall clock).
      - [ ] **`FluxKVCache` is not in the bench graph**, so no caching path was active and the
            measured 1.00x is meaningless as a speedup. Wire it on the KV arm only, keep it off
            the t2i path, and record ref count + output resolution per row. Note our S2 shape
            carries TWO images (plate + reference), so BFL's 2-ref row (1.77x) may apply rather
            than the 1-ref row (1.40x).
- [x] `research/results.md` - one row per run, sectioned CURRENT / SUPERSEDED / VOID so a
      voided row cannot be read as a verdict. Placement scored by eye off
      `research/S2_contact_sheet.png`, because the `guard` column reads a clean
      `green 0.00% / clip 0.1%` on all 18 S2 rows including every failed one.
- [x] `research/verdict.md` - answers Q1, Q2, Q3. **Q4 (KV multiplier) is explicitly NOT
      answered**, with the reason, rather than a 1.00x being banked as a finding.
- [ ] Post the verdict onto MPI-598 as an event + brief section, then close this card.
      **Blocked on Fabio's call:** run the KV leg properly first, or hand Q4 to MPI-598 as an
      open item? The weight recommendation does not depend on it.
