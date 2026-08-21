# MPI-568 Checklist

Derived from `plan.md` phase titles.

- [x] Correct the brief's premises
- [x] Build the standalone v2v upscale graph
- [x] Q1 + Q4 - does it run on 16 GB, and what does it cost
- [x] Q2 - sharpener or reconstructor (DECISIVE) - closed on the EYE, not the
      metric: the radial-FFT ratio did not survive its own no-sampler control
- [x] Q3 - does it keep an eye an eye - YES at sigma 0.50 (Fabio, 2026-08-19:
      "still an iris, not a square"), and the zipper survives too
- [x] Q5 - denoise, conditioning, drift. CORRECTED 2026-08-19: `sigmas` is NOT
      the change knob - it moves change and quality together, so 0.50 buys
      identity by giving back the reconstruction. Fabio's target is 0.85's look
      with a separate dial on drift
- [x] A change-control op that does not cost quality: detail transfer, measured
      and controlled against a matched unsharp mask. 63% less drift at full
      reconstruction; also attenuates the swim; no GPU, adjustable after the run
- [x] ~~Sweep the detail-transfer split radius, and try a face-region mask~~
      **MOOT - the whole detail-transfer line is CLOSED NEGATIVE.** Watched in
      motion it stamps the donor's expression onto the base ("eyes open and
      closed at the same time"), because sigma 0.85 regenerates the performance,
      not just the texture. The gate, the radius sweep and `band_split.py` all
      sat on top of it and close with it
- [x] The wavy distortion root-caused - LTX VAE round trip, ~2x amplified by the
      temporal upscaler, present at ~60% strength in the approved spatial arm
- [~] Output fps: `out_fps` added to build_v2v, but the remux of the existing
      clips FAILED (`-r` with `-c copy` cannot retime an mp4) and Fabio parked
      the fix until an upscaler is chosen
- [x] Ground-truth interpolation redone with legal 8n+1 counts (25 -> 49)
- [x] The temporal upscaler CLOSED and NEGATIVE - Fabio rejected both the frames
      it invents ("just a blob") and the frames it was handed ("undercooked").
      The hybrid arm was dropped rather than run: interleaving blobs with sharp
      real frames makes the defect more visible, not less
- [ ] **SHIP/NO-SHIP: sigma 0.50, 81 frames, watched in motion** - the swim is
      invisible on a still, and Fabio approved 0.50 from stills while separately
      saying the VAE alone messed up parts of the face
- [x] The x1.5 spatial arm - run at full length. It does NOT solve the VRAM
      ceiling (15484 MB peak vs x2's 15301 with 43% fewer pixels; peak is set by
      the transformer and VAE, not the target resolution). It IS 40% faster
      (157s vs 263s), so it is a preview-pass option, not the ceiling answer
- [x] A clean UNCONTENDED full-length re-time: 263s for 81 frames at 2x =
      97 s per second of footage
- [x] **Split-radius sweep - DONE and NEGATIVE.** r swept 2..20 on frames
      12/40/65 with a self-checked invention/reconstruction measure and its
      unsharp control. Radius is strength in disguise (every drift-matched
      strength twin sits at the same ratio) and lowering it is strictly worse
      (0.511 at r=2 vs 0.347 at r=10). Optimum is r=8-10; leave it at 10
- [x] Luma-only transfer arm - NEGATIVE. The veins are luma structures, not a
      red cast; draining the chroma leaves them in place
- [x] **The evidence gate built and rendered** - weight the transfer by the
      source's own local high-pass energy, so flat skin and flat fabric get
      nothing and the lash line/zipper get the model's full rendering.
      `radius_sweep.py` arm `g` + `transfer_clip.py` 6th arg `gate`, both
      self-checked. Full-length `FULL_gated132.mp4`, drift-matched to
      `FULL_detail100.mp4`
- [x] **FABIO'S EYES on `FULL_gated132.mp4` - PARTIAL PASS.** Veins gone;
      fabric speckles only partly gone (the "three dots" was an under-count from
      one crop); expressions lost; new face artifact that "feels like bad
      interpolation"
- [x] **THE POSITIVE PROMPT - CONFIRMED and fixed at source.** Ran sigma 0.85
      neutral and empty against the freckle arm already on disk, prompt the only
      variable. Fabio on `PROMPT_cheek_f12.png`: *"I can clearly see two moles,
      which probably were the model's attempt at doing freckles."* Neutral and
      empty cheeks are clean. Defaults changed in `build_v2v.py`, `sweep.py` and
      `full_arms.py`. It does NOT fix identity replacement at 0.85 - all three
      arms render the same different woman and the same button placket
- [x] **RE-BASELINE on the neutral prompt - DONE.** `nb_s050_x2` (294s) and
      `nb_s085_x2` (258s), 81 frames. The speckles are gone at source; every arm
      made before 2026-08-19 is contaminated
- [x] **SHIP/NO-SHIP - PASSED.** Fabio on `nb_s050_x2_00001.mp4` in motion:
      *"050 holds up motion. It's the best result we had so far."*
- [x] **0.85 stays ON the slider** - Fabio's call, correcting this card. Identity
      replacement and object deletion are trades a user picks at the top of a
      denoise range; identity LoRAs are another flow's job, out of scope here.
      Range ships 0.15-0.85; he expects 0.85 to suit animation/cartoons/anime
- [x] **THE SIGMA LADDER ON AN AI-GENERATED SOURCE - DONE.** Ran on
      `mpi568_ai_cowboys.mp4` (target 1) and on the 4.13 Mpx production upscale
      (target 2). Fabio picked 0.85 on target 1, 0.50-or-0.85 on target 2, and
      **narrowed the shipped range to 0.50-0.85**; the in-between ladder put
      0.675 at 41% of the way on BOTH source classes. **Default settled at 0.675
      by Fabio 2026-08-19**
- [x] **`cfg` raised, mapped and ranged - DONE.** It is not just "does the
      negative prompt do anything": unpinning cfg amplifies prompt steering 2.4x
      and became the card's SECOND slider. Range **1-3**, Fabio 2026-08-19, set
      by where the image breaks (cfg 5) and not by saturation. Neutral-vs-EMPTY
      as the shipped positive default is still the app card's product call
- [x] **THE CFG LADDER + ITS BASE-PROMPT CONTROL - DONE.** `cfg_range.py`
      (2/5/7, red-biker clause) and `cfg_base.py` (5/7, base prompt). Steering
      never saturates; the break is at cfg 5, not the predicted 7; and the base
      control proves the damage is cfg's, not the contradictory prompt's
- [ ] Temporally smooth the gate (average over 3-5 frames or hold from one) and
      re-render - the leading explanation for the interpolation-like artifact.
      Zero GPU
- [ ] Ground-truth invented-texture test - now doubly needed, as the ONLY
      independent check on the gate (`band_split.py` shares the gate's statistic
      and may never score it)
- [ ] `LTXVAddGuide.attention_mask` - deprioritised; only matters if 0.85's look
      is still wanted, and 0.85 now has three marks against it
- [ ] Clip B cross-check
