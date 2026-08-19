# MPI-578 - LTX 2.5 upscaler adoption

**Blocked on the ComfyUI engine bump.** Do not start before it lands.

## The job

MPI-568 shipped an LTX **2.3** spatial upscale op. This card moves it to 2.5's
upscalers once the engine supports them. Fabio's sequencing, 2026-08-19: ship v1
on 2.3 now, bump later.

## Order of work

1. **Read the safetensors header first.** Confirm
   `post_upsample_res_blocks.0.conv2.bias` and the `config` fields
   (`spatial_upsample`, `temporal_upsample`, `spatial_scale`,
   `rational_resampler`, `mid_channels`). Everything downstream assumes this and
   nobody has checked it. 30 seconds; it decides whether this is a weight swap or
   node work.
2. **Re-run the VAE round-trip arm on the 2.5 DiffVAE.** This outranks the
   upscaler itself - see the card description. `warp_arms.py` from MPI-568's
   scratchpad is the instrument.
3. **Re-run the sigma ladder** on both source classes and re-pick the default.
4. **Re-measure peak VRAM.** MPI-568's numbers: 14.9-15.9 GB of 16.4 across
   sources from 0.41 to 1.03 Mpx, i.e. the transformer dominates and source size
   barely moves it. Confirm that still holds - 2.5's DiffVAE adds a decode stage
   and may not be free.

## Do not re-open without new evidence

The detail transfer and its evidence gate, the split radius, and the temporal
upscaler are all CLOSED NEGATIVE on MPI-568 for reasons that are properties of
the method rather than of 2.3. Read that card's plan before reviving any of them.

## Blocked by

The ComfyUI engine bump. Bench evaluation additionally needs
`/mpi-bump-local-comfy`; shipping needs `/mpi-bump-engine`.
