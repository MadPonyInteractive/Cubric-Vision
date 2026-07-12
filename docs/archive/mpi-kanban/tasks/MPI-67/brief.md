# MPI-67 — HOTFIX 1.0.1: Windows subfolder LoRA/upscale path-separator bug

## Severity: HIGH — breaks v1.0.0 for many users
On Windows, **any LoRA or upscale model stored in a SUBFOLDER cannot be used**.
Selecting it and generating fails:
```
Failed to validate prompt for output <id>:
  - Value not in list: lora_name: 'SDXL/SDXL_FILM_PHOTOGRAPHY_STYLE_BetaV0.4.safetensors' not in (list of length N)
invalid prompt: {'type': 'prompt_outputs_failed_validation', ...}
```
User sees the "Generation failed — Prompt outputs failed validation" dialog. Only
**root-level** (non-subfolder) models work in 1.0.0.

## Root cause
`GET /comfy/list-files` (routes/comfy.js) normalizes every model path to a
FORWARD slash (`.replace(/\\/g, '/')`). On Windows, ComfyUI builds its
`LoraLoader` / `UpscaleModelLoader` enum from `path.relative` against its own
search roots → **backslash** separators (`SDXL\foo.safetensors`). The app stores +
ships the forward-slash form (`SDXL/foo.safetensors`); ComfyUI validates the
submitted `lora_name`/`model_name` against its backslash enum → mismatch → 400.

Verified live: `/comfy/list-files` returned `SDXL/...`; ComfyUI
`/object_info/LoraLoader` listed `SDXL\...`. Root-level files have no separator so
they always matched — which is why the bug looked intermittent.

This fix is **already implemented and proven working on the RunPod branch**
(commit pending there). master is LOCAL-ONLY (no remote engine), so the fix is
simpler than RunPod's — the engine is always this host, so always emit the native
separator. NO `isRemoteActive` branch on master (that code does not exist here).

## THE FIX (3 files)

### 1. routes/comfy.js — `GET /comfy/list-files`, the `addFiles` helper
Emit the native OS separator instead of forcing forward slash. Keep the dedupe
key forward-slash so it's stable.

REPLACE:
```js
        const addFiles = async (dirPath, relativeTo, output, seen) => {
            const files = await getAllFiles(dirPath, relativeTo);
            for (const file of files) {
                const normalized = file.replace(/\\/g, '/');
                const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
                if (seen.has(key)) continue;
                seen.add(key);
                output.push(normalized);
            }
        };
```
WITH:
```js
        // ComfyUI builds its LoRA/upscale enum from path.relative against its own
        // search roots, so the separator it expects matches the engine's OS. master
        // is local-only → emit the native separator (Windows '\\'); forcing forward
        // slash here 400s "value not in list" for subfolder models on Windows.
        // Dedupe key stays forward-slash so it is stable regardless of separator.
        const toEngineSep = (s) => path.sep === '/' ? s.replace(/\\/g, '/') : s.replace(/\//g, '\\');

        const addFiles = async (dirPath, relativeTo, output, seen) => {
            const files = await getAllFiles(dirPath, relativeTo);
            for (const file of files) {
                const fwd = file.replace(/\\/g, '/');
                const key = process.platform === 'win32' ? fwd.toLowerCase() : fwd;
                if (seen.has(key)) continue;
                seen.add(key);
                output.push(toEngineSep(fwd));
            }
        };
```

