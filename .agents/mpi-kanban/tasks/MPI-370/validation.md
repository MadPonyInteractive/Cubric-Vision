# MPI-370 validation

Shipped in `a851eb18`. Code-verified; NOT verified on real hardware.

## Verified during implementation

- `tests/requirements-filter.test.cjs` passes. Covers: the real locked
  requirements body (exactly one line dropped, `torch` survives), version
  specifiers / extras / environment markers, the `onnxruntime-gpu-extra`
  prefix guard, null-on-no-match, empty drop list, idempotence, and a comment
  merely naming the package.
- **Negative control run.** Renamed the `requirementsDrop` passthrough in
  `_createDepJob`, re-ran the test, and confirmed it fails with
  "_createDepJob must carry requirementsDrop", then restored it. The wiring
  assertion genuinely bites - a pure-function-only test would have gone green
  while the fix was dead on the path that actually fails.
- `tests/controlnet-aux-torch-guard.test.cjs` still passes - the torch guard on
  this dep did not regress.
- `requirementsDrop` confirmed present on the dep as loaded through the
  backend's `_require` of `dependencies.js`, not just in the source file.
- `node --check routes/downloadManager.js` passes.

## NOT verified - needs a Mac

**A real macOS install of a depth model completing without the Installation
Failed dialog.** No Apple hardware was available, so the earliest true proof is
a 1.3.0 build in a Mac user's hands. Everything above proves the filter is
correct and reaches the install loop; none of it proves pip is then happy.

When a Mac user does run it, the log line to look for is:

```
[INFO] [download] requirements filtered for comfyui_controlnet_aux on darwin: dropped onnxruntime-gpu
```

Absence of that line on a Mac means the field did not survive to the install
loop and the fix is not active.

## Explicitly out of scope

- CPU `onnxruntime` is NOT installed as a replacement. DepthAnythingV2 runs
  through `AIO_Preprocessor`, which is torch-based. Revisit only if an
  ONNX-dependent preprocessor is wired later.
- Remote/Pod path untouched: the Pod bakes this node into a CUDA Linux image,
  so the wrapper never runs this install.
