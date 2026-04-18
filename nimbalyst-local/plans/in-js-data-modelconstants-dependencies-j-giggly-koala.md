# Plan: `installRequirementsCommand` Support for Custom Nodes

## Context

Some ComfyUI custom nodes (e.g. `ComfyUI-Frame-Interpolation`) cannot install their Python dependencies via the standard `pip install -r requirements.txt` path. Instead they ship an `install.py` script that must be run directly. The field `installRequirementsCommand: 'python install.py'` was added to the dependency entry in `js/data/modelConstants/dependencies.js`, but the backend install pipeline in `routes/downloadManager.js` currently ignores it — it always runs pip against `requirements.txt` if the file exists.

This plan wires up the field so the custom command is run instead of the default pip path.

---

## Scope: One file, one function

**Only file to change:** `routes/downloadManager.js`  
**Only function to change:** `_runCustomNodeInstall` (lines ~502–511)

---

## Implementation

### Current code (lines 502–511)

```js
// Run pip install for requirements.txt if present
const reqPath = path.join(targetDir, 'requirements.txt');
if (await fs.pathExists(reqPath)) {
    try {
        await runPipCommand(['install', '-r', reqPath, '--upgrade', '--no-warn-script-location']);
        logger.info('download', `pip requirements installed for ${dep.id}`);
    } catch (err) {
        logger.error('download', `pip install FAILED for ${dep.id}: ${err.message}`);
    }
}
```

### Replacement logic

```js
if (dep.installRequirementsCommand) {
    // Custom install script (e.g. "python install.py") — replaces pip path
    const parts = dep.installRequirementsCommand.split(' ');
    const ENGINE_ROOT = path.join(__dirname, '..', 'engine');
    const pythonPath = path.join(ENGINE_ROOT, 'ComfyUI_windows_portable', 'python_embeded', 'python.exe');
    // Replace "python" token with the embedded python path
    const exe = parts[0].toLowerCase() === 'python' ? pythonPath : parts[0];
    const args = parts.slice(1);
    logger.info('download', `Running custom install command for ${dep.id}: ${dep.installRequirementsCommand}`);
    await new Promise((resolve, reject) => {
        const proc = spawn(exe, args, { cwd: targetDir });
        proc.stdout.on('data', (d) => logger.info('system', `[install.py] ${d.toString().trim()}`));
        proc.stderr.on('data', (d) => logger.warn('system', `[install.py-err] ${d.toString().trim()}`));
        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`installRequirementsCommand failed with code ${code} for ${dep.id}`));
        });
    });
    logger.info('download', `Custom install command succeeded for ${dep.id}`);
} else {
    // Default: pip install -r requirements.txt if present
    const reqPath = path.join(targetDir, 'requirements.txt');
    if (await fs.pathExists(reqPath)) {
        try {
            await runPipCommand(['install', '-r', reqPath, '--upgrade', '--no-warn-script-location']);
            logger.info('download', `pip requirements installed for ${dep.id}`);
        } catch (err) {
            logger.error('download', `pip install FAILED for ${dep.id}: ${err.message}`);
        }
    }
}
```

### Key decisions (per user answers)
- `installRequirementsCommand` **replaces** the pip path entirely — no fallback to `requirements.txt`
- Command is **split on spaces** — first token replaces `python` with `pythonPath` (embedded), rest are args
- `cwd` is set to `targetDir` (the installed node's own folder)
- Failure **throws** — propagates up and marks the job failed (same behavior as pip failure)
- `spawn` is already imported in `downloadManager.js` (used by `runPipCommand` in `shared.js`; need to confirm it's available locally or import it)

### Check: is `spawn` available in `downloadManager.js`?
`shared.js` owns `runPipCommand` and imports `spawn` there. `downloadManager.js` only imports `runPipCommand` from `shared.js`. The new code needs `spawn` — it must be added to the `require('child_process')` import at the top of `downloadManager.js`, OR the logic can be extracted into a helper in `shared.js` and exported.

**Preferred:** Add a `runCustomCommand(command, cwd)` helper to `routes/shared.js` (alongside `runPipCommand`) and export it. This keeps spawn logic centralized.

---

## Final approach: add `runCustomCommand` to `shared.js`

### `routes/shared.js` — add after `runPipCommand`

```js
async function runCustomCommand(commandStr, cwd) {
    const ENGINE_ROOT = path.join(__dirname, '..', 'engine');
    const pythonPath = path.join(ENGINE_ROOT, 'ComfyUI_windows_portable', 'python_embeded', 'python.exe');
    const parts = commandStr.split(' ');
    const exe = parts[0].toLowerCase() === 'python' ? pythonPath : parts[0];
    const args = parts.slice(1);
    logger.info('system', `Running custom command: ${commandStr} (cwd: ${cwd})`);
    return new Promise((resolve, reject) => {
        const proc = spawn(exe, args, { cwd });
        proc.stdout.on('data', (d) => logger.info('system', `[custom-cmd] ${d.toString().trim()}`));
        proc.stderr.on('data', (d) => logger.warn('system', `[custom-cmd-err] ${d.toString().trim()}`));
        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Custom command "${commandStr}" failed with exit code ${code}`));
        });
    });
}
```

Add `runCustomCommand` to the `module.exports` of `shared.js`.

### `routes/downloadManager.js` — import and use

1. Add `runCustomCommand` to the destructured import from `./shared`
2. Replace the requirements install block with the branching logic above (using `runCustomCommand`)

---

## Files to modify

| File | Change |
|---|---|
| `routes/shared.js` | Add `runCustomCommand(commandStr, cwd)` function + export it |
| `routes/downloadManager.js` | Import `runCustomCommand`; replace install block with `if (dep.installRequirementsCommand)` branch |

---

## Verification

1. Trigger install of `ComfyUI-Frame-Interpolation` through the UI
2. Check `logs/app.log` — should see `Running custom command: python install.py` and `[custom-cmd]` output lines, NOT any `[pip]` lines for that dep
3. Verify the node folder exists under `custom_nodes/comfyui-frame-interpolation/` after install
4. Trigger install of a normal node (e.g. one with `installRequirements: true` and no `installRequirementsCommand`) — should still see `[pip]` lines as before
