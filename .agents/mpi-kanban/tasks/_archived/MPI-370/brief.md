# MPI-370 - macOS install fails on onnxruntime-gpu

Reported 2026-07-28 by a Discord user (luax) on macOS arm64, running 1.2.0 from
`~/Downloads/CubricVision-macos-arm64-v1.2.0`. Unlike the Windows report that came
in the same night (MPI-369), this one arrived WITH logs and is fully confirmed.

## The failure

```
[WARN]  [custom-cmd-err] ERROR: Could not find a version that satisfies the
                         requirement onnxruntime-gpu (from versions: none)
[WARN]  [custom-cmd-err] ERROR: No matching distribution found for onnxruntime-gpu
[ERROR] [download] Custom install command FAILED for comfyui_controlnet_aux
[ERROR] [engine] Custom node install error: One or more custom node extractions failed
```

Then the Installation Failed dialog with a Retry button. Retry re-runs the same
command and fails the same way. There is no path forward for the user.

## Root cause

`dev_configs/node_lock.json` pins `Fannovel16/comfyui_controlnet_aux` at commit
`e8b689a513c3e6b63edc44066560ca5919c0576e`. That commit's `requirements.txt` ends
with a bare, unmarked:

```
onnxruntime-gpu
```

`onnxruntime-gpu` publishes CUDA wheels for Windows and Linux x86_64 only. There has
never been a macOS build - not for arm64, not for x86_64. pip reports
`from versions: none`, exits 1, `runCustomCommand` rejects, and
`routes/downloadManager.js` marks the dep failed and sets `anyFailure`.

Upstream never added an environment marker, so nothing about this is transient.

## Scope

- Affects EVERY macOS user installing any model that lists `comfyui_controlnet_aux`:
  the five SDXL depth models and Krea2 depth.
- Windows and Linux x86_64 resolve the wheel normally. Unaffected.
- REMOTE/Pod path unaffected: the Pod image bakes this node into a CUDA Linux
  image, so the wrapper never runs this install. Local engine only.

## Why the fix cannot go in the command string

`routes/shared.js` `runCustomCommand` splits the command on spaces and spawns the
binary directly - there is NO shell. So no `&&` chaining, and no
`python -c "multi word script"` either, because the naive space split shreds it.

The filter therefore belongs in `routes/downloadManager.js`, applied to the file on
disk before either install path reads it (the `installRequirementsCommand` branch AND
the default `pip install -r` branch).

## Design

Per-dep, per-platform drop list on the dep definition:

```js
requirementsDrop: { darwin: ['onnxruntime-gpu'] },
```

Rewrite the file only when a line is actually dropped, so every platform that can
resolve the wheel keeps a byte-identical file and the change is a no-op there. That
also makes it idempotent - the second pass finds nothing to drop.

Deliberately NOT installing CPU `onnxruntime` as a replacement. We drive
DepthAnythingV2 through `AIO_Preprocessor`, which is torch-based. Add the CPU wheel
only if a preprocessor that genuinely needs ONNX is wired later.

## Note on the manual workaround (not shipped to users)

Editing the extracted `requirements.txt` by hand does work and survives Retry -
`downloadManager` skips extraction when the node folder already holds files and
re-runs only the requirements step. Recorded here for debugging only; the user
declined to put a customer through it, correctly.
