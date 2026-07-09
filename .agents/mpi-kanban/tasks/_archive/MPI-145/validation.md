# MPI-145 (+ MPI-146) Validation

## Fix
Baked sage per-arch + per-card VRAM into the product Pod (mpi-ci), one v0.10.0 image.

1. **`cubric-vision-pod/Dockerfile`** — new RUN after the torch branch source-builds
   sageattention with `TORCH_CUDA_ARCH_LIST` split by `CUDA_PROFILE` (cu124 `8.6;8.9`,
   cu128 `12.0`, cpu skip), `git+thu-ml/SageAttention.git --no-build-isolation MAX_JOBS=4`,
   `pip install triton`. Non-fatal on failure (SDPA fallback). WRAPPER_VERSION ARG
   `0.2.14→0.2.16`. Stale "runtime-installed" comments fixed.
2. **`cubric-vision-pod/start.sh`** — removed the runtime `pip --target` compile +
   `.sage_arch` volume cache. New single python probe: sage import test + total VRAM
   (GiB). Exports `CUBRIC_USE_SAGE` (unchanged contract) + `CUBRIC_VRAM_MODE`
   (`>=32GB --normalvram`, else `--lowvram`, default `--lowvram` on detection failure).
3. **`cubric-vision-pod/wrapper/wrapper.py`** — `self.vram_mode` from `CUBRIC_VRAM_MODE`;
   `_build_cmd` uses it instead of hardcoded `--lowvram`. Version `0.2.15→0.2.16`.
   Spawn log shows sage + vram.
4. **`routes/remoteProxy.js`** (app) — POD_IMAGE `v0.9.1→v0.10.0`, WRAPPER `0.2.15→0.2.16`;
   stale sage comment fixed.
5. **`cubric-vision-pod/README.md`** — v0.10.0 block (MPI-145/146/152), pylibs/start.sh
   layout notes corrected.

## Root cause (MPI-145)
The runtime `pip install sageattention --target` in start.sh had NO `TORCH_CUDA_ARCH_LIST`.
sage's setup.py probes GPU compute caps at build time; in a GPU-less / arch-undeclared
build it aborts ("No target compute capabilities"). start.sh swallowed it non-fatal →
empty pylibs → `import sageattention` ModuleNotFoundError → no `--use-sage-attention` →
every Pod ran SDPA. triton was NOT the blocker on the Pod (ships with torch on Linux);
the missing arch list was the sole cause. Both Pod bases are `-devel` (nvcc present), so
baking the build at image time is correct + faster (no 5-15min first-boot compile).

## Self-verify (PASS, 2026-06-26)
- start.sh `bash -n` clean.
- Probe parse logic tested standalone, 6/6: `1 40`→sage+normalvram, `1 24`→sage+lowvram,
  `0 0`/empty→SDPA+lowvram, `1 32`→normalvram, `1 31`→lowvram. The `2>/dev/null` on the
  `-ge 32` test guards non-numeric VRAM → safe lowvram fallback.
- wrapper.py `ast.parse` clean.
- remoteProxy.js `node --check` clean.
- app `release:check` PASSED.
- Env-handoff chain confirmed: start.sh exports CUBRIC_USE_SAGE/CUBRIC_VRAM_MODE →
  wrapper reads both → `_build_cmd`.

## Still to verify (REMOTE — needs the v0.10.0 Pod build; user-gated)
**Verify mode: user-ux.** Real proof = build v0.10.0 + live Pod:
- **cu124 / 4090:** cmdline shows `--use-sage-attention` AND `--lowvram`; the i2v that
  OOM'd pre-MPI-144 completes; sage sampling faster than the v0.8.1 SDPA baseline.
- **cu128 / 5090:** cmdline shows `--use-sage-attention` AND `--normalvram`; sampling
  faster (sage) + load faster/equal (normalvram vs the blanket-lowvram baseline).
- If Blackwell sage misbehaves (wrong output / crash), gate sage off cu128 only and
  re-verify (plan decision 2) — do not pre-disable on a guess.
- This same build also carries MPI-152's `/wrapper/history` (0.2.15) → verify the
  reconnect-reconcile (`Reconciled completed gen` in logs/app.log on a WS blip) here too.

## Preservation (add via mpi-end)
- gotcha: "Pod sage must be BAKED per-arch (`TORCH_CUDA_ARCH_LIST` split by CUDA_PROFILE);
  the runtime `pip --target` bootstrap silently produced nothing (arch-list missing) →
  SDPA fallback. Both Pod bases are `-devel` so nvcc is present at build time. triton is
  NOT the Pod blocker — it ships with torch on Linux (the 'no triton' was the local
  Windows engine)."
- gotcha: "Pod VRAM mode is per-card — `<=24GB --lowvram`, `>=32GB --normalvram`; blanket
  lowvram (v0.8.1) taxed 32GB+ cards with needless VRAM↔RAM streaming."
