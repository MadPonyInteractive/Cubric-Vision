# MPI-650 validation

## What changed

One line, `js/data/modelConstants/nodesDeps.js:112`:

```diff
     'ComfyUI-Frame-Interpolation': {
         id: 'ComfyUI-Frame-Interpolation',
-        name: 'ComfyUI Impact Subpack',
+        name: 'ComfyUI Frame Interpolation',
```

`git diff --stat` = `1 file changed, 1 insertion(+), 1 deletion(-)`. Nothing else touched.

The clone source is the `ComfyUI-Impact-Subpack` entry twenty lines **below** (line 132), not
the one above it — that entry is `ComfyUI-UltimateSDUpscale` and is correct. Line 132 is the
legitimate holder of the name and was left alone; both were read back after the edit.

## The sweep — all 17 entries, checked mechanically

Eyeballing a list this long is how the slip got in, so the check was programmatic: parse every
`id`/`name`/`type`/`filename` quad out of the file, normalise each to lowercase alphanumerics,
and require `name` to be a prefix of `id` or `filename` (or vice versa — real names carry
trailing parentheticals such as `(preprocessors)`).

17 entries parsed, which matches the 17 `id:` lines in the file, so nothing was skipped by the
regex. **0 mismatches.**

| id | name |
|---|---|
| ComfyUI-LTXVideo | ComfyUI-LTXVideo |
| ComfyUI-MpiNodes | ComfyUI-MpiNodes |
| ComfyUI-PainterI2Vadvanced | ComfyUI-PainterI2Vadvanced |
| ComfyUI-VideoHelperSuite | ComfyUI-VideoHelperSuite |
| ComfyUI-Impact-Pack | ComfyUI Impact Pack |
| comfyui-kjnodes | ComfyUI KJNodes |
| ComfyUI-UltimateSDUpscale | ComfyUI Ultimate SD Upscale |
| ComfyUI-Frame-Interpolation | ComfyUI Frame Interpolation *(fixed)* |
| ComfyUI-Impact-Subpack | ComfyUI Impact Subpack |
| RES4LYF | RES4LYF |
| ComfyUI-Krea2-ControlNet | ComfyUI Krea2 ControlNet |
| comfyui-krea2edit | ComfyUI Krea2 Edit |
| comfyui-inpaint-cropandstitch | ComfyUI Inpaint Crop and Stitch |
| LanPaint | LanPaint |
| comfyui_controlnet_aux | ComfyUI ControlNet Aux (preprocessors) |
| ComfyUI_Fill-ChatterBox | ComfyUI Fill-ChatterBox (TTS + voice conversion) |
| ComfyUI-MelodramaBox | ComfyUI MelodramaBox (DramaBox TTS) |

The check has teeth: run against the pre-fix file it flags line 112
(`comfyuiimpactsubpack` is not a prefix of `comfyuiframeinterpolation`). A check that cannot
fail proves nothing, so that was confirmed before trusting the 0.

Scope note: the sibling dep files (`assetDeps.js`, `modelDeps.js`, `loraDeps.js`) were looked
at and are **out of scope** — their `name` values are free-text weight descriptions
(`LTX-2.3 Audio VAE (bf16)`, `Gemma-3-12B 4-bit — tokenizer.json`) with no `id`/`filename`
relationship to check against, so the same mechanical test does not apply there.

## No other consumer of the wrong string

`grep -rn "Impact Subpack" js/ tests/ routes/ docs/ scripts/ comfy_workflows/ dev_configs/`
returns exactly one line — `nodesDeps.js:132`, the legitimate entry. No test asserted the wrong
label and no doc repeated it, so the fix has no second half.

## Gates

- `npm test` — **773/773 pass, 0 fail**, duration 19.4s. Same 773 MPI-649 recorded hours
  earlier, so the count did not drift.
- `npm run release:check` — **exits 1, and the red is not this card's.** Both failure lines name
  the engine pin only:

  > Engine pin moved 0.31.0 -> 0.34.0 since v1.4.2. smoke-evidence.json was produced against
  > ComfyUI 0.31.0 … smoke-evidence.json is STALE

  That is MPI-649's committed bump (`14c1a04f`) waiting on the smoke matrix, which was
  deliberately deferred to MPI-595 because it rents a RunPod GPU. MPI-649's own
  `validation.md:161` records this as the expected resting state: *"`npm run release:check`
  already refuses, by name, which is the correct resting state"*. This card changes no engine
  pin and no smoke evidence, so it cannot move that gate; it will go green when MPI-595 runs
  the matrix.
- `validate_board.py .` — exit 0, run from the repo root (not the kanban dir, which false-passes).

## Not verified

The rendered label was not eyeballed in a running app — `name` is plain data read by the Model
Library and install-progress lists, the diff is a string literal, and no code branches on its
value. Standing the app up for a one-word label was not judged worth it.
