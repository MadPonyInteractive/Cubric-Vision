# MPI-260 — Remove Background (History workspace tool)

## Decision (evaluated, not guessed)

**Model:** BiRefNet (MIT). Benched rembg+BiRefNet on 5 hard images (fur, curly/flyaway hair, fishnet, dragon wings) → all production-grade. Alternatives rejected on **license**: @imgly ISNet (AGPL + dead), BRIA RMBG-1.4/2.0 & transformers.js RMBG-2.0 (CC-BY-NC = paid for a commercial product). `birefnet-portrait` dropped (head/shoulder-only, failed full-body/animal cases). Use **general** only.

**How it runs:** as a ComfyUI workflow inside the existing engine (CLAUDE.md: no rogue Python/pip). NOT a rembg subprocess. It's a **universal operation** exactly like `imageUpscale` (single image in → single image out, no model tie, toolbar-only, not in PromptBox).

**Node:** ComfyUI **native** `RemoveBackground` — confirmed present at the app's pinned ComfyUI `v0.27.0` (commit `bb131be`, `comfy_extras/nodes_bg_removal.py`). **Zero custom-node dep.** Fallback only if ever removed: lldacing/ComfyUI_BiRefNet_ll (MIT).
- `LoadBackgroundRemovalModel` (combo over `background_removal/` folder) → `bg_model`
- `RemoveBackground` (bg_model + image) → **MASK only** (NOT rgba — research was wrong; verified in source)
- compose with built-in `JoinImageWithAlpha` (image + alpha:MASK → RGBA), then `SaveImage` titled `Output_Image`.

**Weight:** `birefnet.safetensors` (444 MB, MIT) from `Comfy-Org/BiRefNet`, lands at ComfyUI `models/background_removal/birefnet.safetensors`. New model-type folder → check the models-path type map handles `background_removal`.

## UX (user-confirmed)
- Toolbar button in **Enhance** group (next to Upscale), mode `removeBackground`.
- Click → mounts a **small options panel** with just an **Apply** button (no knobs; room to grow). Not one-click.

## Workflow graph — `comfy_workflows/remove_background.json`
```
LoadImage (title Input_Image) ─┬───────────────→ JoinImageWithAlpha.image
                               └→ RemoveBackground.image
LoadBackgroundRemovalModel ──────→ RemoveBackground.bg_removal_model
RemoveBackground → mask ─────────→ JoinImageWithAlpha.alpha
JoinImageWithAlpha → IMAGE(rgba) → SaveImage (title Output_Image)
```
- Save node = **SaveImage** (PNG, preserves alpha). NOT PreviewImage (kills alpha).
- Sync `last_node_id`/`last_link_id` to true max ([[feedback_comfy_json_sync_id_counters]]).
- Title law: `Input_Image` / `Output_Image` exact ([[feedback_comfy_node_naming_law]]).

## To-dos (verify each)

1. **Workflow JSON** — author `comfy_workflows/remove_background.json` per graph above. Base the `LoadBackgroundRemovalModel` combo value on the on-disk filename `birefnet.safetensors`.
   → verify: load in a running ComfyUI (or `/object_info` has `RemoveBackground`); prompt validates.

2. **Weight dep** — add `birefnet` weight to `js/data/modelConstants/dependencies.js` with `engineAsset: true`, `type` → `background_removal` (or `targetPath: 'ComfyUI/models/background_removal'` if the type→folder map lacks it — CHECK models-path map first), HF source `Comfy-Org/BiRefNet`, sha256, size ~444MB. Compute sha (`/mpic-compute-dep-hashes` or manual).
   → verify: engineAsset pulls it into universal install set; file lands at the folder the loader scans.

3. **Data layer (mirror imageUpscale):**
   - `js/data/modelConstants/universal_workflows.js` — `removeBackground: { workflow: 'remove_background.json' }`.
   - `js/services/commandRegistry.js` — `removeBackground` entry: `universal:true`, `mediaType image`, `requiresImages:1`, `mediaInputs:[{title:'Input_Image', required:true}]`, `promptRequired:false`, labels.
   - `operationRegistry.js` / `operation_registry.json` — register op (versioning) — see .claude/rules/versioning.md.
   → verify: `getUniversalWorkflow('removeBackground')` returns the file; op resolves.

