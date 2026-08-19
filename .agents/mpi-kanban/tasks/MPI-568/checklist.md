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
- [ ] `LTXVAddGuide.attention_mask` - deprioritised; only matters if 0.85's look
      is still wanted, and 0.85 now has three marks against it
- [ ] Clip B cross-check
