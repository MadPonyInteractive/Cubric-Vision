# MPI-507 checklist

## Workflow generation — DONE (evidence in validation.md)

- [x] Single-branch template exported to `comfy_workflows/raw/nvidia_pid_template.json`
      (26 LiteGraph nodes; the four-branch graph and its `Input_Type` switch are gone)
- [x] Architecture VAE titled `PiD_VAE` so the generator cannot grab the shared
      `pixel_space` loader — two untitled `VAELoader`s made the title lookup a coin flip
- [x] `generate_pid.py` bakes `unet_name`, `vae_name`, `latent_format` from one template
- [x] `("nvidia_pid_", "pid")` rule added to `registry.py`
- [x] Four runtime files generated: flux / sd3 / qwen / sdxl
- [x] Verified: per-file bake correct, `pixel_space` untouched in all four
- [x] Verified: sd3/qwen/sdxl differ from flux in exactly three widget values
- [x] Verified: `validate-injection-rules.mjs` passes all four (rc=0, engine :48188)
- [x] Committed — `cf22becf`

## Blocked on a decision (brief.md §3c)

- [ ] **Decide: hide the `nvidia-pid` ModelDef, or teach Flows about plugins?**
      `flowsRegistry.js:107` has `flowSdxl4k` declaring
      `requiredModels: ['sdxl-nsfw','nvidia-pid']` specifically to exercise the
      multi-model install path. Everything below waits on this.

## App side — not started

- [ ] Four `PLUGINS` entries (flux / sd3 / qwen / sdxl), each declaring its
      workflow file and `imageUpscale` scope only (PiD is image-only, §0)
- [ ] Dep wiring: reuse the existing `pid-*` / `vae-*` / `pid-gemma` entries.
      **Never delete them** — the orphan sweep reads `DEPS`
- [ ] Conditional tool controls: text input + denoise when a PiD entry is selected
      (MPI-506 §4a.1b — a declared control list, not an `if (isPid)` branch)
- [ ] Factor radio relabels to 1K/2K/3K/4K for generative upscalers
- [ ] Retire `comfy_workflows/nvidia_pid.json` + `raw/nvidia_pid.json` once
      `models.js` no longer resolves them
- [ ] Sweep `dev_configs/smoke-evidence.json` (names `nvidia-pid` twice, gates
      `npm run release:check`)
- [ ] Smoke: nothing has EXECUTED the four generated graphs yet
