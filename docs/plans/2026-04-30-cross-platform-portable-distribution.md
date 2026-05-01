# Cross-Platform Portable Distribution

**Goal:** ship a portable Windows zip that is fully usable from a fresh unzip, then extend the app to Linux and macOS in a way that is honest about what can and cannot be validated from a Windows-only development machine.

**Primary constraint:** development happens on one Windows machine. Windows can be built and tested locally. Linux and macOS cannot be treated as done until they have passed at least one real-host smoke test on that platform.

---

## Plan Type

This is an execution plan for a solo maintainer.

- Audience: the app maintainer working from Windows
- Purpose: make the current Electron app and ComfyUI bootstrap path portable without assuming a multi-machine lab
- Scope:
  - In scope: runtime portability refactors, Windows portable packaging, Linux/macOS engine bootstrap work, build-host strategy, testing gates
  - Out of scope: code signing, notarization, auto-update, polished CI/CD release automation, App Store packaging

---

## Current Reality

The current app is only partially cross-platform.

- `routes/platformEngine.js` centralizes some platform paths, but it still assumes a Windows-portable ComfyUI layout in important places.
- `routes/comfy.js`, `routes/shared.js`, `routes/engine.js`, `routes/downloadManager.js`, and `main.js` all depend on those paths.
- `routes/engine.js` currently downloads a Windows `.7z`, extracts it, and patches `run_nvidia_gpu.bat`.
- `routes/projects.js` still shells out to bare `ffmpeg` / `ffprobe` in one route instead of always using the bundled resolver.
- `routes/system.js` still has Windows-only behavior in `/open-folder`.
- `docs/worktrees.md` explicitly documents that `node_modules` are platform-specific and cannot be shared safely.

Because of that, adding a Linux/macOS branch to `resolveDownloadConfig()` is not enough by itself. The path model and a few runtime shell calls must be fixed first.

---

## Release Strategy

The release strategy for this effort is phased.

### Phase target order

1. **Windows supported**
   Buildable and testable on the local Windows machine.

2. **Linux experimental**
   Implemented behind real-host validation gates. No public "works" claim without one real Linux smoke test.

3. **macOS experimental**
   Implemented behind real-host validation gates. No public "works" claim without one real macOS smoke test.

### Definition of done by platform

- **Windows:** local unzip, double-click launch, engine install, basic generation flow, folder open, and video crop all verified on the Windows dev machine.
- **Linux:** build produced on Linux or Linux CI, plus one real Linux smoke test.
- **macOS:** build produced on macOS or macOS CI, plus one real macOS smoke test.

---

## Testing Policy

Testing is part of this plan.

### What can be tested on the Windows machine

- Windows packaging and launch behavior
- Shared Node/Electron code paths
- Path helper logic, if tests are written to load modules in a controlled way
- Static audits for Windows-only shell commands
- Some Linux-oriented backend checks inside WSL, if needed

### What cannot be honestly treated as fully tested on the Windows machine

- Linux desktop launch UX
- Linux Electron packaging behavior
- macOS launch UX
- macOS Electron packaging behavior
- Any claim that `comfy-cli` layout matches the app's runtime assumptions on macOS/Linux

### Practical testing options

- **Linux:** WSL or a Linux VM can help with backend and path checks, but they are not a substitute for final Electron desktop validation.
- **macOS:** there is no reliable Windows-only substitute for final validation. Use a real macOS machine, a macOS CI runner, or a short manual smoke session on rented hardware before calling the release viable.

### Minimum merge gate for Linux/macOS code paths

If cross-platform code is merged before a real target-host test exists, all of the following must be true:

- Windows regressions are checked locally.
- New path helpers are covered by a repeatable script or test.
- All touched Windows-only shell commands are either removed, platform-switched, or explicitly left out of scope with comments.
- The plan and release notes clearly mark Linux/macOS as unverified.

### Minimum release gate for Linux/macOS artifacts

Do not publish a Linux or macOS portable artifact until all of the following are true:

- The artifact was built on that target OS or on a CI runner for that OS.
- The app launches from the packaged artifact.
- Engine bootstrap succeeds on that OS.
- Folder open works.
- Video crop works.
- One basic generation flow completes.

---

## Phase 0: Runtime Portability Groundwork

- [ ] **0.1. Refactor ComfyUI path helpers**
  Replace the current "one helper fits everything" approach with explicit helpers in `routes/platformEngine.js`.

  Add or refactor helpers for:
  - Comfy root
  - Comfy app directory
  - `main.py`
  - Python binary
  - models directory
  - custom nodes directory
  - `extra_model_paths.yaml`
  - input directory
  - output directory

  The important rule is that callers should stop assuming `engine/<COMFY_DIR>/ComfyUI/...` is always the shape on every platform.

  **Verify:** add a small script or test that prints or asserts all resolved paths for the current platform, and make sure the helpers can be exercised without hand-editing runtime globals mid-process.

