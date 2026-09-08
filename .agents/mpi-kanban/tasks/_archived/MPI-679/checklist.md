# MPI-679 - checklist

- [x] Confirm the mirror URL really 404s and the R2 primary really serves the recorded sha256
- [x] Confirm the weight may be re-hosted (LTX-2 Community License) and that the siblings already are
- [x] Upload the exact R2 bytes to `vision/models/loras/ltx-2.3/ltx-2.3-22b-lora-foley-v2a-1.0.safetensors`
      on `Mad-Pony-Interactive/cubric-studio` (commit 28f55bab)
- [x] Verify the pushed `lfs.oid` equals the dep's `sha256`
- [x] `npm run release:deps` no longer reports `ltx23-lora-foley` (9 pre-existing Klein failures remain -> MPI-680)
