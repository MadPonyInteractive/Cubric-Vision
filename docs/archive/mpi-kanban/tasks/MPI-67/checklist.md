# MPI-67 Checklist

## Fix
- [ ] routes/comfy.js: list-files emits native separator (path.sep), keep fwd dedupe key
- [ ] commandExecutor.js: `_resolveModelName` + applied at LoRA (staged+non) and both Upscale_Model
- [ ] MpiModelSettings.js: `_resolveToList` + seed dropdown values separator-agnostically
- [ ] node --check + eslint clean on the 3 files

## Verify
- [ ] list-files returns backslash subfolder names on Windows (matches /object_info)
- [ ] subfolder LoRA generates (no "value not in list" 400), LoRA applied
- [ ] old project with subfolder LoRA shows selected + generates (self-heal)
- [ ] root-level + non-LoRA generation regression-clear

## Release 1.0.0 → 1.0.1
- [ ] Bump appVersion.js + package.json + package-lock to 1.0.1
- [ ] Release notes (subfolder path fix)
- [ ] release:check passes
- [ ] Rebuild per-OS portable artifacts (win32 / linux / mac)
- [ ] Tag + GitHub Release published
