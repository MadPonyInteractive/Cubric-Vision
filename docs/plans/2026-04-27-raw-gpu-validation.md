# Plan: Raw GPU Pipeline — Per-Control Validation

**Created:** 2026-04-27  
**Goal:** Validate each raw adjustment control produces correct visual output. Cooperative loop: user tests in Electron → reports result → agent tunes shader → repeat until pass.

**How this works:**
- Each to-do = one control to validate
- User opens raw tool, tests the control as described, reports what they see
- If wrong: agent reads the shader, fixes it, user retests
- Mark `[x]` only when output matches expected

**Test image:** any image in test 2 project (one image is large in dimensions and the other in file size) User will use both to test GPU usage.

---

## To-Dos

- [ ] **Exposure** — Set to +300. Expected: image very bright, highlights blown. Set to -300. Expected: image very dark, near black. Direction must match (positive = brighter).

- [ ] **Shadows** — Set to +100. Expected: dark areas lift toward grey, bright areas unchanged. Set to -100. Expected: dark areas push deeper black. Highlights must NOT be affected.

- [ ] **Point Curve** — Drag control point upward. Expected: midtones brighten. Drag downward. Expected: midtones darken. Endpoints (black point bottom-left, white point top-right) must show as hollow circles. Histogram must be visible behind curve.

- [ ] **White Balance — Auto** — Click Auto. Expected: image shifts toward neutral (grey-world correction). Image must stay same size regardless of zoom level. Click "As shot" after. Expected: reverts to original colors.

- [ ] **Saturation** — Set to +100. Expected: colors heavily oversaturated. Set to -100. Expected: near greyscale. No hue shift allowed.

- [ ] **Dehaze** — Set to +50. Expected: contrast increases, colors pop (haze removed effect). Set to -50. Expected: image goes hazy/milky. Effect may be subtle on non-hazy images — look for contrast change.

- [ ] **Sharpening** — Set to 100. Zoom canvas to 100%. Expected: edges visibly crisper. Haloing around edges acceptable at max. No softening.

- [ ] **Noise Reduction** — Set to 100. Expected: image smoothed, slight blur visible in uniform regions. No sharpening. Effect subtle on clean AI images — check sky/skin areas.

- [ ] **Grain** — Set to 100. Expected: visible film grain texture across image. Grain must be visible, not just a color tint.

- [ ] **Calibration: Hue R** — Set to +90. Expected: red/skin-tone areas shift hue noticeably. Non-red areas unchanged.

- [ ] **Calibration: Hue G** — Set to +90. Expected: green areas shift hue. Non-green areas unchanged.

- [ ] **Calibration: Hue B** — Set to +90. Expected: blue areas shift hue. Non-blue areas unchanged.

- [ ] **Calibration: Sat R** — Set to +100. Expected: reds become more vivid. Other colors unchanged.

- [ ] **Calibration: Sat G** — Set to +100. Expected: greens become more vivid. Other colors unchanged.

- [ ] **Calibration: Sat Y** — Set to +100. Expected: yellows become more vivid. Other colors unchanged.

- [ ] **Apply (bake)** — Set exposure +100, click Apply. Expected: new history entry created, no console errors, GPU idle after. Click new entry — image must show the exposure adjustment visibly.

---

## Regression (run after any shader fix)

- [ ] Switch from raw tool to another tool → canvas reverts to original image, no GPU activity
- [ ] Auto WB at 200% zoom → image not smaller or cropped vs 100% zoom result
