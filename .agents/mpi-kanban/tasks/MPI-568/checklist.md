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
- [ ] Sweep the detail-transfer split radius, and try a face-region mask
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
- [ ] **THE POSITIVE PROMPT - re-run sigma 0.85 neutral and empty.** The graph
      has conditioned on ".. natural skin texture, freckles, sharp eyes" on every
      arm of this card, i.e. it has been ASKING for the speckles. Uncontrolled
      variable upstream of every measurement here. Also `cfg: 1` makes the
      negative prompt inert. ~1 min GPU per arm, shared card, ask first
- [ ] Temporally smooth the gate (average over 3-5 frames or hold from one) and
      re-render - the leading explanation for the interpolation-like artifact.
      Zero GPU
- [ ] Ground-truth invented-texture test - now doubly needed, as the ONLY
      independent check on the gate (`band_split.py` shares the gate's statistic
      and may never score it)
- [ ] `LTXVAddGuide.attention_mask` - deprioritised; only matters if 0.85's look
      is still wanted, and 0.85 now has three marks against it
- [ ] Clip B cross-check
