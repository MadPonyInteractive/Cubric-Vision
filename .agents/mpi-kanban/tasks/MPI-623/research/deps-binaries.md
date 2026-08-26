# Dependency System + Native Binary Investigation
_Date: 2026-08-26 — read-only investigation, no files were modified_

---

## Q1 — The four dep files: what belongs where, and entry shapes

### File map

| File | Contents |
|---|---|
| `js/data/modelConstants/modelDeps.js` | Checkpoints and diffusion_model transformers — the **picked generative models** only |
| `js/data/modelConstants/loraDeps.js` | Everything under `loras/` — Wan turbo, Krea2 styles/bypass/edit, LTX baked LoRAs, MiniMax H3 turbo |
| `js/data/modelConstants/assetDeps.js` | Support weights that models depend on but are not themselves the model: VAEs, CLIP/text encoders, upscalers, detectors, SAM, RIFE, Chatterbox audio weights. Also `engineAsset` flags and `targetPath` overrides |
| `js/data/modelConstants/nodesDeps.js` | ComfyUI custom node packs only. URLs are **never hardcoded here** — always `lockUrl(id)` pulling from `dev_configs/node_lock.json` |

### Common entry shape (modelDeps / loraDeps / assetDeps)

```javascript
{
    id:        string,          // unique dep key — REQUIRED
    name:      string,          // human label — REQUIRED
    origin:    string,          // '<author>/<work>' provenance string — REQUIRED for any redistributed weight
    credit:    {               // attribution block — REQUIRED when author requires it
        author: string,
        work:   string,
        url:    string,
    },
    filename:  string,          // path relative to models root, e.g. 'checkpoints/SDXL_Realistic.safetensors' — REQUIRED
    url:       string,          // primary download URL (R2 models.cubric.studio) — REQUIRED
    mirrorUrl: string,          // failover URL (HuggingFace or secondary R2) — REQUIRED unless noMirror:true
    noMirror:  boolean,         // explicit opt-out from second-origin requirement — use when no byte-identical mirror exists
    size:      string,          // human-readable string, e.g. '6.62GB' — informational
    bytes:     number,          // exact byte count — REQUIRED (used for progress)
    sha256:    string|null,     // hex SHA256 of the file bytes — REQUIRED (null only when URL changes before hash is computed)
    // assetDeps only:
    engineAsset: boolean,       // installs with engine, never GC'd with a model (detectors, SAM, RIFE, Chatterbox)
    bakedOnPod:  boolean,       // this engineAsset is in the Pod Docker image — only set when ALSO editing the Dockerfile
    targetPath:  string,        // engine-anchored install path (relative to engine root), bypasses models root. Used when a node hardcodes where it looks (RIFE, Chatterbox)
}
```

### nodesDeps entry shape

```javascript
{
    id:                       string,   // REQUIRED — must match a key in node_lock.json
    name:                     string,   // REQUIRED
    type:                     'custom_nodes',  // REQUIRED — always this value
    filename:                 string,   // extracted folder name inside custom_nodes/ — REQUIRED
    url:                      lockUrl(id),     // REQUIRED — always via lockUrl(), never hardcoded
    installRequirements:      boolean,  // REQUIRED — true = run pip on requirements.txt
    installRequirementsCommand: string, // optional override replacing default pip path
    pipPins:                  string[], // corrective pip pins run AFTER requirements — prevents drift
    size:                     string,   // informational
    // NO sha256 — GitHub archive zips regenerate on every commit, making hashes permanently stale
}
```

### Worked examples (verbatim)

**modelDeps.js** — `sdxl-realistic`:
```javascript
'sdxl-realistic': {
    id: 'sdxl-realistic',
    name: 'SDXL Realistic',
    origin: 'KandooAI/Juggernaut XL (CivitAI 133005)',
    credit: { author: 'KandooAI', work: 'Juggernaut XL', url: 'https://civitai.com/models/133005' },
    filename: 'checkpoints/SDXL_Realistic.safetensors',
    url: 'https://models.cubric.studio/vision/models/checkpoints/SDXL_Realistic.safetensors',
    mirrorUrl: 'https://huggingface.co/Mad-Pony-Interactive/cubric-studio/resolve/main/SDXL_Realistic.safetensors',
    size: '6.62GB',
    bytes: 7105352784,
    sha256: '4bb646ca44e460bfc121fbcd8b7a65ae2b7a85f89c9e9ffe4d078db6e488d5ff'
}
```

