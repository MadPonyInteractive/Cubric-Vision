# MPI-575 Checklist

Root cause (settled from source 2026-08-29, no GPU run needed — see `plan.md`):
KJNodes' `LTX2SamplingPreviewOverride` announces `VHS_latentpreview.length` in
LATENT frames while streaming TAEHV-decoded PIXEL frames — 8x more. The app's
ring is sized by the announced length, so it holds only the tail of each burst.

- [x] `ComfyUi-MpiNodes/preview.py` — teach `MpiVideoSamplingPreview` the
      keyframe trim (LTX i2v appends `LTXVAddGuide` latents; H3 never had any)
- [x] Commit + push MpiNodes (`5e07043`, carries MPI-623's MpiBrushTrain too),
      bump the pin in `dev_configs/node_lock.json`
- [x] Swap the preview node in the RAW LiteGraph authoring files —
      `raw/flow_ltx_foley.json`, `raw/flow_ltx_extend.json`,
      `raw/ltx_i2v_t2v_template.json`. Editing only the API JSON would have been
      undone by the next `sync-raw-workflows.mjs`.
- [x] Same swap in the generated files so the tree is consistent before the
      re-export: the four API graphs + `scripts/workflow_generation/
      ltx_i2v_t2v_template.json`
- [x] Drop the now-dead `latent_upscale_model` wire (KJ nulls it whenever the
      VAE is a TAEHV, so it never did anything here). The loader went with it in
      foley/extend where nothing else read it, plus the reroute that fed it in
      i2v; the i2v loader stays — `LTXVLatentUpsampler` still uses it.
- [x] Docs that named the old node: `docs/preview-decoders.md` (the decoder
      table + the arithmetic), `docs/models/ltx/workflow-authoring.md`,
      `docs/builder/05-author-and-test.md`, and the dep comments in
      `assetDeps.js` / `models.js`
- [ ] Fabio opens each graph in ComfyUI and re-exports it, so the checked-in
      JSON stays readable and in sync
- [ ] Verify on one real LTX run: preview loops the whole clip instead of
      flashing frame 0 then the tail. **Needs an engine restart first** — the
      installed `ComfyUI-MpiNodes` is the old pin, and Python does not reload a
      module in a running ComfyUI.
