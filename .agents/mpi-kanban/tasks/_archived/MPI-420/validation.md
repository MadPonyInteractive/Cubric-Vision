# MPI-420 Validation — TAESD preview decoders

Built under **MPI-450 Gate A**. User's call on the fork: **ship the decoders**.

> ## ⚠️ Correction, same session — read this before the rest
>
> The first cut of this card shipped **four** decoders and a table saying *"Krea 2,
> Chroma → `Flux` → `taef1_decoder`"*. **Both were wrong**, and the user caught it from
> memory of a prior finding.
>
> 1. **Krea 2 is not Flux-latent.** `comfy/supported_models.py`:
>    `class Krea2 … latent_format = latent_formats.Wan21`. So do both Qwen models. Their
>    decoder is `lighttaew2_1`, and `taef1` was never theirs. Read the latent format out
>    of `supported_models.py`, never off a model's transformer lineage.
> 2. **`lighttaew2_2` was reverted before release.**
>    [`models/krea2/preview-taesd.md`](../../../../docs/models/krea2/preview-taesd.md)
>    already recorded a deliberate decision not to install these: ComfyUI issue
>    **#13366** makes the previewer corrupt the **real generation latent** mid-sampling
>    on the `Wan21`/`Wan22`/Qwen family. Re-checked upstream 2026-08-05 with `gh api` —
>    issue **open**, fix PR **#13383 unmerged**, both untouched since April.
>
> The already-downloaded copy was **deleted from the user's models root**: the file on
> disk is what arms the bug, not the dep entry. Ships now: `taesdxl`, `taef1`, `taef2`.
>
> A local probe *did* show no in-place mutation of `x0` on 0.29.2 for all three paths
> (`scratchpad/probe_13366.py`) — evidence, not proof. It only rules out the most direct
> mechanism, on a random CPU tensor; it cannot rule out the model-management
> interference that a mid-sampling VAE load can cause. An open upstream corruption bug
> against the exact file is not something to ship a release on.

## The card's premise was wrong — correct it before reading further

The card said: *"CONSEQUENCE: no live preview image while sampling; the user watches a
progress bar with no picture."* That is not what happens. `latent_preview.py`
`get_previewer` ends with:

```python
if previewer is None:
    if latent_format.latent_rgb_factors is not None:
        previewer = Latent2RGBPreviewer(...)
```

Verified in the **shipped** engine (`engine/ComfyUI_windows_portable/ComfyUI`,
ComfyUI 0.29.2), not just on the bench. A missing decoder is a **silent downgrade** to
the blocky colour-blob previewer, never an absence. The user's own words on seeing this
card: *"all latents look like shit right now"* — which is the blob, exactly.

That correction matters because it changes the scope: the defect is not "we install
nothing", it is **which** decoders are missing, and where.

## What was actually missing

`vae_approx/` ships **inside the Windows ComfyUI portable archive** — so this dev box
already had `taesd`, `taesdxl`, `taesd3` and `taef1`, which is why nobody noticed. Two
real gaps:

1. **macOS and Linux get nothing.** Those platforms provision through
   `_provisionUvEngine`, which git-clones ComfyUI, and a clone carries no `vae_approx/`.
   Every preview on those platforms was latent2rgb. This is the macOS 1.3.0 evidence the
   card was opened from (`tasks/MPI-370/validation.md`).
2. **The bundle predates FLUX.2 and Wan 2.2.** `Flux2` names `taef2_decoder` and `Wan22`
   names `lighttaew2_2`; neither is in the archive or the Pod image, so **Klein and Wan
   previews were blobs on every platform, Windows included.**

Full class → decoder map, read out of the shipped engine rather than assumed:

| Model | latent format | decoder | was present? |
|---|---|---|---|
| SDXL family (5 models) | `SDXL` | `taesdxl_decoder` | Windows only |
| Krea 2, Chroma (both) | `Flux` | `taef1_decoder` | Windows only |
| FLUX.2 Klein | `Flux2` | `taef2_decoder` | **nowhere** |
| Wan 2.2 | `Wan22` | `lighttaew2_2` | **nowhere** |
| Qwen Image / Image Edit, LTX | — | none in 0.29.2 | n/a — latent2rgb is their ceiling |

SD1.5 and SD3 decoders are deliberately **not** shipped: we have no model on either.

