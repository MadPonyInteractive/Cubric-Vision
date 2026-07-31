# MPI-419 Validation

## Upstream research — every claim re-verified against the source, not the changelog

Done 2026-07-31 ~09:50Z. Clock checked against GitHub's `Date:` header first (1s drift,
no VPN skew), so the timestamps here are real.

- **v0.29.2 exists**, published 2026-07-31T06:56:45Z, core commit
  `322122449c9d2ba8b8df1bb517364527dd0615f1`. All four Windows portable assets are on
  the release (`_nvidia.7z` 2.10 GB, `_nvidia_cu126.7z`, `_amd.7z`, `_intel.7z`).
  0.29.2 over 0.29.0 is frontend fixes + partner nodes only.
- **The LTX break and its fix, both confirmed at the source.**
  `interleaved_freqs_cis` is defined in core v0.28.0 (2 occurrences) and **gone in
  v0.29.2** (0 occurrences) — removed by ComfyUI PR #15056. Lightricks shipped the
  adaptation as **PR #532** "Support ComfyUI core rope change" (+20/-3, merged
  2026-07-27), which wraps the import in a `try/except`: new core uses
  `freqs_cis_matrix`, legacy core keeps the old path. **It is backwards compatible**,
  so the bumped node runs against 0.28 *and* 0.29 — which is why the Pod can stay on
  0.28.0 for now without breaking. Tip commit `3b9c5cde4700917074823d45e25401d81049f8fc`.
- **`comfy install --version` confirmed from comfy-cli source**, not just its help
  output (`comfy_cli/cmdline.py` install + `command/install.py`):
  - the flag's default is **`nightly` = latest commit on master** — that IS the defect;
  - `validate_version` accepts `0.29.2` (strips a `v`, semver-parses), then
    `checkout_stable_comfyui` re-adds `v` and checks out the tag;
  - the checkout runs **whenever version != nightly, independently of `--restore`**,
    and `git_checkout_tag` fetches tags when the tag is absent locally. So a retry
    onto an existing workspace lands on the pin too.
