# Plan: Clean up ComfyUI input/output folders

## Context

The tracker item asks for a system to clean up ComfyUI's `input/` and `output/` folders (located at `engine/ComfyUI_windows_portable/ComfyUI/input` and `.../output`). These folders accumulate uploaded images and generated outputs over time. Files should be deleted either on app startup or on app exit.

## What to clean

- `engine/ComfyUI_windows_portable/ComfyUI/input/` — uploaded input images (e.g. `mpi_input_image.png`)
- `engine/ComfyUI_windows_portable/ComfyUI/output/` — generated output images

## Implementation approach

**Backend only** — this is a server-side cleanup of ComfyUI's working directories. No frontend changes needed.

### 1. Add cleanup utility to `routes/shared.js`

Add a `cleanComfyUITempFiles()` function that:
- Resolves both folder paths (using `ENGINE_ROOT`)
- Empties both directories using `fs.emptyDir()` (preserves the folder itself)
- Logs each cleanup action

```javascript
async function cleanComfyUITempFiles() {
    const ENGINE_ROOT = path.join(__dirname, '..', 'engine');
    const inputDir = path.join(ENGINE_ROOT, 'ComfyUI_windows_portable', 'ComfyUI', 'input');
    const outputDir = path.join(ENGINE_ROOT, 'ComfyUI_windows_portable', 'ComfyUI', 'output');
    for (const dir of [inputDir, outputDir]) {
        if (await fs.pathExists(dir)) {
            await fs.emptyDir(dir);
            logger.info('comfy', `Cleaned temp folder: ${dir}`);
        }
    }
}
```

### 2. Call on app exit

In `server.js`, extend the existing `SIGTERM` / `SIGINT` handlers to also call `cleanComfyUITempFiles()` before `process.exit()`. The `cancelAllDownloads()` call stays; add `cleanComfyUITempFiles()` alongside it.

The Electron main process (`main.js`) does NOT need to be modified — the Express server (child process) handles its own exit cleanup via these signal handlers.

## Files to modify

| File | Change |
|---|---|
| `routes/shared.js` | Add `cleanComfyUITempFiles()` function; export it |
| `server.js` | Call `cleanComfyUITempFiles()` in `SIGTERM`/`SIGINT` handlers |

## Reuse existing utilities

- `ENGINE_ROOT` constant already defined in `routes/shared.js`
- `logger` from `./logger` already available in `shared.js`
- `fs.emptyDir()` from `fs-extra` (already imported in `shared.js`)
- Existing `SIGTERM`/`SIGINT` handlers in `server.js` already cancel downloads — extend them

## Verification

1. Run a generation to populate the `input/` and `output/` folders with files
2. Send `SIGTERM` to the server process (e.g. close the Electron window)
3. Check `logs/app.log` for the cleanup log messages confirming both folders were emptied
4. Alternatively: check that `input/` and `output/` folders are empty after app closes
