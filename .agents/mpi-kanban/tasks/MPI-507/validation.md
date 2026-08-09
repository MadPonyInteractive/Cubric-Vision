# MPI-507 validation

## Workflow-generation half — PASS (2026-08-09)

Card stays in `doing`: this validates the generator only. The app-side half
(plugins, dropdown entries, ModelDef removal) is still blocked on §3c.

### What ran

```
COMFY_URL=http://127.0.0.1:48188 node scripts/workflow-to-api.mjs \
    comfy_workflows/raw/nvidia_pid_template.json          # 26 LiteGraph -> 25 API nodes
cd comfy_workflows/scripts/workflow_generation && python generate_pid.py
```

Converted against the **engine on :48188**, not the :8188 bench — the bench runs
ahead and has silently shifted a widget before.

### Results

`generate_pid.py` emitted four files from the one template:

```
[OK] nvidia_pid_flux.json  (flux,      pid_flux1_...,     ae.safetensors)
[OK] nvidia_pid_sd3.json   (sd3,       pid_sd3_...,       sd3_vae.safetensors)
[OK] nvidia_pid_qwen.json  (qwenimage, pid_qwenimage_..., qwen_image_vae.safetensors)
[OK] nvidia_pid_sdxl.json  (sdxl,      pid_sdxl_...,      sdxl_vae.safetensors)
```

**Per-file bake check** — all four PASS: each carries its own `unet_name`,
`vae_name` and `latent_format`, and in every file the shared `pixel_space`
`VAELoader` is **untouched**. That last assertion is the one that matters: two
untitled `VAELoader`s in the template would have made the title lookup a coin
flip, which is why the architecture VAE was retitled `PiD_VAE` before export.

**Structural diff** — each of sd3/qwen/sdxl against flux differs in **exactly**
`1595.latent_format`, `1597.vae_name`, `1598.unet_name` and nothing else. Same
node-id set, same classes, same every other widget. So the generator changes what
it is supposed to change and only that.

**Injection-rules gate** — the same check `sync-raw-workflows.mjs` runs at step 4:

```
COMFY_URL=http://127.0.0.1:48188 node scripts/validate-injection-rules.mjs \
    comfy_workflows/nvidia_pid_{flux,sd3,qwen,sdxl}.json
-> All 4 file(s) conform to the injection rules.   (rc=0)
```

**Registry routing** — `registry.handler_for('nvidia_pid_template.json')` returns
`'pid'`; `handler_for('nvidia_pid.json')` returns `None`, so the old four-branch
raw source is not accidentally picked up by the new handler.

### Deliberately not done

- **No prune pass.** All 25 API nodes are upstream of `Output_Image` (verified by
  reachability walk), unlike the Boogu/Qwen benches. Nothing to drop, so no
  `_prune_to_capture` was written.
- **Old files left in place.** `comfy_workflows/nvidia_pid.json` and
  `comfy_workflows/raw/nvidia_pid.json` still exist and are still what
  `models.js` resolves (`workflows: { pid: 'nvidia_pid.json' }`). They must stay
  until the app side switches to the four files — deleting them now breaks the
  shipped PiD model.
- **Generated files left uncommitted**, per the house flow: raw sources commit on
  sync, generated API + runtime land staged and commit once at `/mpi-end`.

### Not yet validated

Nothing has **executed** these four graphs. The bake is proven correct and the
graphs pass validation, but no generation has been run against any of them. That
is a smoke-run concern for when the app side lands.
