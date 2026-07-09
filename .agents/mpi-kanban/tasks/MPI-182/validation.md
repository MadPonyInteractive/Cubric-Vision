# MPI-182 Validation

**Status: VALIDATED (user-confirmed in-app, 2026-07-03).**

- PiD model appears in the dropdown; controls (Model / Output / Denoise) render; gear hidden.
- Upscale runs and OUTPUT CAPTURES (was the "no output" bug — fixed via `Output_Image`
  tier-2 capture alias in commandExecutor, no workflow re-export needed).
- 4 VAE paths (Flux/SD3/Qwen/SDXL) live-tested during authoring; non-square preserved
  (2016×1152 → 4096×2304); 1K/2K/4K output; denoise→degrade_sigma.
- Deps + 9 R2 uploads (HEAD byte-verified); hashes filled in a separate session commit (ddd3f04).
- Self-verified: parse cross-ref (deps resolve), ESLint clean, injection path traced.

**Deferred (separate session, user note):** small UI polish items on the PiD panel +
other unrelated small UI issues. Not blockers — core function verified working.

User verdict: "all is well" + explicit approval to close via mpi-end.