- [ ] **0.2. Update all current consumers to use the new helpers**
  Audit and update:
  - `routes/comfy.js`
  - `routes/engine.js`
  - `routes/shared.js`
  - `routes/downloadManager.js`
  - `main.js`
  - any other caller using `COMFY_DIR` or hard assumptions about `ComfyUI/...`

  **Verify:** Windows app still boots, engine status still reports correctly, ComfyUI still starts, and temp-folder cleanup still targets the expected directories.

- [ ] **0.3. Fix runtime portability gaps unrelated to engine install**
  Before shipping anything cross-platform, remove the known non-portable runtime calls:
  - update `/open-folder` in `routes/system.js` to switch by platform
  - update the video extract route in `routes/projects.js` to use the bundled ffmpeg/ffprobe resolver instead of PATH commands
  - do a grep audit for other Windows-only shell commands in the touched backend files

  **Verify:** on Windows, folder open and video crop still work after the refactor. For non-Windows code paths, confirm the branches are explicit and syntactically valid.

- [ ] **0.4. Document unsupported or unverified paths in comments where needed**
  If a code path is intentionally unverified until Linux/macOS testing exists, say so in a brief comment at the risky call site.

  **Verify:** a future maintainer can tell which parts are structurally cross-platform and which parts still need real-host proof.

---

## Phase 0 Implementation Map

This section exists to reduce partial refactors and missed call sites.

### File-by-file responsibilities

- **`routes/platformEngine.js`**
  - Introduce or refactor explicit helpers for:
    - Comfy root
    - Comfy app directory
    - `main.py`
    - Python binary
    - models directory
    - custom nodes directory
    - `extra_model_paths.yaml`
    - input directory
    - output directory
  - Keep `resolveDownloadConfig()` focused on install mode plus download metadata.
  - Preferred shape:
    - Windows returns an archive-based install mode.
    - Linux/macOS return a `comfy-cli` install mode.

- **`routes/comfy.js`**
  - Replace direct dependence on `getComfyPath(..., 'main.py')`, `getComfyPath(..., 'models')`, `getComfyPath(..., 'custom_nodes')`, and `getComfyPath(..., 'extra_model_paths.yaml')`.
  - Re-check:
    - `/comfy/start`
    - `/comfy/set-path`
    - `/comfy/models/check`
    - `/comfy/list-files`

- **`routes/shared.js`**
  - Replace default model/custom-node/input/output directory resolution with the new explicit helpers.
  - Keep `getCustomRoot()` aligned with the real `extra_model_paths.yaml` location after the refactor.
  - Re-check:
    - `resolveComfyPath()`
    - `getCustomRoot()`
    - `cleanComfyUITempFiles()`
    - universal workflow dependency checks

- **`routes/engine.js`**
  - Split the current install logic into clearly separated paths:
    - Windows archive install
    - Linux/macOS `comfy-cli` install
  - Keep the SSE event contract stable so the frontend does not need a second rewrite.
  - Update:
    - `/engine/status`
    - `/engine/version-check`
    - any post-install path writes

- **`routes/downloadManager.js`**
  - Replace the default models/custom-nodes roots with the new helpers.
  - Preserve:
    - resumable downloads
    - custom-node install ordering
    - universal workflow dependency behavior

- **`main.js`**
  - Update only the temp-folder cleanup path usage.
  - Do not let launcher work and Comfy path work get mixed together in the same change without a reason.

- **`routes/system.js`**
  - Make `/open-folder` explicitly platform-switched.
  - If Linux support is not fully implemented yet, fail clearly instead of silently assuming Windows shell behavior.

- **`routes/projects.js`**
  - Replace the bare `ffprobe` / `ffmpeg` shell commands in the extract route with the bundled resolver used elsewhere.

### Anti-mistake rules for agents

- Do not treat `PYTHON_BIN_PARTS_MAP` as the whole problem. The broader Comfy path layout is the real dependency surface.
- Do not change only `routes/platformEngine.js` and stop. `routes/comfy.js`, `routes/shared.js`, `routes/engine.js`, and `routes/downloadManager.js` are all part of the same refactor.
- Do not verify non-Windows behavior by mutating `process.platform` inside a long-lived process and calling it done. Use fresh process loads for path tests, and require a real host for release confidence.
- Do not mark Linux or macOS as supported just because the code path compiles.

### Recommended PR split

If the work is executed in batches, split it like this:

1. Path-helper refactor plus consumer updates
2. Windows-only runtime portability fixes (`open-folder`, ffmpeg/ffprobe route)
3. Windows portable zip build path
4. Linux experimental install/build path
5. macOS experimental install/build path

This keeps the first three changes locally testable on the Windows machine.

---

## Phase 1: Windows Portable Zip

This is the first fully supported deliverable because it is the only platform that can be built and tested locally end to end.

- [ ] **1.1. Create a Windows launcher that does not rely on `npm start`**
  Add a Windows launcher that starts the app without showing an unnecessary terminal window.

  Important:
  - do not target `node_modules/.bin/electron`
  - call the real Electron entry correctly, either through `node_modules/electron/cli.js` or the real Electron executable in the packaged layout

  Keep a fallback batch file for debugging if useful.

  **Verify:** unzip the build on Windows, double-click the launcher, and confirm the app window opens.

