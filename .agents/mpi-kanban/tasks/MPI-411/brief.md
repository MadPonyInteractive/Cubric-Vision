# MPI-411 — Retry still impossible after an interrupted install: the workspace half

Found live on Linux 2026-07-30, **while verifying MPI-408's fix**. MPI-408 is
genuinely fixed — this is the next sibling of the same hole, three lines further
down `_provisionUvEngine`.

## What happened

Deliberate repro: press Install, Ctrl+C once `[comfy-install]` started, relaunch,
press Install again. Steps 1 and 2 now sail through — MPI-408's `--clear` did its
job:

```
[uv-venv] Creating virtual environment with seed packages at: comfy-venv
[uv-venv] + pip==26.2
[install-comfy-cli] Installed 48 packages in 107ms
```

Then step 3 died:

```
[comfy-install] ComfyUI is already installed at the specified path:
[comfy-install] /home/mad-pony/…/engine/ComfyUI_linux
[comfy-install] If you want to restore dependencies, add the '--restore' option.
[ERROR] [engine] comfy-install failed (exit 1)
```

Retry is still permanently dead on Linux/macOS. Only escape is deleting
`engine/ComfyUI_linux` by hand — verified: after `rm -rf` on it, Retry proceeded
straight into the dependency install.

## Root cause

Step 0b (`engine.js:344`) removes a stale workspace **only when it has no
`.git`**:

```js
if (await fs.pathExists(workspace) && !(await fs.pathExists(path.join(workspace, '.git')))) {
```

That guard was written for a workspace killed *during* the clone. But the clone
takes seconds and the dependency install takes many minutes, so an interrupted
setup almost always leaves a **complete, valid** clone — which 0b deliberately
keeps, and which `comfy install` then refuses outright.

The common case falls through the guard designed for the rare one.

## Fix

```js
const workspaceIsClone = await fs.pathExists(path.join(workspace, '.git'));
…
if (workspaceIsClone) installArgs.push('--restore');
```

`--restore` is the flag comfy-cli's own error names, from the exact version in
use (`comfy-cli==1.13.0`).

Chosen over deleting the valid clone and re-cloning: the clone is the cheap
half, the deps are the expensive half, and the machines that hit this are the
ones least able to spare a re-download. Step 1 already takes the "replace it"
approach for the venv because a venv is seconds to rebuild; a workspace is not.

Also worth noting for future work here: **each step of `_provisionUvEngine` needs
its own idempotency, and they are not interchangeable.** 0b deletes, 1 clears, 3
restores. A fix for one step proves nothing about the next — MPI-408 shipped
believing "Retry works now", and it did not.

## Blast radius

Linux and macOS (both take `_provisionUvEngine`). Windows uses the prebuilt
archive path and never reaches here.

## Landed in 1.3.0

At the user's call, same reasoning as MPI-406/407/408: nothing is published, so
1.3.0 gets overwritten rather than carrying a half-fix whose changelog entry
already promises the whole thing. The MPI-408 changelog line in
`releaseNotes.js` was widened to name both leftovers instead of adding a second
entry — one user-facing story, not two.

## Verify

On Linux: interrupt an install after `[comfy-install]` begins, relaunch, press
Retry. Expect the `--restore` log line from `engine.js` and the install
continuing into dependencies — not `exit 1`.