## What shipped

Four `engineAsset` deps in `js/data/modelConstants/assetDeps.js`, all under
`vae_approx/`. Uploaded to R2 and **HEAD-verified live** (200 + exact Content-Length):

| Dep | Bytes | sha256 | Flags |
|---|---|---|---|
| `taesdxl-decoder` | 2,450,590 | `ae5256b0…60202a5` | `bakedOnPod`, `noMirror` |
| `taef1-decoder` | 2,464,414 | `bb41500b…02a1d4` | `bakedOnPod`, `noMirror` |
| `taef2-decoder` | 5,360,500 | `1280d561…603d6` | `noMirror` |
| `lighttaew2-2` | 45,684,280 | `10124099…0ba16a` | real upstream `mirrorUrl` |

- `taesdxl` / `taef1` bytes are the **exact copies the Pod image already bakes** — their
  sha256s match `mpi-ci/cubric-vision-pod/Dockerfile` line for line, so `bakedOnPod` is
  truthful and remote skips them.
- `noMirror` on three of them: the upstream madebyollin repos ship a single
  diffusers-format file, not this split decoder, so the generic prefix rewrite would only
  ever 404 — the same failure MPI-433 patched.
- `lighttaew2_2` is byte-identical upstream (`lightx2v/Autoencoders`), so it keeps a real
  second route.
- No `yamlHelper` edit was needed: the `vae_approx` folder key **derives** from the first
  segment of `filename`. Confirmed by generating the yaml.

### `taef2_decoder.safetensors` is derived — the recipe, so it can be redone

`madebyollin/taef2` ships ONE combined file (`taef2.safetensors`, sha
`701d31c0…df557a`, downloaded and hash-checked against HF's `lfs.oid`). ComfyUI's
`TAESD.__init__` calls `load_state_dict` **strictly** on the decoder half alone, so the
combined file cannot be renamed into place. Converted with madebyollin's own index shift
(`decoder.layers.N.suffix` → `(N+1).suffix`, because ComfyUI's `Decoder` is an
`nn.Sequential` whose element 0 is a Clamp), script kept at
`scratchpad/make_taef2_decoder.py`.

**Proved, not assumed** — run under the engine's own python (torch 2.13.0+cu130):

```
source tensors: 158
decoder tensors: 79
strict load into TAESD(latent_channels=128): OK
decode() output shape: (1, 3, 128, 128)      # 8x8 latent -> 128px, the 16x FLUX.2 ratio
```

`lighttaew2_2` takes ComfyUI's `VIDEO_TAES` branch, which loads the file as a whole
`comfy.sd.VAE` rather than a bare decoder state dict — also loaded successfully under the
engine python (128 tensors), which is why it is 45MB and carries no `_decoder` suffix.

## Evidence

- `tests/remote-engine-assets.test.cjs` — new block 7: taef2 + lighttaew2_2 must be in the
  volume-install set, taesdxl + taef1 must report image-resident, and all four must be
  engineAssets under `vae_approx/` with a 64-char sha256. Its existing block 6 already
  cross-checks every flag against the real Pod Dockerfile, and passes.
- `tests/extra-model-folders.test.cjs` — new test: every derived dep folder type reaches
  the yaml, `vae_approx` named explicitly. The derivation is magic a refactor breaks
  quietly, and the failure mode is silent worse previews.
- **Both bite** (negative control, 2026-08-05): rewriting the four `filename`s from
  `vae_approx/` to `vae/` fails both — *"taesdxl-decoder must live under vae_approx/"* and
  the yaml test. 3 pass / 2 fail; restored → 5 pass.
- Full suite after the change: **441 passed, 0 failed**.

## Open — needs a real generation

- [ ] Generate on **FLUX.2 Klein** and watch the live preview: it should now resemble the
      final image rather than a colour blob.
- [ ] Same on **Wan 2.2** (video), where the blob was worst.
- [ ] macOS or Linux: any model — previews there were latent2rgb across the board. Folds
      into MPI-450 Gate B (the MPI-249 Linux leg).

## Out of scope, still open

The merged **MPI-294** strand (taehv / `taeltx_2` for LTX) does not apply: LTX names no
decoder in ComfyUI 0.29.2, so it needs an engine bump first. That belongs with MPI-449's
engine-bump decision, not here.
