<original_task>
Execute Phase 7 (Validation) of `docs/plans/2026-04-26-raw-gpu-pipeline.md` — verify the GPU-based raw image adjustments pipeline (PixiJS v8 replacing Sharp) works end-to-end. User flagged that prior agents marked phases done without testing because the app could not be tested headlessly. Goal of this session: get all controls rendering without console errors so the user can hand off to a different session for per-control correctness validation.

Original ask was scoped to **fixing crashes**, not validating shader correctness. User said earlier sessions over-promised; we agreed Phase A = no errors, Phase B = correctness in a separate session.
</original_task>

<work_completed>
## Plan / file audit

- Read `docs/plans/2026-04-26-raw-gpu-pipeline.md` end-to-end. Phase 1–6 marked done. Phase 7 mostly open. Audit produced 11 flagged issues (toDataURL jank in Auto-WB, perf log strip pending, dead curve code, etc.) — most fixed below.
- Read all touched files: `js/utils/rawGpuPipeline.js`, `js/components/Organisms/MpiToolOptionsRaw/MpiToolOptionsRaw.js`, `js/components/Primitives/MpiCanvas/MpiCanvas.js`, `js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js`, `routes/imageBake.js`, `index.html`, `server.js`, `package.json`. Confirmed Phase 1–6 wiring matches plan.
- Inspected `node_modules/pixi.js/dist/pixi.mjs` directly for v8 internals (lines 17040–17202 preprocessor, 17736–17810 UniformGroup, 18215–18260 Filter constructor, 22405–22421 max-ifs probe, 51395–51439 GlUniformGroupSystem._getSignature) to verify API expectations rather than guess.
- Fetched verified Pixi v8 reference shaders via WebFetch from `github.com/pixijs/pixijs/dev`:
  - `src/filters/defaults/displacement/displacement.frag` — confirmed `uTexture` (not `uSampler`), `finalColor` (not `fragColor`), `uInputSize` auto-provided.
  - `src/filters/defaults/defaultFilter.vert` — uses `uOutputTexture` (not `uScreenSize`), specific position math.
  - `src/filters/defaults/alpha/AlphaFilter.ts` — confirmed canonical `GlProgram.from()` + `new UniformGroup()` + named resource key (e.g. `alphaUniforms`) pattern.

## File modifications

### `js/utils/rawGpuPipeline.js` (heavy rewrite)

- Vertex shader replaced with Pixi v8 default verbatim. Now uses `uOutputTexture` and the projection math from upstream. Prepended `#version 300 es\nprecision highp float;` to ensure ES3 compile in any code path.
- All 8 fragment shaders prepended with `#version 300 es\nprecision highp float;` (was getting compiled as ES1 → all ES3 features like `texelFetch`, `uvec2`, `uint` failed).
- All sampler uniforms renamed `uSampler` → `uTexture` (Pixi v8 binds input texture to `uTexture`).
- All output uniforms renamed `out vec4 fragColor;` → `out vec4 finalColor;` plus assignments `fragColor = ...` → `finalColor = ...` and `fragColor=` (no-space, in GRAIN frag) → `finalColor=`.
- Re-added `uniform vec4 uInputSize;` declarations in UNSHARP and FILM_GRAIN frags (Pixi only auto-provides this if declared in fragment).
- Filter creation refactored to canonical Pixi v8 pattern:
  - `new Filter({ glProgram: { vertex, fragment }, resources: { uniforms: {...} } })` REPLACED with
  - `new Filter({ glProgram: GlProgram.from({ vertex, fragment, name }), resources: { <name>Uniforms: new UniformGroup({...}) } })`
  - Helper `mkFilter(frag, name, uniforms)` creates each. Group keys are now distinct per filter (`exposureUniforms`, `shadowsUniforms`, `hueSatUniforms`, `nrUniforms`, `unsharpUniforms`, `grainUniforms`, `dehazeUniforms`).
  - Curves filter passes `lutTexture.source` (TextureSource) directly to `uCurveRGB/R/G/B` resource slots.