**loraDeps.js** — `wan22-5b-turbo-lora`:
```javascript
'wan22-5b-turbo-lora': {
    id: 'wan22-5b-turbo-lora',
    name: 'Wan 2.2 5B Turbo (4-step)',
    origin: 'Kijai/WanVideo_comfy — LoRAs/Wan22-Turbo (quanhaol distill)',
    filename: 'loras/wan-2.2-5b/Wan22_TI2V_5B_Turbo_lora_rank_64_fp16.safetensors',
    url: 'https://models.cubric.studio/vision/models/loras/wan-2.2-5b/Wan22_TI2V_5B_Turbo_lora_rank_64_fp16.safetensors',
    mirrorUrl: 'https://huggingface.co/Kijai/WanVideo_comfy/resolve/main/LoRAs/Wan22-Turbo/Wan22_TI2V_5B_Turbo_lora_rank_64_fp16.safetensors',
    size: '316.95MB',
    bytes: 332348584,
    sha256: '0ace5244e3d1256f884662c261b017249796cf5b95f05d5ed93cc02a478967b8'
}
```

**assetDeps.js** — `wan_2.1_vae`:
```javascript
'wan_2.1_vae': {
    id: 'wan_2.1_vae',
    name: 'wan_2.1_vae',
    filename: 'vae/wan_2.1_vae.safetensors',
    url: 'https://models.cubric.studio/vision/models/vae/wan_2.1_vae.safetensors',
    mirrorUrl: 'https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors',
    size: '242.06MB',
    bytes: 253815318,
    sha256: '2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b'
}
```

**nodesDeps.js** — `ComfyUI-MpiNodes`:
```javascript
'ComfyUI-MpiNodes': {
    id: 'ComfyUI-MpiNodes',
    name: 'ComfyUI-MpiNodes',
    type: 'custom_nodes',
    filename: 'ComfyUI-MpiNodes',
    url: lockUrl('ComfyUI-MpiNodes'),
    installRequirements: false,
    size: '1.76MB',
}
```

---

## Q2 — SHA256 recording and verification

Each dep carries `sha256: '<hex string>'` set at entry-authoring time (null when the URL was just changed). The `mpic-compute-dep-hashes` skill is the canonical way to compute them — it HEAD-requests each dep URL and writes the resulting hashes back into the dep files.

Verification happens in `routes/downloadManager.js` `_verifySha256()` (line ~1054). Flow:
- During download, a `crypto.createHash('sha256')` stream is incrementally updated on each received chunk (`_streamHash`).
- On download completion (`routes/downloadManager.js` line ~728-767) the in-memory digest is finalized; if `sha256Expected` is set, `_verifySha256` compares it. A mismatch: (1) deletes the downloaded file, (2) marks the dep job `failed` with an error message naming the mismatch, (3) broadcasts `download:snapshot` with the failed status.
- If the stream hash was reset (resumed download path), `_verifySha256` falls back to a full disk re-read (same file, hash from scratch).
- **`custom_nodes` deps must NOT have `sha256` set** — GitHub branch archive zips regenerate on every commit, making pinned hashes permanently stale (`downloads.md` line 18).

---

## Q3 — Where weights are hosted; `url` vs `mirrorUrl` convention

Every model weight has TWO origins (MPI-429):
- **Primary:** R2 at `models.cubric.studio` — `https://models.cubric.studio/vision/models/<comfy-type>/<file>`
- **Failover:** HuggingFace (typically `Mad-Pony-Interactive/cubric-studio` on HF) or per-dep `mirrorUrl` to any byte-identical copy

A transport failure (and ONLY that — not a 404, not a hash mismatch) retries the dep against the second origin before marking it failed. The failover is implemented in `routes/downloadManager.js`.

**Operational requirements for a new weight:**
1. Upload to R2 under `vision/models/<comfy-type>/<filename>` — this becomes the `url`.
2. Either re-host to `Mad-Pony-Interactive/cubric-studio` on HF (no per-dep field needed for that standard path) OR set a per-dep `mirrorUrl` pointing to a byte-identical copy elsewhere OR set `noMirror: true`.
3. Compute sha256 with `mpic-compute-dep-hashes` and fill in `bytes` and `sha256`.

