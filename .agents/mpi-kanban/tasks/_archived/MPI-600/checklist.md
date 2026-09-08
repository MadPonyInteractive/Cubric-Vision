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
      - [x] **Superseded by Leg D below**, which put `FluxKVCache` in the graph. Leg C's 1.00x
            was the correct reading of a graph with no cache node in it - not a KV measurement.
- [x] Leg D - the KV MULTI-REFERENCE speed leg, re-scoped by Fabio (`wf_type` 4, NO mask, an
      empty plate + two different people). 16 rows in `research/results_kv.md`. (2026-08-22)
      - [x] `FluxKVCache` wired as node **900**, inert until an arm opts in via
            `run.py --link 170.model=900,0`. Reaches branch 4 only; never the t2i path.
      - [x] Fixed inputs made on the bench: `plates/plate_empty_road_00001_.png` (empty) and
            `plates/ref_woman_00001_.png`, plus the existing `ref_man_00001_.png`.
      - [x] **KV is 2.40x at 2 refs and 3.18x at 3**, 1024x1024, sampler-only, both seeds within
            1 s. It scales with reference count. Ref count and resolution are on every row.
      - [x] **The speedup is the NODE - the `kv` weight alone is 1.00x.**
      - [x] **But the node needs the KV weight to be CORRECT.** `distilled+node` posts identical
            timings and VRAM and produces the wrong picture (plate replaced, references drift).
            `kv+node` holds both. Only visible in `research/kv_contact_sheet.png` - no column in
            the table separates them.
      - [x] VRAM is the binding constraint: cache costs +600-800 MiB, worst peak
            **16037 / 16380 MiB** at 3 refs (343 MiB headroom).
- [x] `research/results.md` - one row per run, sectioned CURRENT / SUPERSEDED / VOID so a
      voided row cannot be read as a verdict. Placement scored by eye off
      `research/S2_contact_sheet.png`, because the `guard` column reads a clean
      `green 0.00% / clip 0.1%` on all 18 S2 rows including every failed one.
- [x] `research/verdict.md` - **all four questions now answered.** SS4 and the Recommendation
      were rewritten after Leg D; the STATUS banner's item 1 is struck through.
- [x] **DECIDED 2026-08-22 (Fabio).** Ship `flux-2-klein-9b-int8-convrot.safetensors` + CLIP
      `qwen_3_8b_int8_convrot.safetensors`. One transformer, one text encoder, no LoRA, no
      toggle, **no KV**. `base` dropped; the Ripple review no longer gates the weight.
      - [x] **KV rejected.** The Leg D headline was corrected: 3.18x is the SAMPLER slice, but
            **1.27-1.46x end to end** (38.2 s -> 26.2 s at 3 refs). It also needs a SECOND 9.4 GB
            weight to stay correct and costs +600-800 MiB on a card with ~340 MiB of headroom.
            Fabio tested it independently on a pose request inside painting - same conclusion.
      - [x] Rejected weights deleted from `G:\CubricModels\`, ~27.6 GiB freed: the `kv` weight,
            both `base` copies, and `klein_9B_Turbo_r128`. Production weights untouched. All
            re-downloadable from the HF repos in `brief.md`.
      - [x] **Legs A/B/C/D can no longer be re-run** - those arms' weights are gone. `results.md`,
            `results_kv.md` and the contact sheets are the surviving record.
- [ ] Post the verdict onto MPI-598 as an event + brief section, then close this card.