- `_pushUniforms` updated to new resource paths (`this._fExposure.resources.exposureUniforms.uniforms.uEV` etc).
- Identity LUTs and curve LUTs now use `new Texture({ source: new BufferImageSource({ resource, width, height, format: 'rgba8unorm' }) })` (was `Texture.fromBuffer`, which doesn't exist in v8). Each identity LUT gets its own buffer instance to avoid texture state conflicts.
- Added `BufferImageSource`, `GlProgram`, `UniformGroup` to imports.
- `Application.init` now passes `autoStart: false`, `sharedTicker: false`, plus `this._app.ticker?.stop()` after init. Suppresses Pixi's auto-render loop. Manual render only runs in `_render()`.
- Stripped per-frame perf log (`this._t0`, `tRender`, `tTotal`, `clientLogger.info` timing line) per Phase 7 plan to-do.
- Stripped dead `EPS/atBottom/atTop` variables in `_drawCurve` of MpiToolOptionsRaw.
- Added a one-time WebGL diagnostic patch in `mount()`: wraps `WebGLRenderingContext.prototype.compileShader` (and WebGL2's separately, captured per-prototype to avoid "Illegal invocation") to log `GLSL compile FAIL:` with verbatim source on failure. **This patch is still active.** It surfaces real GLSL errors in `app.log`.

### `js/components/Organisms/MpiToolOptionsRaw/MpiToolOptionsRaw.js`

- Added histogram background to curve canvas: `_computeHistogram()` samples 256×256 of source image, log-scales 256-bin luma histogram into `Float32Array`, drawn as filled `rgba(255,255,255,0.18)` shape behind the spline. Recomputed on every `_mountPipeline()`.
- Added hollow endpoint circles at `(0,1)` (black point) and `(1,0)` (white point) in `_drawCurve` to match user's reference screenshots.
- Curve math UNCHANGED — single draggable mid control point, Catmull-Rom Hermite spline through (0,0), ctrl, (1,1). User confirmed prior commit also single-point.
- Eager mount: added `if (viewer.el.img?.naturalWidth) _mountPipeline();` after `entry-loaded` listener registration so opening the raw tool when an entry is already loaded triggers mount immediately (was previously waiting for entry-loaded that already fired).
- Auto-WB no longer round-trips through `toDataURL('image/png')`. Now passes the offscreen 2D canvas directly to `_pipeline.mount(canvasShim, ...)` with `Object.assign(offscreen, { naturalWidth: W, naturalHeight: H })` shim because pipeline reads `srcImg.naturalWidth/naturalHeight`.
- `el.destroy` now calls `viewer.el.clearProcessedImage?.()` so leaving the raw tool reverts the canvas to the source image.

### `js/components/Primitives/MpiCanvas/MpiCanvas.js`

- Added `clearProcessedImage()` method on `_CanvasCore` — closes any held ImageBitmap, nulls `_processedBitmap`, redraws.
- Added `'clearProcessedImage'` to factory `_methods` array so it's exposed on `el`.

### `js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js`

- Added on `el`:
  - `setProcessedImage(bitmap)` — proxies to inner `canvasInst.el.setProcessedImage`
  - `clearProcessedImage()` — proxies to inner `canvasInst.el.clearProcessedImage`
  - `img` getter via `Object.defineProperty` — exposes inner `canvasInst.el.img`
- Required because `MpiToolOptionsRaw.js` reads `viewer.el.img` and calls `viewer.el.setProcessedImage`. Previously these only existed on inner MpiCanvas; the viewer wrapper had no proxy, so calls failed silently or threw "is not a function".

## What user reports working now

- Initial load — no GLSL FAIL logs.
- Exposure, shadows, point curve sliders — no errors.
- Saturation slider — no errors.
- All other slider controls render without uniform/shader crashes.

## What user reports still broken (handed off below)

- BindGroup.setResource null crash when leaving the raw tool.
- Continuous GPU usage even when idle (UI laggy).
- Auto-WB visibly shrinks the image.
- Apply bake throws `WebGL: INVALID_VALUE: texImage2D: bad image data` (and a new history entry IS created — possibly with bad data).
- Filters appear to persist on canvas after leaving the tool (the `clearProcessedImage` fix landed mid-session, not yet retested).
</work_completed>

<work_remaining>
## Bugs to fix (sorted by risk to user)

1. **BindGroup.setResource null crash on tool exit** — stack:
   ```
   at BindGroup.setResource (pixi.mjs:17583:43)
   at FilterSystem._applyFiltersToTexture (pixi.mjs:19193:33)
   at FilterSystem.pop (pixi.mjs:18902:10)
   ...
   at TickerListener.emit (pixi.mjs:8196:18)
   ```
   Stack still shows `TickerListener.emit` — meaning Pixi's ticker is STILL firing post-destroy despite `autoStart: false`. May need to also unhook ticker callback explicitly in `destroy()`, or destroy may be racing with an already-queued tick. Investigate: does `_app.destroy(true, ...)` cancel pending ticks? Likely a sprite filter still has a stale resource reference after destroy. Re-test with the `clearProcessedImage` change applied — maybe the bitmap Reference itself is the dangling resource.

2. **Apply bake `WebGL: INVALID_VALUE: texImage2D: bad image data`** — happens during `renderFullRes()` → `_app.canvas.toBlob(...)`. Suspect: render at full resolution exceeds texture limit, OR rendering with an empty/destroyed texture. Verify `this._app.render()` runs successfully before `toBlob`. Add a `_render()` call before `toBlob` to ensure latest uniforms applied. Possibly the bake is using stale GPU state from preview.

3. **Auto-WB shrinks the image** — pipeline mounts against the 256×256 (or whatever) offscreen sampling canvas?? No — `_applyAutoWB` creates `offscreen` at `W×H` of source. But check whether `srcEl` resolution detection is accurate when `srcEl` is a canvas (uses `srcEl.width/height`). If source is the inner 2D canvas already drawn-to at display size (not natural size), the bake mounts at display dims → shrunk image. Fix: ensure Auto-WB always reads from `viewer.el.img` (the original `<img>`) directly, never from the canvas. Then `srcEl.naturalWidth/naturalHeight` are the true dimensions.

4. **Continuous GPU render** — `autoStart: false` plus `ticker.stop()` should suffice, but stack shows ticker still firing. Check if the user has stale browser caches. If ticker still active, may need `Application.init({ ticker: null })` or explicitly delete `_app.ticker`. Validate by adding `console.log` in `_render` and watching frequency at idle.

5. **Filters persist after tool exit** — already addressed via `clearProcessedImage` in `el.destroy`. Needs verify-on-test.

## Phase 7 plan to-dos still open

From `docs/plans/2026-04-26-raw-gpu-pipeline.md`:

- [ ] Verify color space matches expected output (sRGB vs linear-light) on test image — Phase 2 to-do, never done.
- [ ] Profile frame time on 8K image at 100% zoom while dragging slider — Phase 2.5 to-do, never done. Note: my perf log strip removed the timing instrumentation.
- [ ] Spot-check on 16K (outlier ceiling) — Phase 2.5.
- [ ] Validate each shader visually against test reference images — Phase 3.
- [ ] Validate dehaze against test images with haze — Phase 3.5.
- [ ] **Phase 7 — full per-control test pass.** Per user request, owed in NEXT session as a structured plan that walks each control: expected behavior, test image, pass/fail. User can run tests, agent fixes shaders.

## Validation plan to author (next session)

User's stated workflow: "I can only test in the app if the control is doing what it should." So next session needs a plan file like `docs/plans/2026-04-27-raw-gpu-validation.md` that lists per-control test cases. Suggested structure per control:
- Control name + slider range
- Default state expectation (image unchanged at 0)
- At max value: expected qualitative effect
- At min value (bipolar): expected effect
- Failure modes to flag (no visual change, wrong direction, color cast, image scale change, etc.)

Controls to cover: exposure, shadows, saturation, dehaze, sharpening, noise reduction, grain, point curve, white balance (As shot / Auto), per-color hueR/G/B, satR/G/Y. Plus Apply (bake).

## Diagnostic patch cleanup (post-validation)

`rawGpuPipeline.js` `mount()` has a `RawGpuPipeline._glPatched` block monkey-patching `compileShader` to log GLSL failures. Useful right now for diagnostics — should be removed before committing once everything stabilizes.
</work_remaining>

<attempted_approaches>
## What didn't work (chronological)

1. **First fix attempt — `Texture.fromBuffer` rename only.** Wrong: API doesn't exist in Pixi v8. Crashed `_applyAutoWB`.
2. **Second — added `#version 300 es` to all frags.** Compiled, but driver eliminated `uEV` as dead code because shaders sampled `uSampler` (undefined) → output was constant black → all uniforms got optimized out → `_uniformData[uEV]` undefined → `_getSignature` crash.
3. **Third — renamed `uSampler` → `uTexture`.** Discovered Pixi v8 binds input texture to `uTexture` (line 18224). Fixed dead-code elimination but uniforms still missing — root cause was elsewhere.
4. **Fourth — stripped `#version 300 es` and `precision highp float;` to match Pixi default frag style.** Pixi auto-prepends both based on `isES300` detection. But: `isES300` is detected by literal `#version 300 es` substring in frag source. Stripping it set `isES300=false` → ES1 mode → ES3-only features (`texelFetch`, `uvec2`, `uint`, `textureSize`) failed to compile.
5. **Fifth — re-added `#version 300 es` to all frags but kept Pixi-native `finalColor` / `uTexture`.** Compile OK but uniform-not-found persisted because Filter resource group construction was non-canonical.
6. **Sixth — refactored to `GlProgram.from(...)` + `new UniformGroup(...)` + per-filter group key (`exposureUniforms` etc).** This was the structural fix that made all uniforms register correctly. Combined with `uInputSize` redeclaration in UNSHARP/GRAIN and the missed `fragColor=` (no-space) in GRAIN, all shaders finally compiled and rendered.

## Dead ends to avoid

- Don't trust `Texture.fromBuffer` — gone in v8. Use `BufferImageSource`.
- Don't omit `#version 300 es` on frags that use `texelFetch`, `uvec2`, `uint`, `textureSize` — Pixi's ES3 detection is purely textual.
- Don't pass `{ uniforms: {...} }` as the inner key. Pixi auto-wraps it but then `_uniformData` extraction fails. Always use `new UniformGroup()` explicitly with a named outer key.
- Don't pass `Texture` to a sampler resource slot — pass `texture.source` (the TextureSource).
- Don't share a single Uint8Array across multiple BufferImageSources — texture state conflicts. Each LUT gets its own buffer.
- Don't share native `compileShader` capture across WebGL1/WebGL2 prototypes — "Illegal invocation". Capture per-prototype.

## Approaches considered but not pursued

- Downgrading to PixiJS v7 — user offered. Avoided because v8 is stable enough (release was 2 weeks ago per user; some open issues but our path verified against current main). Also: rewriting wiring twice would burn more time than fixing v8.
- Bypass MpiCanvas (Path 2 from plan) — only triggers if frame time exceeds 16ms at 8K. Not applicable yet (no profiling done).
</attempted_approaches>

<critical_context>
## Pixi v8 filter API — verified facts (use these, do not re-discover)

- Input texture is bound to `uniform sampler2D uTexture;` (NOT `uSampler`).
- Fragment output must be `out vec4 finalColor;` and assigned via `finalColor = ...`.
- `uInputSize`, `uOutputFrame`, `uOutputTexture` auto-provided by Pixi when declared in vertex; `uInputSize` also auto-bound to fragment IF the fragment declares it.
- For ES3 features, fragment MUST start with `#version 300 es`. Pixi detects literal substring; otherwise treats as ES1.
- Vertex shader: when paired with ES3 fragment, Pixi auto-prepends `#version 300 es`. But do not rely on this — our vert has `#version 300 es` explicit to survive non-ES3 code paths.
- Custom uniforms must be wrapped in `new UniformGroup({ uName: { value, type } })` and passed under a NAMED key in `resources`. Plain inline `{ uniforms: { ... } }` does not produce correct `_uniformData`.
- Sampler resources (textures other than `uTexture`) take `TextureSource` instances, e.g. `lutTexture.source`. Not `Texture` wrapper.

## App architecture / wiring (verified this session)

- `MpiToolOptionsRaw.js` receives a `viewer` prop that is `MpiCanvasViewer` instance (NOT raw `MpiCanvas`).
- `viewer.el` is the DOM element with proxied methods. Inner canvas reachable via `viewer.el.getImageEl()` returning `canvasInst.el` (MpiCanvas root).
- We bridged `setProcessedImage`, `clearProcessedImage`, and `img` onto `viewer.el` to avoid every consumer having to drill into `getImageEl`.

## Plan/decisions

- Original plan path = "Path 1": pipeline produces full-res bitmap → MpiCanvas.setProcessedImage → existing zoom/pan/crop code uses it. Confirmed wired; bitmap flow works end-to-end now (controls render).
- The earlier session that built the GPU pipeline skeleton: `cc74d623-6bc0-44e3-970a-3431df9bb8dc` (per user). Not re-read this session.
- Curve uses single draggable point + 3-point Catmull-Rom Hermite spline. Endpoints are static. User clarified earlier sessions never had multi-point curve — only "white point doesn't is not controllable" referred to missing endpoint hollow circles + histogram (now drawn).

## Environment

- Electron is the only test target. Browser broken (per `feedback_testing_desktop.md` memory).
- App runs at `http://127.0.0.1:3000/` for in-Electron loading.
- Logs: `C:\Users\Fabio\AppData\Roaming\cubric-studio\logs\app.log` — main terminal output. Use `Read` with offset to tail last 100 lines.
- Pixi v8.18.1 installed. Imported via importmap in `index.html` → `/node_modules/pixi.js/dist/pixi.mjs`.

## Diagnostic instrumentation still in code

- `rawGpuPipeline.js` `mount()` patches `compileShader` to log `[rawGpu] GLSL compile FAIL:` with verbatim source on failure. Surfaced real driver errors that resolved 3 distinct shader bugs. Leave in for now; remove before final commit.

## What user said about commits

- **No commits this session.** User explicitly said: "And only when everything is running can we commit."
- All Phase 7 items still incomplete. Do not stage or commit.

## User-stated test method

- User personally drives the app in Electron, reports console errors back. No automated test harness available (Playwright CLI was deleted; reinstall discussed in parallel session, not done).
- Implication: every cycle costs human-loop time. Verify changes via reasoning + log evidence before asking user to retest.
</critical_context>

<current_state>
## Status

- **Phase 1–6:** marked done in plan. Verified by inspection. Pipeline mounts, filters compile, rendering produces image.
- **Phase 7:** in progress.
  - Crash-free render: ~90% there. All sliders no longer crash uniform sync. 
  - Remaining crashes: tool-exit BindGroup, Apply texImage2D, Auto-WB sizing.
  - Per-control validation plan: NOT STARTED. Owed for next session.

## Files in working tree (uncommitted)

Modified:
- `js/utils/rawGpuPipeline.js` (heavy)
- `js/components/Organisms/MpiToolOptionsRaw/MpiToolOptionsRaw.js`
- `js/components/Primitives/MpiCanvas/MpiCanvas.js`
- `js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js`
- `js/components/types.js` (setProcessedImage method documentation already there)
- `index.html` (importmap for pixi.js)
- `package.json` / `package-lock.json` (added pixi.js, multer)
- `server.js` (route swap imageAdjust → imageBake)
- `js/utils/rawPreview.js` (gutted to no-op stub)

New (untracked):
- `routes/imageBake.js`
- `js/utils/rawGpuPipeline.js`
- `docs/plans/2026-04-26-raw-gpu-pipeline.md`
- `docs/shader-sources.md`
- `whats-next.md` (this file)

Deleted (uncommitted):
- `routes/imageAdjust.js`
- `plans/2026-04-26-raw-gpu-pipeline.md` (moved to docs/)

## Last Phase A action (just before handoff)

Applied `autoStart: false`, `sharedTicker: false`, `ticker.stop()` to `Application.init` to stop continuous GPU. Added `clearProcessedImage` end-to-end (MpiCanvas → MpiCanvasViewer → MpiToolOptionsRaw.destroy). NOT YET RETESTED by user.

## Open questions

- Does `clearProcessedImage` in `el.destroy` actually run? Component teardown order in MpiGroupHistoryBlock when switching tools must call `instance.destroy()` per CLAUDE.md "Observer Lifecycle & Teardown Contract". Verify component is using factory pattern correctly.
- Is the BindGroup null-resource crash fixed by `clearProcessedImage`? Maybe — the dangling resource may have been the bitmap reference. Retest first.
- Apply bake bad-image-data: needs root cause. Likely toBlob race with destroyed/swapped texture state.

## Recommended next-session entry point

1. Read this `whats-next.md` plus `docs/plans/2026-04-26-raw-gpu-pipeline.md`.
2. Have user retest in Electron: open raw tool, switch to other tool, switch back, click Apply, click Auto-WB. Capture console + `app.log` tail.
3. Address bugs in order from `<work_remaining>` section 1.
4. After all crashes resolved, write `docs/plans/2026-04-27-raw-gpu-validation.md` with per-control test plan. User executes, agent fixes shader correctness.
5. Final cleanup: remove `compileShader` diagnostic patch in `rawGpuPipeline.js` `mount()`.
6. Then commit.
</current_state>