The `origin` field is load-bearing metadata, not a comment — it feeds the CivitAI licence sweep that assigns second origins.

---

## Q4 — How a model/Flow declares deps; `requiredDeps` vs `requiredModels`

**For models** (`js/data/models.js`): each ModelDef carries `dependencies: string[]` — a flat array of dep ids from the four dep files. The resolver in `js/data/modelConstants/resolveModelDeps.js` turns that flat list into the install set. `dependencies` is the single contract field; `requiredDeps` is a Flow concept, not a model concept.

**For Flows** (`js/data/flowsRegistry.js`):
- `requiredModels: string[]` — MODEL ids (not dep ids). The Flow needs the listed model to be installed. Its weights are tracked by the model's own `dependencies[]` in `models.js`.
- `requiredDeps: string[]` — DEP ids from the four dep files, for things the Flow needs that no model tracks. The distinction is explicit in `flowsRegistry.js` lines 13-14:
  - `requiredModels` → `state.s_installedModelIds`
  - `requiredDeps` → the per-dep status cache, keyed `flow:<id>`

**The REVERTED shape (important):** Listing a model's weights as `requiredDeps` was tried and reverted. Reason: the plugin/model uninstall guard reads `DEPS` to know what each model "owns" — if a model weight is listed as a Flow dep instead of a model dep, the orphan sweep cannot find it when uninstalling the model, and it is stranded on disk. The rule is: model weights belong in `models.js` `dependencies[]`, never in a Flow's `requiredDeps`.

---

## Q5 — Orphan sweep: what it is and why deleting a dep entry strands files

`_sweepOrphanedDeps` (local) and `_sweepOrphanedDepsRemote` (remote) in `routes/downloadManager.js` run at the end of an uninstall route. The orphan test is `_localSharedDepsMap(null)` — a union of every installed model's deps, live install jobs, Flow deps, and plugin deps. Any dep whose file is on disk AND is absent from that union is "owned by nobody" and is collected.

**Why deleting a dep entry strands the file:** The orphan sweep only knows about deps that are in the registry. If you delete a dep entry from the registry, that dep's file on existing users' disks becomes invisible to the sweep — no map entry, so the sweep never considers it for collection. The file stays on disk forever, because no Install button appears (the card is gone) and no Uninstall button appears either.

The working example is in `modelDeps.js` lines 89-94 (the DEPRECATED `wan-22-t2v-*` entries):
> "They stay on purpose. `_orphanedDepIds` iterates THIS map and trashes what no model protects, so keeping them is exactly what lets the uninstall sweep reclaim the 27.1GB already sitting on existing users' disks. Delete these entries and the sweep goes blind — the two files strand forever."

**Rule:** Never delete a dep entry once it has shipped. Deprecate it (remove all model `dependencies[]` references so nothing installs it), but keep the entry so the orphan sweep can collect what is already on users' disks.

---

## Q6 — Custom node packs: declaration, installation, `node_lock.json`, and drift check

**Declaration:** `nodesDeps.js` entry with `type: 'custom_nodes'`, `url: lockUrl(id)`, `installRequirements` bool.