- **Windows archive URL needs no edit.** `routes/platformEngine.js:20` builds
  `COMFY_BASE` from `COMFY_VERSION`, so bumping `system_dependencies.json` moves the
  download to the v0.29.2 assets automatically. (The handoff's "FIX 7" was a no-op.)
- **Frontend pins: the changelog was wrong, the tag is right.** The 0.29.0 notes say
  frontend 1.47.10 / templates 0.11.19; `requirements.txt` at the **v0.29.2 tag** reads
  **1.47.11 / 0.11.20**. Used the tag. Full requirements delta 0.28.0 -> 0.29.2 is only
  four lines: those two, `comfyui-embedded-docs` 0.5.8 -> 0.5.9, and
  **`comfy-kitchen` 0.2.20 -> 0.2.22** (the package the new rope helpers live in).
  No torch change.

## Node sweep — 13 of 14 need no bump

Checked every pinned node's distance from its upstream tip and why:

| Node | Behind tip by | 0.29 action |
|---|---|---|
| ComfyUI-LTXVideo | 4 | **BUMPED** `4f45fd6c` -> `3b9c5cde` (PR #532) |
| ComfyUI-MpiNodes | 0 | at tip |
| ComfyUI-PainterI2Vadvanced | 0 | at tip |
| ComfyUI-Impact-Pack | 0 | at tip |
| ComfyUI-Frame-Interpolation | 0 | at tip |
| ComfyUI-Impact-Subpack | 0 | at tip |
| ComfyUI-Krea2-ControlNet | 0 | at tip |
| comfyui_controlnet_aux | 0 | at tip |
| comfyui-inpaint-cropandstitch | 0 | at tip |
| ComfyUI-VideoHelperSuite | 1 | no 0.29 adaptation upstream |
| ComfyUI-UltimateSDUpscale | 1 | no 0.29 adaptation upstream |
| comfyui-kjnodes | 23 | no 0.29 adaptation upstream |
| RES4LYF | 18 | no 0.29 adaptation upstream |
| comfyui-krea2edit | 12 | no 0.29 adaptation upstream |

LTX is the only node upstream has adapted for 0.29. The five that are behind are
behind for unrelated feature reasons — no 0.29 cause to move them, and moving a pin
without a reason is how untested drift enters a release.

Worth watching but not acted on: 0.29 PR #14843 adds core krea 2 reference-image
support for ostris + identity-edit ref LoRAs, which is adjacent to our Krea2
injection. Behaviour addition, not a removal — the live boot below shows all eight
Krea2 node classes still registering.

## Windows dev PC — leg 1 of the user's test order, PASSED

The user de-scoped a full engine reinstall here ("mainly to see there aren't failed
nodes"). The dev engine's ComfyUI is a real git clone and the weights live outside it
on `G:/CubricModels`, so 0.29.2 was tested **in place** — core checked out to the tag,
the four changed pip packages installed into `python_embeded`. That keeps the
MpiNodes dev symlink intact and skips a 2.1 GB re-download. Reversible with
`git checkout v0.28.0` + re-pinning those four packages.

- `git checkout v0.29.2` -> `comfyui_version.py` reads `0.29.2`; live
  `/system_stats` reports **`comfyui_version: 0.29.2`**, pytorch 2.13.0+cu130.
- **The drift ladder repaired LTX by itself.** `POST /engine/repair-deps` on the
  bumped lock re-cloned the node, ran its requirements, and re-stamped
  `.mpi_node_commit` from `4f45fd6c...` to `3b9c5cde...`. `embeddings_connector.py`
  on disk now carries `freqs_cis_matrix` at lines 18 and 265 — the exact import that
  was dead on the Mac.
- **ComfyUI booted with ZERO failed node imports.** All 14 custom nodes appear in the
  import-times table, LTXVideo among them at 0.8s. 1862 node classes registered,
  including 67 LTXV classes, all 8 Krea2 classes, MpiBox, VHS_VideoCombine,
  UltimateSDUpscale, ImpactSimpleDetectorSEGS.
- The only two tracebacks at boot are **pre-existing and deliberate**: KJNodes'
  optional `PatchTritonVAE` needs `triton`, which we intentionally do not ship
  (MPI-50). The same warning appears 12 times earlier in `logs/app.log`, first on
  2026-07-29 while still on 0.28.0. Not a 0.29 regression; KJNodes itself imports fine.
- **Generation passed on 0.29.2**: ILL_Anime, 768x768, 8 steps euler, queued at
  `/prompt` -> `status: success`, `mpi419_029_smoke_00001_.png` (754,545 bytes) written
  to the engine output folder. Image inspected — coherent, correctly sampled.
- The version-stamp fix is **function-verified, not install-verified** on this box: an
  in-place checkout never runs the install path. Exercised the new logic directly —
  `getComfyPath('./engine','comfyui_version.py')` resolves and the regex parses
  `0.29.2` out of the real file. The stamp was then synced by hand so the app stops
  offering a false upgrade; `/engine/version-check` now reads
  `installed 0.29.2 / required 0.29.2 / needsUpgrade false`.
- Guard tests green after the bump: node-drift 27/27, resolver contract 14/14,
  remote-engine-assets 6/6, `eslint routes/engine.js` clean.

## Still open

- **The `--version` pin itself cannot be proven on Windows** — Windows takes the
  prebuilt-archive path and never runs `comfy install`. That flag can only be
  exercised on the Mac or Linux.
- Mac leg: rebuild in CI, fresh extract, fresh engine install, confirm comfy-cli lands
  exactly 0.29.2 and the stamp reads it back.
- Pod image rebuild: **deliberately deferred** by the user 2026-07-31 until local is
  proven, so the image is built with whatever node fixes local testing surfaces.
  Its `node_lock.json` copy is still at v0.28.0, image `v0.17.0`. LTXVideo is a baked
  node, so the bump does drift the image — but the new LTX commit is backwards
  compatible, so the Pod keeps working at 0.28.0 until the rebuild.