- [ ] **1.2. Build a Windows-only portable packaging script**
  Create a build script for Windows first.

  Suggested output structure:
  ```text
  CubricStudio_windows/
    node/
    app/
    CubricStudio.vbs
    start-debug.bat
  ```

  Responsibilities:
  - stage the app source and required `node_modules`
  - stage the Windows Node runtime
  - stage the Windows Electron runtime in the correct location
  - preserve the existing `engine/` exclusion
  - preserve anything needed for bundled ffmpeg/ffprobe resolution
  - zip the staged directory into `dist/`

  **Verify:** perform a full local unzip-and-launch test on Windows from outside the repo.

- [ ] **1.3. Write a Windows smoke checklist into the plan or release notes**
  The first Windows smoke pass must include:
  - launch from unzip
  - engine install
  - model path write
  - ComfyUI start
  - one generation
  - open folder
  - video crop

  **Verify:** all items are checked on the same artifact that would be shared publicly.

---

## Phase 2: Linux Experimental Support

Linux should not be treated as supported until a real Linux host or Linux CI runner produces and validates the artifact.

- [ ] **2.1. Add Linux engine bootstrap mode**
  Extend `routes/platformEngine.js` and `routes/engine.js` so Linux can install ComfyUI through `comfy-cli` instead of the Windows `.7z` archive.

  Requirements:
  - the Linux branch must return an explicit install mode, not just a different string
  - the install code must emit SSE progress events that keep the existing frontend flow usable
  - Linux-specific bootstrap logic must not break the Windows path

  **Verify:** on Windows, validate the Linux branch through isolated scripts or tests only. Mark it unverified until a Linux host runs it for real.

- [ ] **2.2. Define a Linux launcher format**
  A plain `start.sh` is useful for debugging, but it is not enough by itself if the goal is a normal double-click launch experience.

  Decide on the Linux release wrapper:
  - shell launcher for debug use
  - `.desktop` file for user-facing launch

  **Verify:** final validation requires a real Linux desktop environment.

- [ ] **2.3. Add a Linux-native build path**
  Do not promise Linux packaging from the Windows box.

  Add a Linux build entry that is meant to run on:
  - a Linux machine, or
  - a Linux CI runner

  **Verify:** artifact is built on Linux and smoke-tested there before release.

---

## Phase 3: macOS Experimental Support

macOS has the strictest testing constraint because the final validation must happen on macOS.

- [ ] **3.1. Prove the macOS ComfyUI layout first**
  Before wiring the macOS install path into the main app flow, confirm that the chosen install method produces a layout compatible with the app's runtime expectations or update the helpers to match the real layout.

  **Verify:** this requires a real macOS run. Do not treat a guessed path as complete.

- [ ] **3.2. Add macOS engine bootstrap mode**
  Once the real layout is known, add the macOS branch to the engine bootstrap flow.

  Requirements:
  - same SSE behavior as Windows/Linux
  - no Windows batch-file patch assumptions
  - no claims of support until real-host validation exists

  **Verify:** code-path validation on Windows is acceptable for merge, but not for release.

- [ ] **3.3. Choose a macOS launcher strategy**
  If the public goal is unzip and double-click, prefer a real macOS app-style wrapper over a developer-only terminal command.

  At minimum, the plan must distinguish:
  - internal smoke launcher
  - public release launcher

  **Verify:** launch UX must be checked on macOS before public release.

- [ ] **3.4. Add a macOS-native build path**
  Do not promise a macOS artifact built only from Windows.

  Add a macOS build entry that is meant to run on:
  - a macOS machine, or
  - a macOS CI runner

  **Verify:** artifact is built on macOS and smoke-tested there before release.

---

## Recommended Order of Work

Execute the work in this order:

1. Phase 0.1 through 0.3
2. Phase 1.1 through 1.3
3. Stop and ship the Windows portable zip first
4. Phase 2, but only as experimental until Linux real-host validation exists
5. Phase 3, but only as experimental until macOS real-host validation exists

This order keeps the first shippable outcome aligned with the only platform you can fully validate yourself.

---

## Explicit Non-Goals for This Pass

- Code signing
- macOS notarization
- SmartScreen reputation work
- Auto-updates
- Full cross-platform CI release automation
- Perfect GPU telemetry parity across all OSes
- Claiming Linux or macOS support before a real-host smoke test

---

## Acceptance Summary

This plan is complete only when all of the following are true:

- Windows portable zip is buildable and locally smoke-tested.
- The path model no longer assumes Windows-portable ComfyUI everywhere.
- Runtime Windows-only shell commands that block portability are fixed or clearly quarantined.
- Linux/macOS work is marked experimental until real-host validation exists.
- No platform is described as supported unless its artifact has been built and smoke-tested on that actual OS.