### 2. js/services/commandExecutor.js — resolve saved value → list string at injection
Existing project.json files store the OLD forward-slash names. Resolve them to the
engine-correct separator at injection (NO project.json migration). Add this helper
next to `_resolveUpscaleFilename`:
```js
const _pathKey = (f) => String(f || '').replace(/\\/g, '/').toLowerCase();

/**
 * Resolve a saved LoRA/upscale name to the EXACT string in the current asset list,
 * separator-agnostically. list-files now emits the engine-native separator which
 * ComfyUI's enum expects; project.json may hold a legacy forward-slash value.
 * Returning the list string makes the injected lora_name/model_name match
 * ComfyUI's enum so it does not 400. Falls back to the saved value if no match.
 */
function _resolveModelName(value, available) {
    if (!value) return value;
    const want = _pathKey(value);
    return (available || []).find(f => _pathKey(f) === want) || value;
}
```
Then in `_buildParams`, wrap each injected name:
- staged LoRA: `lora_name: _resolveModelName(slot.name, state.availableLoras),`
- non-staged LoRA: `lora_name: _resolveModelName(slot.name, state.availableLoras),`
- both `Upscale_Model` writes: `params['Upscale_Model'] = _resolveModelName(upscaleFilename, state.upscaleModels);`
(`state` is already imported in this file.)

### 3. js/components/Compounds/MpiModelSettings/MpiModelSettings.js — picker selects saved value
After the fix, dropdown option values are backslash but saved values may be
forward-slash → the dropdown would show nothing selected. Add a small resolver and
use it where the dropdown value is seeded. Add near `_loraOptions`:
```js
const _pathKey = (f) => String(f || '').replace(/\\/g, '/').toLowerCase();
function _resolveToList(value, available) {
    if (!value) return value;
    const want = _pathKey(value);
    return (available || []).find(f => _pathKey(f) === want) || value;
}
```
- In `_mountUpscaleDropdown`, replace the exact-match `filtered.includes(currentValue)`
  resolution so it matches separator-agnostically and uses the list's string:
  ```js
  const matched = _resolveToList(currentValue, filtered);
  const resolved = (currentValue && filtered.some(f => _pathKey(f) === _pathKey(currentValue)))
      ? matched
      : (filtered.includes(siaxFile) ? siaxFile : (filtered[0] || ''));
  ```
- In each LoRA slot mount (staged + non-staged), seed the dropdown `value` with
  `_resolveToList(slot.name, state.availableLoras)` instead of raw `slot.name`.

## VERIFY THE FIX
1. Put a LoRA in a SUBFOLDER (e.g. `<models>/loras/SDXL/some.safetensors`).
2. Confirm `GET /comfy/list-files?subDir=loras` now returns `SDXL\some.safetensors`
   on Windows (backslash), matching `GET http://127.0.0.1:8188/object_info/LoraLoader`.
3. Select that LoRA, Generate → succeeds, LoRA visibly applied (no 400, no
   "Prompt outputs failed validation").
4. Open an OLD project that had a subfolder LoRA saved → it shows selected in the
   picker and generates fine (legacy forward-slash value self-heals at injection).
5. Root-level LoRA + non-LoRA generation still work (regression check).
6. `node --check` + `npx eslint` clean on the 3 files.

## RELEASE (1.0.0 → 1.0.1)
After the fix verifies:
1. Run `/mpi-version-bump` (or manually): bump `js/core/appVersion.js` APP_VERSION,
   `package.json`, `package-lock.json` → `1.0.1`. SCHEMA_VERSION unchanged (no
   project.json shape change).
2. Release notes: "Fix: LoRA/upscale models stored in subfolders failed to load on
   Windows (path-separator mismatch). All subfolder models now load correctly."
3. Run `release:check`.
4. **Rebuild per-OS portable artifacts** — node_modules can't be cross-built; each
   OS builds on its own runner. Follow the portable build flow (the private mpi-ci
   dispatch for the gated builds; see docs/releases/). All 3 OSes: win32, linux, mac.
5. Tag + GitHub Release per docs/releases/github-release-checklist.md.

## NOTE
- master is local-only; do NOT add `remoteModels`/`isRemoteActive` — it doesn't
  exist here. The RunPod branch has the remote-aware variant (`engineSep =
  isRemoteActive() ? '/' : path.sep`); keep them divergent — master uses `path.sep`.
- Apply ONLY this fix to master. No other RunPod work belongs on the release branch.
