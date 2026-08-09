# MPI-508 checklist

## A. LoRA swap (H3) — DONE except the graph conversion

- [x] Upload `minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy.safetensors` to R2 —
      verified 200 / 1,956,171,984 bytes exact
- [x] Delete `minimax_h3_turbo_v4_step600_ema_pruned_comfyui.safetensors` from R2 —
      safe: entered the tree today in `0b15f342`, `git tag --contains` empty
- [x] `loraDeps.js` — swapped to the lightx2v weight, with the "lower step count is not
      a speed-up" finding and the `baked_scale 0.125` non-comparability recorded
- [x] `models.js` — the two H3 dep-list comments updated (591MB → 1.82GB, fl2v naming)
- [x] Reset fl2va node 320 `MpiStageLatents.is_preview` to `false` (bench artifact)
- [x] `docs/models/h3/turbo.md` — leads with the swap; old measurements marked as larry's
- [ ] Graph conversion (shared with section C — one pass for both halves)

## B. Preview weights — DONE

- [x] `taeh3.safetensors` (madebyollin) on R2 at `vae/` — 200 / 22,709,752
- [x] `taeltx2_3.safetensors` on R2 at `vae/` — 200 / 23,531,296
- [x] Dep entries `taeh3-decoder` + `ltx23-preview-taehv`, both in `vae/`, neither an
      `engineAsset` — they are model-owned and node-read, unlike the `vae_approx` three
- [x] Attached: taeh3 → both H3 DiTs; taeltx2_3 → both LTX tiers (verified by importing
      the real registry, not by reading the diff)
- [x] `docs/preview-bus.md` — new § "The second kind of decoder", table rows for H3 + LTX
- [x] `tests/remote-engine-assets.test.cjs` — guards the not-an-engineAsset and
      `vae/`-folder invariants for both. Green.
- [x] `node scripts/check-dep-urls.mjs` → All 224 URLs reachable

## C. The H3 previewer node (MpiNodes) — replaces the KJ node in our graphs

- [x] `preview.py` — `MpiVideoSamplingPreview`: OUTER_SAMPLE wrapper, TAEHV decode,
      real-time frame cursor, `VHS_latentpreview` + binary `PREVIEW_IMAGE` frames
- [x] Registered in `__init__.py`, README "Sampling" section, changelog entry
- [x] Both files parse
- [ ] **Bench restart** → `/object_info/MpiVideoSamplingPreview` non-empty
- [ ] Live H3 run on the bench: frames appear, playback at clip speed, no OOM, and a
      forced decode failure does not kill the generation
- [ ] Commit + push `ComfyUi-MpiNodes`
- [ ] Pin the new commit in `dev_configs/node_lock.json`
- [ ] Fabio: swap `ModelPreviewOverrideKJ` → `MpiVideoSamplingPreview` + a `VAELoader` on
      `taeh3.safetensors` in BOTH H3 graphs, then export raw

## D. Conversion + verify

- [ ] `sync-raw-workflows` **against `:48188`**, never the bench on `:8188`
- [ ] Diff the converted API graphs before installing: 0 missing-required, 0 dangling
- [ ] A real generation on fl2va / r2va / LTX with previews visible **in the app**
- [ ] Turbo OFF still short-circuits the LoRA load (the both-zero gate)

## Dropped from the original plan

- ~~`comfyController.js` listener for `kj_preview_override`~~ — not needed. The animated
  preview system already exists app-side (clip mode + binary frames); the node emits on
  that channel, so there is no app change at all. This is why option A (still previews +
  a listener) was skipped: both halves of it would have been deleted by this node.