**`node_lock.json` (`dev_configs/node_lock.json`):** Single source of truth for commit/version pinning. `lockUrl(id)` derives the concrete download URL:
```javascript
case 'git-commit': return `https://github.com/${e.repo}/archive/${e.commit}.zip`;
case 'git-tag':    return `https://github.com/${e.repo}/archive/refs/tags/${e.tag}.zip`;
case 'registry':   return `https://cdn.comfy.org/${e.publisher}/${e.node}/${e.version}/node.zip`;
```
To bump a node: edit `dev_configs/node_lock.json`, not `nodesDeps.js`.

**Installation:** `routes/downloadManager.js` `_runCustomNodeInstall()`. Downloads the zip, extracts it under `{engine}/custom_nodes/<filename>/`, and if `installRequirements: true` runs pip against `requirements.txt` (or `installRequirementsCommand` if set). `pipPins` are applied AFTER requirements (corrective).

**Drift check:** A `.mpi_node_commit` marker file is written next to each extracted node folder. On every engine start, the drift ladder compares the marker against `node_lock.json`; if they differ, the engine reinstalls the node at the locked commit. This is the `NODE_COMMIT_MARKER` mechanism in `routes/shared.js`.

**Pod:** The same `node_lock.json` is consumed by the Pod image build. Nodes with `installRequirements: true` are baked into the Pod image at build time; `installRequirements: false` nodes are installed onto the volume at connect.

---

## Q7 — Custom nodes with `requirements.txt`; pip conflict prevention

The critical comment block in `nodesDeps.js` lines ~263-290 (on `comfyui_controlnet_aux`) reads verbatim:

```
// ⚠ FIRST baked node whose requirements.txt lists bare `torch` + `torchvision`
// (no version constraint). The node does NOT need a different torch — our
// 2.12.0+cu130 satisfies it. The danger WAS our own flag: the default installer
// used to run `pip install -r requirements.txt --upgrade`, and `--upgrade` on an
// unconstrained name resolves from PyPI, which has no `+cu130` wheels.
// Empirically verified:
//   pip install --dry-run --upgrade torch      → "Would install torch-2.13.0"  ✗
//   pip install --dry-run -r requirements.txt  → "torch ... (2.12.0+cu130)" satisfied ✓
// Losing +cu130 destroys the ~10x cold fault-in fix (MPI-187).
//
// MPI-413 FIXED THAT AT THE SOURCE — `--upgrade` is gone from the default path in
// `downloadManager.js`, because the same mechanism was silently swapping torch on
// CPU-only boxes too. The override below is therefore now EQUIVALENT to the
// default rather than a correction of it. It is kept deliberately: it costs
// nothing, and it keeps this node safe if the default path ever regains an
// upgrade-style flag. Do not read it as evidence that the default is still unsafe.
```

**How torch conflicts are prevented:**
1. The default pip install path no longer uses `--upgrade` (MPI-413 fixed this at `routes/downloadManager.js`).
2. A curated python deps pass (`ensureCuratedPythonDeps` in `routes/shared.js`) runs the complete resolved closure WITH `--no-deps` (load-bearing), which means torch and nvidia wheels cannot be touched — they are not in the curated file, and without `--deps` they would be re-derived from transitive deps.
3. Per-node `pipPins` apply corrective overrides AFTER requirements.
4. For nodes with a bare `torch` in requirements: `installRequirementsCommand` can override to run without `--upgrade`.

The pinned torch version is `2.12.0+cu130` (Windows portable); the same cu130 wheels are not on PyPI, so a `--upgrade` install would replace them with a CPU or standard CUDA build.

---

## Q8 — NATIVE BINARY PRECEDENT (THE KEY QUESTION)

**YES — ffmpeg and ffprobe are the existing precedent for a standalone native executable.**

Evidence: `services/ffmpegBinary.js` (found at `/c/AI/Mpi/Cubric-Vision/services/ffmpegBinary.js`) is a service specifically for resolving bundled native binary paths. It is NOT downloaded as a dep — it is **bundled at build time** via `electron-builder extraResources` (dev mode) or carried in the portable archive under `resources/ffmpeg.exe` / `resources/ffprobe.exe` (portable build).

The service (`services/ffmpegBinary.js`, lines 1-74):
```javascript
// Dev:      uses ffmpeg-static / ffprobe-static npm package paths directly.
// Packaged: electron-builder extraResources copies binaries into
//           `process.resourcesPath/ffmpeg(.exe)` and `.../ffprobe(.exe)`.

function _resolvePackaged(name) {
    const exe = process.platform === 'win32' ? `${name}.exe` : name;
    const candidates = [
        process.env.MPI_RESOURCES_PATH,
        process.env.CUBRIC_RESOURCES_PATH,
        process.env.CUBRIC_PORTABLE_ROOT ? path.join(process.env.CUBRIC_PORTABLE_ROOT, 'resources') : null,
        process.resourcesPath,
    ].filter(Boolean);
    for (const base of candidates) {
        const p = path.join(path.resolve(base), exe);
        if (fs.existsSync(p)) {
            _ensureExecutable(p);
            return p;
        }
    }
    return null;
}

