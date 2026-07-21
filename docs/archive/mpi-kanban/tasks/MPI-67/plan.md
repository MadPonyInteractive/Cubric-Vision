# MPI-67 Plan — HOTFIX 1.0.1

Compact, single-flow hotfix. Full fix detail + verify + release steps in brief.md.

1. Apply the 3-file separator fix (routes/comfy.js, commandExecutor.js,
   MpiModelSettings.js) per brief.md → verify: subfolder LoRA loads, old projects
   self-heal, regressions clear, node --check + eslint clean.
2. Bump 1.0.0 → 1.0.1 (appVersion.js + package.json + package-lock) → verify:
   release:check passes.
3. Rebuild per-OS portable artifacts (win32/linux/mac) → verify: artifacts produced.
4. Tag + GitHub Release with the fix note → verify: release published.

Local-only master: emit native `path.sep`, NO remote branch (see brief.md NOTE).