4. **Toolbar** — `js/components/Compounds/MpiHistoryTools/MpiHistoryTools.js`: add IMAGE tool def `{ group:'Enhance', mode:'removeBackground', icon:<pick/add in icons.js>, info:'Remove Background' }`.
   → verify: button renders in Enhance; click emits `activate {mode:'removeBackground'}`.

5. **Options panel** — new Organism `MpiToolOptionsRemoveBg` (minimal: title + Apply button, emits `apply` with `{}`). Register CSS in preloadStyles.js + props in types.js.
   → verify: mounts, Apply fires.

6. **Wire in Block** — `MpiGroupHistoryBlock.js`: add to `TOOL_OPTIONS_REGISTRY` (`removeBackground → MpiToolOptionsRemoveBg`); `_handleApply` → `_runImageTool('removeBackground', {})`.
   → verify: end-to-end — click tool on a history image → Apply → gen runs → transparent PNG saved to Media/ + appended to history.

7. **Alpha render check** — confirm `MpiCanvasViewer` / history thumb renders RGBA transparency (viewer bg not opaque-filling). Fix if it flattens.
   → verify: eyeball transparent output in-app on a checker/known bg.

## Engine-path note
Universal op runs on whichever engine is active (local OR Pod). `birefnet.safetensors` is `engineAsset` → baked/image-resident on Pod, installed with engine locally. Verify on BOTH if time ([[feedback_check_both_engine_paths]]) — at minimum local; native node ships with ComfyUI so it's present on any 0.27.0 engine incl. Pod image.

## Out of scope
- Video bg-removal (frame-by-frame) — not now.
- Portrait-specific model — dropped.
- Choice of matting knobs — none exposed (panel is Apply-only for v1).

---

## Phase 2 — background modes (user request, after v1 shipped + fixed)

**v1 status:** SHIPPED + LIVE-VERIFIED on local engine. Transparent cutout works (chipmunks test, fur edges clean). One bug found + fixed live: `RemoveBackground` mask polarity was inverted (cut the SUBJECT, kept bg) → added core `InvertMask` node (id 6) between RemoveBackground→JoinImageWithAlpha. Re-verified transparent output correct.

**New requirement:** output-background radio in the panel:
- **Transparent** (default) → current RGBA PNG path.
- **Color** → composite subject over a solid color → flat PNG. Uses existing **`MpiColorPicker`** primitive (confirmed present; Resize tool already imports it; emits `change {r,g,b,hex}`, has `el.getHex()`/`getRGB()`).
- Checker is NOT an output — it's the VIEWER backdrop so transparency is visible (separate concern; the dark-silhouette the user saw = viewer painting alpha on dark fill).

**Workflow change (all core nodes, verified present):** keep transparent path; add a color-composite branch gated by `MpiIfElse` (same pattern as image_upscale's `Input_Upscale_Using_Model`):
```
RemoveBackground → mask → InvertMask(6) → alpha
LoadImage(1) → image
  ├─ JoinImageWithAlpha(4)  → RGBA  ─────────────┐  (transparent)
  └─ ImageCompositeMasked over EmptyImage(color) ─┤  (color-fill)
EmptyImage(width,height from image; color=Input_Bg_Color INT)
MpiIfElse(boolean=Input_Bg_Use_Color) → SaveImage(Output_Image)
```
- `EmptyImage.color` = INT 0..16777215 (0xRRGGBB). Injector must convert picker hex → int.
- Injection params: `Input_Bg_Use_Color` (bool), `Input_Bg_Color` (int). Titled Input_* nodes per naming law.
- EmptyImage width/height: derive from input (GetImageSize core node) so color bg matches subject size.

**Panel (`MpiToolOptionsRemoveBg`):** add MpiRadioGroup [Transparent | Color] + conditionally-shown MpiColorPicker (hidden unless Color). Emit `apply { bgMode:'transparent'|'color', color:'#rrggbb' }`. Persist to toolSettings.removeBackground (like upscale persists factor/model).

**_handleApply:** map payload → injectionParams { Input_Bg_Use_Color, Input_Bg_Color:hexToInt(color) }.

**Also noticed (user):** Resize tool has padding but no color picker for the pad fill → same MpiColorPicker should be wired there. SEPARATE follow-up (not this card unless asked).
