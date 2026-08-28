# MPI-639 — validation

## Root cause (two, independent)

**1. The cache could not work on boot.** `resolveDownloadConfig` stored the
RESULT, assigned after the `await`. The two boot callers — `GET /system/stats`
and `GET /system/gpu-info`, both fired by the landing hero stat slots — arrive
~30 ms apart, so both read `null` and both ran a full detection. Confirmed in the
pre-fix log: `Starting GPU detection...` twice per boot, every boot.

**2. One WMI answer, fetched twice, whether or not it was needed.**
`detectAmdGPU` and `detectIntelArcGPU` issued the *same*
`wmic path win32_videocontroller get name` and tested the same stdout with two
different regexes — and sat in a `Promise.all` beside the NVIDIA probe, so they
ran even after `nvidia-smi` had already named the card.

2 × (2 nvidia-smi + 2 wmic) = **8 spawns**, ~200 ms each for the WMI ones.

## Fix

- Memoize the in-flight **promise** (`_gpuDetectionPromise`), not the result, so a
  concurrent second caller awaits the first one's work. The memo is dropped if
  detection throws, keeping the old retry-on-failure behaviour.
- One `detectWmiGPUs()` returning `{hasAmd, hasIntel}` from a single `wmic` call,
  awaited **only when NVIDIA found nothing**. Sequential costs nothing where it
  matters: a machine with no NVIDIA card has no `nvidia-smi` on PATH either, so
  that probe fails on the spawn rather than on a timeout.

## Evidence

**Live boot, console-less (`Start-Process electron.exe .`, own profile + port),
`Win32_Process` polled at 50 ms — the same method that measured the pre-fix 8:**

```
GPU-probe spawns during boot: 3
  3x  nvidia-smi --query-gpu=memory.total,memory.used --format=csv,noheader,nounits
--- gpu-detect log lines ---
[07:32:59.166] Starting GPU detection...
[07:32:59.379] NVIDIA GPU detected: NVIDIA GeForce RTX 4060 Ti, CUDA: unknown
[07:32:59.380] Resolved config: ComfyUI=ComfyUI_windows_portable_nvidia.7z
```

- `Starting GPU detection...` **once**, was twice.
- **Zero** `wmic` spawns, was 4 — and the pre-fix run caught all 4 reliably at the
  same 50 ms sampling, so the zero is signal, not a sampling miss.
- The 3 remaining `nvidia-smi` are the `/system/stats` VRAM poll, which must
  re-read live and is not part of detection. The 2 detection spawns were too
  short-lived for this sampler to catch; the log line above is what proves the
  detection ran once.

**`tests/gpu-detect-once.test.cjs` — 4 tests**, `execFile` stubbed so the actual
spawns can be counted:

- two *concurrent* callers (the boot shape — awaiting them in sequence would pass
  even on the old code) produce exactly `['nvidia-smi --query-gpu=name …',
  'nvidia-smi']` and the same resolved object;
- a later call spawns nothing;
- `wmic` never runs when NVIDIA is found;
- with no NVIDIA, `wmic` runs exactly **once** and still resolves `vendor: 'amd'`
  plus the AMD archive URL — which also proves the single probe is read for both
  vendors, and that the stub is really intercepting.

`npx eslint routes/platformEngine.js tests/gpu-detect-once.test.cjs`: clean.

## Test-suite state at commit

My files are green. `npm test` overall is RED with 4 failures in
`tests/flow-lora-rack.test.cjs` and `tests/flow-model-choice.test.cjs` — both
source-scan `js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js`,
which is uncommitted and owned by **MPI-638**, a live peer session. The full suite
ran 765 pass / 0 fail earlier in this same session (at MPI-637 close), so those
appeared with that peer's in-flight edit. Not touched.
