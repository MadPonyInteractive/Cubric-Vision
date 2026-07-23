# MPI-149 — root cause + exact fix (traced 2026-06-26, pre-implementation)

## Root cause (confirmed)

`_createDepJob(dep)` in `routes/downloadManager.js:136` builds the runtime `depJob` from a
HARDCODED field whitelist: `id, url, type, filename, localPath, status, downloadedBytes,
totalBytes, seedBytes, refCount, ...`. It does NOT copy `pipPins` or `installRequirementsCommand`
from the source `dep` (which has them, from `js/data/modelConstants/dependencies.js`).

`finishCustomNodeInstall` (line 1803) → `_runCustomNodeInstall` iterates `modelJob.deps` — which
are these `depJob` objects (pushed at 611 / 997). The install loop reads:
- `dep.installRequirementsCommand` (line 1282) → **DROPPED** → custom-command nodes (e.g.
  Frame-Interpolation `python install.py`) silently skip their command on this path.
- `requirements.txt` from disk (line 1291) → WORKS (disk read, not a dep field) — this is why
  the LTXVideo `--upgrade` req install fired in the log but the pin did not.
- `dep.pipPins` (line 1308) → **DROPPED** → kornia==0.8.2 never re-pins → LTXVideo `pad`
  ImportError after engine upgrade.

So TWO fields are lost, same root cause. pipPins is the one that bit (kornia); 
installRequirementsCommand is a latent second bug (Frame-Interp install.py).

## Exact fix

In `_createDepJob` (downloadManager.js ~136), add to the returned object:
```js
    pipPins: dep.pipPins || null,
    installRequirementsCommand: dep.installRequirementsCommand || null,
```
(Both are read off the dep in the install loop; pass them through so the depJob carries them.)

## Verify

1. Re-run an engine deps install / engine upgrade.
2. Log shows `pip pins installed for ComfyUI-LTXVideo: kornia==0.8.2` (line 1311).
3. `python_embeded\python.exe -c "import kornia; from kornia.geometry.transform.pyramid import pad"` → `pad OK`, kornia 0.8.2.
4. Frame-Interpolation `install.py` runs (custom command) on the same path.

## Scope note

One-spot fix in `_createDepJob`. Touches ONLY downloadManager.js. Shares this file with MPI-140 +
MPI-136 (Cluster B) — per the umbrella conflict matrix, do MPI-149 FIRST (it's Cluster A), commit,
then B.