function _ensureExecutable(p) {
    if (process.platform === 'win32') return;
    try {
        const mode = fs.statSync(p).mode & 0o777;
        if ((mode & 0o111) !== 0o111) fs.chmodSync(p, mode | 0o111);
    } catch (_) { }
}

const ffmpegPath  = _resolvePackaged('ffmpeg')  || _resolveDev('ffmpeg-static')  || 'ffmpeg';
const ffprobePath = _resolvePackaged('ffprobe') || _resolveDev('ffprobe-static') || 'ffprobe';
```

The portable artifact confirms this at `docs/releases/portable-distribution-contract.md` — the Windows layout explicitly shows:
```
resources/
  app/                 <- app source + node_modules
  cubric/  icons/  ffmpeg.exe  ffprobe.exe
```

**Consumers** (all in `routes/`): `projects.js`, `videoCrop.js`, `videoGif.js`, `videoReverse.js`, `videoTrimInput.js`, `ffmpegThumb.js`, `ffmpegMux.js` — all import `ffmpegPath`/`ffprobePath` from `services/ffmpegBinary.js` and invoke with `execFile`.

**Other subprocess hits (non-native-binary):** `comfy.js:497` spawns the Python interpreter (`python.exe`), `engine.js:283` spawns install tools, `shared.js:301` spawns pip, `gitProvision.js` spawns git, `system.js:27` runs `nvidia-smi`. These are all system tools, Python (bundled with engine), or git — none are downloaded native binaries like what we need.

There is NO precedent in this repo for **downloading** a standalone native binary as a dep at runtime. The ffmpeg analogue is strictly bundled-at-build-time.

---

## Q9 — How ffmpeg is handled

Completely answered above in Q8. Summary:

- **Dev:** resolved via npm packages `ffmpeg-static` and `ffprobe-static` (per-platform prebuilt binaries in `node_modules`).
- **Packaged/portable:** bundled in the portable archive under `resources/ffmpeg(.exe)` and `resources/ffprobe(.exe)`. The path is discovered at runtime by `services/ffmpegBinary.js` by probing `MPI_RESOURCES_PATH` / `CUBRIC_RESOURCES_PATH` / `CUBRIC_PORTABLE_ROOT/resources` / `process.resourcesPath`.
- **exec-bit:** `_ensureExecutable()` in `ffmpegBinary.js` runs `fs.chmodSync(p, mode | 0o111)` on non-Windows if the bit is missing — a self-heal for archives that strip it.
- **Invoked:** via `execFile` (not `spawn`) for short-lived operations; never via shell.

The Python engine is the only other subprocess that is "fetched" (downloaded from GitHub by the engine installer), but it is an unpacked folder, not a binary managed as a dep entry.

---

## Q10 — Cleanest seam for the FIRST native-binary dep (Brush trainer)

### Where per-platform selection lives

`services/ffmpegBinary.js` is the direct template. Create `services/brushTrainerBinary.js` with the same `_resolvePackaged(name)` + `_ensureExecutable(p)` pattern:
```javascript
const name = 'brush-trainer';  // + .exe on win32
// probe: MPI_RESOURCES_PATH, CUBRIC_RESOURCES_PATH, CUBRIC_PORTABLE_ROOT/resources, process.resourcesPath
// fallback: null (fail explicitly — no 'brush-trainer' PATH fallback makes sense)
```

### Where the binary is staged

The existing model is `resources/` inside the portable root. This maps to `process.resourcesPath` in packaged Electron and to `node_modules/{platform}-static-package/bin/binary` in dev. Options:

1. **Bundle in the portable archive (like ffmpeg):** Put `brush-trainer(.exe)` under `resources/` at build time. Requires CI build changes in `mpi-ci` to copy the per-platform binary into the resources folder before archiving. The binary would need to be pre-built and stored somewhere CI can pull it (R2 is the natural place, given that's where all binaries originate).
2. **Download to userData at first use (no precedent, new territory):** Stage it in `app.getPath('userData')`, downloaded via the existing FileDownloader infrastructure and tracked in a new dep entry. No existing `type` covers this — a new type (e.g. `type: 'binary'`) would need to be declared and handled by the installer and orphan sweep. This is the riskier path.

**Recommendation:** Option 1 (bundle in archive) is cleaner and has the existing pattern. Option 2 needs new plumbing throughout the dep pipeline.

### Marking executable on macOS/Linux

The existing pattern is in `ffmpegBinary.js:_ensureExecutable()` (lines 44-53). Apply the same `fs.chmodSync(p, mode | 0o111)` at resolve time — the portable archive's tar writer only sets exec bits on entries `isExecutableEntry()` recognises, and that function (in `scripts/build-portable.mjs`) must be updated to recognise the trainer binary. The self-heal in the resolver covers old bundles or manual copies.

### Portable-build contract changes needed

`docs/releases/portable-distribution-contract.md` lists `isExecutableEntry()` as the source of exec bits in the archive (lines 110-117). The build script must:
1. Add the per-platform binary to the `resources/` folder during the CI build step.
2. Add `brush-trainer` (and `brush-trainer.exe` on win32) to `isExecutableEntry()` in `scripts/build-portable.mjs`.

The update bundle (`resources/` is included in the update delta diff), so updates that bump the trainer version will carry the new binary automatically.

### Code-signing / Smart App Control risk — CRITICAL FLAG

**This is a real and serious risk on Windows.** The portable distribution doc (lines 281-299) documents the SAC situation:

> Smart App Control is on by default after a clean Windows 11 install and blocks `.appref-ms .bat .cmd .chm .cpl .js .jse .msc .msp .reg .vbe .vbs .wsf` with no per-file allowlist and no override in the dialog. An exe is reputation-EVALUATED (standard SmartScreen, with "More info → Run anyway"); scripts are simply dead.

And on signing (line 298):
> **Signing does not fix SAC.** EV no longer grants instant SmartScreen reputation, OV is now equivalent, and SAC blocks signed binaries whose reputation is unknown. Signing starts the reputation clock; it does not skip it.

**The exact risk for an unsigned Rust `.exe`:** SAC evaluates reputation, not just signing. A brand-new binary with no reputation history will trigger SmartScreen's "Windows protected your PC" dialog on first run. Users CAN dismiss it via "More info → Run anyway", but it is a scary dialog that erodes trust. The existing `CubricVision.exe` (Electron) has had time to accumulate reputation; a new `brush-trainer.exe` starts at zero.

**Additional risk:** the project notes that signing is blocked by business shape (`docs/project_signing_blocked_on_business_identifier.md` via memory). A D-U-N-S number is needed for the OV/Org route; EV has its own hurdles. So even signing the binary is not currently straightforward.

**Mitigation options:**
1. Ship inside the Electron process tree: if the trainer is spawned as a child of `CubricVision.exe`, Windows may inherit the parent's reputation for some SmartScreen checks, though SAC treats each PE independently.
2. Keep the binary in `resources/` (inside the app install): the user already trusted the zip they extracted; a binary inside the resources folder they never navigate to is less visible than one sitting beside the main exe.
3. Wrap in a Python script run by the embedded Python — avoids a new `.exe` entirely, though performance may differ.
4. Apply to Apple's Gatekeeper notarization and await Microsoft reputation accumulation over releases.

**Bottom line:** unsigned `.exe` dropped into a Windows portable archive is a real friction point on clean Windows 11 with SAC, but it is NOT a hard block — it is a SmartScreen dialog users can dismiss. The current `CubricVision.exe` itself went through this. Plan for user-facing guidance and ideally pursue code signing via MadPony-Identity MPI-75 (D-U-N-S).

---

## Q11 — How the app supervises the ComfyUI long-lived process

**Spawning** (`routes/comfy.js:497`):
```javascript
processState.activeComfyProcess = spawn(pythonPath, args, {
    cwd: path.dirname(mainPath),
    env: spawnEnv  // PYTHONUTF8=1, PYTHONIOENCODING=utf-8, optional MPS fallback
});
```

**stdout parsing** (`routes/comfy.js:501`, calls `_handleComfyOutput`):
ComfyUI stdout is parsed in `_handleComfyOutput` which extracts tqdm progress bars (`N/M [elapsed<eta]`), model init markers, tile progress (`USDU: t/T`), and segment counts. Each parsed event broadcasts a `comfy:step-progress` or `comfy:tile-progress` event over the `/comfy/events/stream` SSE.

**Progress surfacing to UI** (`docs/generation-lifecycle.md:94`):
```
comfy.js _handleComfyOutput → comfy:step-progress SSE
→ commandExecutor.js SSE listeners
→ phaseProgress.js (createStageProgress)
→ tool:stage + tool:progress events
→ statusBar.js
```
The status bar shows `Stage N/M` with per-stage 0-100% fill. Stage count is recorded per workflow in `js/data/progressStages.js`.

**Engine kill** (`routes/shared.js` `stopComfyUI`): kills by the stored process handle (`processState.activeComfyProcess.kill()`), never by port or name pattern. The exit handler in `comfy.js:503-519` clears the handle and records `lastComfyExit`.

**Cancellation of a generation** (`/comfy/interrupt` POST): sends the ComfyUI interrupt endpoint. This is ADVISORY — a stopped gen can still finish with output (the "late terminal" problem handled in `generationStore`).

**Reuse pattern for the trainer:** The `_runStreaming` helper in `routes/engine.js:279-301` is exactly right for a long-lived subprocess with stdout streaming into SSE:
```javascript
function _runStreaming(cmd, args, { cwd, env, stage } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { cwd, env: env || process.env });
        const onLine = (level, buf) => { /* log + broadcastEngineEvent */ };
        child.stdout.on('data', (d) => onLine('out', d));
        child.stderr.on('data', (d) => onLine('err', d));
        child.on('error', reject);
        child.on('exit', (code) => { code === 0 ? resolve() : reject(new Error(...)); });
    });
}
```

---

## Q12 — Can a non-ComfyUI job use the progress bar?

**YES — the direct StatusBar API exists and is already used for exactly this.**

`docs/generation-lifecycle.md` lines 151-178 document this explicitly under "Mask detects are a UTILITY LANE":

> "So it drives `StatusBar.progress.*` **directly** (`prepare` + `setIndeterminate` + `startClock`, `complete()`/`cancel()` on settle) instead of emitting `tool:*`. That is not laziness: `tool:*` would `_latch(id)` an owner the store can never confirm, and the MPI-208 self-heal above force-idles exactly that."

The generalised rule:
> "**A non-generation ComfyUI run gets the bar, not a lane.** If it has no media output and no gen id, keep it out of the store and drive the display directly."

The StatusBar direct API is `StatusBar.progress.prepare()` / `setIndeterminate()` / `startClock()` / `complete()` / `cancel()`.

**Implications for the Brush trainer:**
- The trainer IS a non-ComfyUI long job with no media output and no gen id.
- Use `StatusBar.progress` directly — indeterminate pulse during training (no percentage unless the trainer emits parseable progress on stdout), then `complete()` or `cancel()` on finish.
- Do NOT register a `generationStore` lane — that would disable the detect row gate and clutter the queue.
- If the trainer emits parseable stdout progress, the stdout can be parsed in a route handler and broadcast over a dedicated SSE endpoint, with a frontend subscriber that calls `StatusBar.progress.setProgress(n)` or the equivalent label update. This is new plumbing but light: the existing `commandExecutor` pattern shows how.
- The existing coalesced completion notifications (toast + OS notification) are tied to `generationStore` and `generation:complete` events — the trainer would NOT get those automatically. A separate route-level `Events.emit('ui:success', ...)` or toast after training completes is the right shape.

---

## Summary table

| Question | Answer |
|---|---|
| Q8: Native binary precedent? | YES — ffmpeg/ffprobe, bundled in `resources/`, resolved by `services/ffmpegBinary.js`. No precedent for downloading a native binary as a dep at runtime. |
| Q9: ffmpeg handling | Bundled in portable archive under `resources/ffmpeg(.exe)`. Dev uses `ffmpeg-static` npm package. Resolved at startup by `services/ffmpegBinary.js`; exec bit self-healed on non-Windows. |
| Q10: Cleanest seam + signing risk | Clone `ffmpegBinary.js` for `brushTrainerBinary.js`; add binary to `resources/` in CI build; add to `isExecutableEntry()` in `build-portable.mjs`. Signing risk on Windows is real but not a hard block — SmartScreen dialog, not SAC block. Unsigned new `.exe` starts with zero reputation. |
| Q12: Non-ComfyUI job → progress bar? | YES — drive `StatusBar.progress.*` directly (the mask-detect pattern). Do NOT enter `generationStore`. Indeterminate is honest if no parseable stdout progress exists. |
