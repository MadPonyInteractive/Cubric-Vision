# MPI-408 — Retry can never succeed after a failed engine install (Linux/macOS)

Found 2026-07-30 on the Linux desktop during MPI-391 section D, retrying after a
mid-install thermal shutdown.

## Symptom

`Installation Failed` dialog:

```
uv-venv failed (exit 2): .../uv/uv venv --seed --python 3.12 .../engine/comfy-venv
```

Pressing **Retry** reproduces it instantly, every time.

## uv's actual error

The dialog shows only the command. `app.log` has the reason:

```
[uv-venv] error: Failed to create virtual environment
[uv-venv] Caused by: A virtual environment already exists at: comfy-venv
[uv-venv] hint: Use the `--clear` flag or set `UV_VENV_CLEAR=1` to replace the existing virtual environment
```

`uv venv` refuses when the target exists **at all**. The venv on disk was
complete, not a stump:

```
bin/  lib/  lib64 -> lib  pyvenv.cfg  CACHEDIR.TAG  .gitignore  .lock
```

## Why this is severe

The first attempt that gets past step 1 poisons every attempt after it. The
Installation Failed dialog offers a Retry button that is **guaranteed to fail
forever**, whatever originally went wrong — power cut, dropped connection, full
disk, user quit. The only escape is deleting `<engine>/comfy-venv` by hand, and
no user will find that.

Affects **Linux and macOS** (both take `_provisionUvEngine`). Windows is
unaffected — it uses the prebuilt-archive path.

## Root cause

An asymmetry inside the same function. Step 0b (`engine.js:341-347`) already
clears stale state so retries start clean:

```js
// Clear a stale workspace from a failed prior run
if (await fs.pathExists(workspace) && !(await fs.pathExists(path.join(workspace, '.git')))) {
    logger.warn('engine', `Removing stale ComfyUI workspace (no .git): ${workspace}`);
    await fs.remove(workspace);
}
```

`ComfyUI_linux` got that treatment. Its sibling `comfy-venv`, created one step
later, got none.

## Fix

Pass `--clear` to `uv venv`, making step 1 idempotent the same way step 0b
already is. Rebuilding the venv costs seconds.

Chosen over conditionally detecting a broken venv: uv rejects *complete* venvs
too, so a completeness check would not address the actual failure, and a retry
wanting a fresh environment is the correct semantics anyway.

## Not a 1.3.0 regression

Predates the release. Never seen because no failed install had ever been retried
on real Linux or macOS hardware before today.
