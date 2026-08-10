# MPI-508 validation

## 2026-08-09 — conversion landed; the live run found a real bug UPSTREAM of our node

### PASSED

- **Original blocker cleared without action.** The 7 NVIDIA PiD files were committed by
  their owner in `cf22becf` (MPI-507), so `sync-raw-workflows.mjs`'s dirty-generated gate
  no longer fires.
- **Second, undocumented blocker found and cleared.** The engine on `:48188` did not
  register `MpiVideoSamplingPreview` — `engine/.../custom_nodes/ComfyUI-MpiNodes/` is a
  real installed copy at the pinned `43a976f`, not a symlink like the bench's, so it had
  no `preview.py`. Staged the two files into the engine copy (gitignored, exactly the
  bytes the pin will deliver) and restarted via the MPI-484 `.engine-restart-request.json`
  path. Engine pid 31140 -> 18588, `/object_info/MpiVideoSamplingPreview` non-empty.
- **Conversion ran against the ENGINE on :48188**, never the bench:
  `COMFY_URL=http://127.0.0.1:48188 node scripts/sync-raw-workflows.mjs --all`
  (`--all` is required and sanctioned — raw/ is already committed, so the git-driven
  change detection finds nothing; the script's own comment covers this case).
- `generate_h3.py` needed `taeh3.safetensors` added to `SHARED_WEIGHTS` — its
  loader-weights assert is keyed to an allowlist and correctly rejected the new VAELoader.
- **Baked graphs verified, not assumed:**
  - `lora_name` = `minimax-h3\minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy.safetensors`
    on both (323 fl2va / 457 r2va); the deleted larry weight appears nowhere in the tree.
  - turbo `BasicScheduler.steps` = 6, `MpiInt` split = 3, gate `0.75 if a else 0.0` — so
    turbo-off still short-circuits the LoRA load.
  - `MpiStageLatents.is_preview` = false (bench artifact stayed reset).
  - `MpiVideoSamplingPreview` present, `ModelPreviewOverrideKJ` gone, LTX has its
    `taeltx2_3` VAELoader (632) beside the full VAE.
  - 0 dangling links / 0 missing-required / 0 unknown class_type on all four runtime
    graphs, checked against the live `:48188` `/object_info`.
  - `validate-injection-rules.mjs` — all 4 conform.

### FAILED — the live run

One real H3 t2v generation (turbo ON, 2s, isolated app instance on its own port+profile)
died in 0.52s, before sampling, in **`VAELoader`** — not in our node:

```
RuntimeError: Error(s) in loading state_dict for TAEHV:
  size mismatch for encoder.0.weight:  checkpoint [64, 12, 3, 3] vs model [64, 3, 3, 3]
  size mismatch for decoder.22.weight: checkpoint [12, 64, 3, 3] vs model [3, 64, 3, 3]
  size mismatch for decoder.22.bias:   checkpoint [12]           vs model [3]
```

**Root cause (proven, not inferred).** `TAEHV.__init__` builds its edge convs as
`image_channels * patch_size**2`, and sets `patch_size = 2` only for
`latent_channels in [48, 32]`. `taeh3` is **24** channels with a **12**-wide decoder
(3 RGB x 4 temporal frames), so core builds it patch_size 1 / 3-wide and the load
fails. `comfy/sd.py`'s TAEHV dispatch has no branch for a 24-channel, 12-wide decoder.

**Not a version gap.** `comfy/taesd/taehv.py` is byte-identical on engine 0.30.0 and
bench 0.30.2, and the `sd.py` TAEHV lines match too — the bench would fail the same way.
This combination had simply never been executed: the card's original design read taeh3
through KJNodes' own `tiny_vae` loader out of `vae_approx/`, which constructs TAEHV
itself; moving to a plain `VAELoader` is what introduced the failure.
`preview.py`'s docstring premise — "a plain VAELoader on taeh3.safetensors produces
[a TAEHV]" — is false for this weight.

**The corrected build is verified offline** against the real file, in the engine's own
python (`scratchpad/prove_taeh3.py`):

```
core-style build: patch_size=1  decoder_out=3     <- what fails today
fixed build:      patch_size=2  decoder_out=12
missing keys   : []
unexpected keys: []                               <- STRICT match, 128/128 tensors
t_upscale: 4      frames_to_trim: 3               <- matches H3 temporal_downscale_ratio 4
decode(1,24,3,30,54) -> (1, 3, 9, 480, 864)       <- 3*4-3 = 9 frames, 16x spatial
```

So `TAEHV(latent_channels=24)` + `patch_size = 2` + rebuilding the two edge convs to 12
wide is exactly right. It cannot be expressed through core's `VAELoader`, because that
keys patch_size off `latent_channels` alone.

### STILL UNPROVEN

`MpiVideoSamplingPreview` has still never executed — the run died upstream of it. Its
own likeliest bug (the `_temporal_ratio` frame cursor) reads correct by inspection:
`MiniMaxH3Video.temporal_downscale_ratio = 4` and `MiniMaxH3AV` inherits it.

### RESOLVED — both bugs fixed, previews proven live

**Fix 1 — `MpiTinyVaeLoader` (new node, `preview.py`).** Core cannot load `taeh3`; the fix
belongs in a loader, not the previewer, because the crash is one node upstream. It rebuilds
the two edge convs at patch_size 2 and delegates anything core already handles (verified:
`taeltx2_3` still goes down `VAELoader`'s own path, and core's `TAEHV` class is restored
after each load — no leak). Graph change was a pure class swap: both nodes take zero
inputs, one `vae_name` widget, one `VAE` output, so every link index stayed valid. 4 lines
per raw template, verified byte-exact JSON round-trip so nothing else moved.

**Fix 2 — the previewer never ran, and that was a SECOND, unrelated bug.** With the loader
fixed the generation completed, but previews were still core's blobs. Instrumenting the
engine's copy showed the wrapper entered and `push` fired every step, then bailed on
`x0.ndim == 3`:

```
[PROBE] wrapper entered latent_shapes=[[1,24,17,40,40], [1,32,2,93]] li_nested=False
                        li_shape=(1,1,658752) model=MiniMaxH3
[PROBE] push type=Tensor ndim=3 shape=(1, 1, 658752) nested=False     x6
```

A multi-part latent reaches the sampler as one FLAT pack; core restores the nested view in
a callback wrapper built *before* `outer_sample`, so our OUTER_SAMPLE callback sits INSIDE
that unpacker and sees the pack, while core's previewer (further out) sees the nested view.
24*17*40*40 + 32*2*93 = 658752 exactly. Fixed by unpacking ourselves with
`comfy.utils.unpack_latents(x0, self.latent_shapes)[0]` — `latent_shapes` was already being
handed to the wrapper and ignored. Documented in `docs/preview-bus.md`.

**Live proof (app, isolated instance, turbo ON, local engine):**

| | before fix 2 | after |
|---|---|---|
| `preview:frame` events | 6 (= 1/step, core's latent2rgb alone) | **264, then 396** |
| frame content | uniform 512x512 blobs | real decoded frames |

Two captured frames were inspected as images: frame 20 is unresolved noise, frame 150 shows
sky, horizon and road in sunset colours — real taeh3 output progressing with sampling, not
latent2rgb. `Prompt executed in 62-87 seconds`, zero `preview disabled after` lines across
every run. The 86.74s turbo run also corroborates the handoff's 87.77s lightx2v figure.

**The lesson worth keeping:** core's fallback previewer emits on the SAME channel, so
"previews appear" never proved this node ran. Frame COUNT was the discriminator — 6 on a
6-step sampler is core alone; this node bursts a whole clip per callback.

All temporary probes were engine-copy only (`engine/` is gitignored) and are removed —
`cmp` confirms the engine copy now equals the repo file.

### Also fixed (discovered in scope)

- `PromptBoxControls.js` — the turbo button's **user-visible** tooltip said "8 steps
  instead of 20" (now 6); its docstring quoted the superseded larry 204s->96s / strength 1.0
  figures (now 0.75, 6 steps, ~88s).
- `docs/releases/UNRELEASED.md` — the turbo entry said eight steps and a 591MB file
  (now six / 1.82GB). Its "3m40s -> 2m51s" five-second-clip claim was the larry LoRA's and
  is REMOVED rather than left to ship wrong; a `TODO(MPI-508)` marks the re-measure. That
  number was not invented here.
- `generate_h3.py` — `taeh3.safetensors` added to `SHARED_WEIGHTS`; its loader-weights
  assert had correctly rejected the new node.

### OPEN BUG — previews are GREEN start to finish (found after the above)

Fabio, on the bench, ran the same `taeh3` weight through **KJNodes' previewer** and ours
side by side. KJ's was low-res but **normal colour from step 1**. Ours is green from the
first frame to the last. So this is NOT early-step noise — the earlier "it resolves as
sampling proceeds" reading is dead, and my frame-150 capture was over-read.

**What has been RULED OUT (each checked against KJNodes' working implementation):**

- *Construction.* `nodes/tiny_vae.py:104-111` derives `patch_size` from
  `(decoder.22.bias / 3) ** 0.5` and rebuilds the same two edge convs — identical to
  `MpiTinyVaeLoader`. Not the difference.
- *Output range.* Their TAEHV path (`preview_override_node.py:329`) is
  `rgb.clamp(0, 1).mul(255)` — identical to ours. The `add_(1.0).mul_(127.5)` at line 105
  is their **latent2rgb** path, not TAEHV; do not "fix" ours to match it.
- *Latent scaling.* `MiniMaxH3Video.scale_factor = 1.0` with no shift, so `process_in` /
  `process_out` are identity anyway and the loader's override is a no-op.

**LEADING CAUSE — decoding an arbitrary mid-clip window with cold MemBlock state.**
`tiny_vae.py:161-163` says it outright:

```python
# MemBlock state chains forward, so frames can't be sampled across the clip without
# decoding everything before them — take a prefix to keep the per-step cost bounded
out = self._decode(latent[:1, :, :n])[0].movedim(0, -1)
```

KJ always decodes a **prefix from frame 0**. `_TinyVaePreviewer.push` decodes
`x0[self.cursor:self.cursor + earned]` — an arbitrary window, cold state every call. That
is invalid per the reference implementation and fits "wrong from the very first frame".

**Second, separate defect on the same path:** H3 does not decode uniformly. KJ carries a
dedicated `_decode_h3_full` because **H3's VAE codes 17 pixel frames per 5 latent tokens**
— it trims each chunk's prefix rather than once globally, then drops the encoder's 3-token
tail pad. Our plain `model.decode()` trims once globally, so even a correct prefix decode
would come out with the wrong frames.

**Next action:** rework `_TinyVaePreviewer` to decode a prefix from frame 0 (or the whole
clip through H3's chunking, mirroring `_decode_h3_full`) and select display frames from the
result, instead of decoding a moving window. Read `tiny_vae.py` `decode_video` /
`_decode_h3_full` first — it is a working reference for this exact weight.

### Not done — needs the user

`ComfyUi-MpiNodes` is committed locally but **not pushed**, so `dev_configs/node_lock.json`
still pins `43a976f` and has NOT been re-pinned. Pinning to an unpushed SHA would break
every other machine and CI, and push is a user-authorized op.
