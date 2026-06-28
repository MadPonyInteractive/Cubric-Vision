# MPI-149 Validation

## Fix applied (2026-06-26)

`routes/downloadManager.js` `_createDepJob` (lines 163-164) — added pass-through:
```js
pipPins: dep.pipPins || null,
installRequirementsCommand: dep.installRequirementsCommand || null,
```

## Code-level verification — PASSED
- `node -e "require('./routes/downloadManager.js')"` → loads, no syntax error.
- LTXVideo DEP carries `pipPins: ["kornia==0.8.2"]` (dependencies.js:270) → the pass-through has
  real data to copy.
- Frame-Interpolation DEP carries `installRequirementsCommand: 'python install.py'`
  (dependencies.js:339) → the second rescued field.
- Chain now whole: dep → _createDepJob (copies fields) → modelJob.deps → install loop
  (downloadManager.js:1308 reads dep.pipPins; :1282 reads dep.installRequirementsCommand).

## Live verification — DEFERRED (needs a real engine deps install/upgrade)
The definitive proof is the log line `pip pins installed for ComfyUI-LTXVideo: kornia==0.8.2`
firing on the next engine upgrade, then `python_embeded\python.exe -c "from
kornia.geometry.transform.pyramid import pad"` → `pad OK` + kornia 0.8.2. NOT run here (would
require triggering a full engine reinstall). The dev box is already manually patched to kornia
0.8.2, so LTX works now regardless; this fix ensures it STAYS fixed on the next real upgrade.

**Status: code-verified, live-verify pending next engine update.** Recommend confirming on the
first engine upgrade in the next session (e.g. when Build A / a future ComfyUI bump triggers one).
