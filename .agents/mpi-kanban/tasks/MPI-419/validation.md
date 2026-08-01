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

## Mac leg — the before-picture, captured live from the OLD 1.3.0 build

Read off the rented M4 at 2026-07-31T10:5xZ, from the build that shipped BEFORE the
fix, on the engine it had installed itself:

```
GET /engine/version-check
{"installed":"0.28.0","required":"0.28.0","needsInstall":false,"needsUpgrade":false}

<extract>/engine/.mpi_engine_version        -> 0.28.0
<extract>/engine/ComfyUI_macos/comfyui_version.py -> __version__ = "0.29.0"
```

That is the defect in one frame: a **healthy** report — no upgrade offered, nothing to
repair — over a tree that is actually 0.29.0, with the log carrying
`ImportError: cannot import name 'interleaved_freqs_cis'` (app.log:307) and
`3.3 seconds (IMPORT FAILED): .../custom_nodes/ComfyUI-LTXVideo` (app.log:386).

**Access note for future legs: the Mac needs NO GUI clicks.** `ssh macbox` then plain
`open <extract>/start.command` launches the Electron app on the console session and the
server binds 127.0.0.1:3000 within ~3s. `launchctl asuser` is the wrong tool — it needs
root and fails with `Could not switch to audit session`. The whole leg below was driven
over SSH with the user asleep.

## Mac leg — leg 2, PASSED 2026-07-31T11:07–11:14Z. THE PIN IS PROVEN.

This is the only machine that can exercise `--version`, because Windows takes the
prebuilt-archive path and never runs `comfy install`. Run end to end over SSH with the
user away — no GUI click anywhere.

- **Artifact**: mpi-ci run **30625478488**, `ref=master` (= `e2c2b4d6` + a kanban-only
  commit). A **short SHA is not a valid checkout ref** — the first dispatch died with
  `A branch or tag with the name 'e2c2b4d6' could not be found`; pass a branch, a tag,
  or the full 40-char SHA. All three OS jobs green. `cubric-vision-darwin-arm64`
  pulled here and scp'd to the Mac byte-exact (**471,995,554**), extracted with
  `ditto -x -k` into a **separate** root (`~/Downloads/b2/`) so the old build stayed
  intact as the before-picture. Delivered by scp, so no quarantine xattr was ever set.
- **The shipped artifact really carries the fix** — checked in the extracted tree, not
  in the repo: `app/routes/engine.js:416` has `'--version', COMFY_VERSION`,
  `_readInstalledComfyVersion` is at `:467` and consumed at `:574`, and
  `app/dev_configs/system_dependencies.json` reads `0.29.2`.
- **Fresh state before the install**: `{"installed":null,"required":"0.29.2","needsInstall":true}`.
- **THE PROOF** — after one `POST /engine/download`:

  ```
  [11:09:37] [INFO] [engine] Version stamp written: 0.29.2
  engine/.mpi_engine_version                -> 0.29.2
  engine/ComfyUI_macos/comfyui_version.py   -> __version__ = "0.29.2"
  GET /engine/version-check {"installed":"0.29.2","required":"0.29.2","needsUpgrade":false}
  ```

  comfy-cli landed **exactly the pin**, and the stamp is the version read back off
  disk. Compare with the before-picture above: same endpoint, same file, previously
  agreeing on a number that was not what was installed.
- **UW deps clean**: `GET /engine/deps-status` -> `needsDepsInstall false`, zero
  missing, zero drifted. Both darwin requirement filters fired again on a from-scratch
  install (`dropped git+.../sam2` for Impact-Pack, `dropped onnxruntime-gpu` for
  `comfyui_controlnet_aux`) — MPI-370's fix re-proven on the real install path rather
  than on a repair pass.
- **LTXVideo imports on the uv engine — the macOS/Linux half of the defect.**
  `6.1 seconds: .../custom_nodes/ComfyUI-LTXVideo`, **zero** `IMPORT FAILED` lines in
  the whole boot, no `interleaved_freqs_cis` anywhere. All **14** custom nodes import.
  1862 node classes, 65 LTXV, 8 Krea2. (Windows counted 67 LTXV on the same pins — a
  2-class gap that is almost certainly CUDA-gated nodes, worth a glance if an LTX node
  ever turns up missing on Apple hardware, not a blocker.)
- The only boot tracebacks are the pre-existing deliberate ones: KJNodes'
  `PatchTritonVAE` needs `triton`, which we do not ship (MPI-50). Same two on Windows.
- **Generation PASSED on Apple silicon at 0.29.2**: SDXL Realistic, 768x768, 8 steps
  euler, queued at `/prompt` -> `status_str: success`, `mpi419_mac_029_00001_.png`
  (913,085 bytes) written and visually inspected — coherent, correctly sampled.
  torch is the documented unpinned MPS nightly `2.14.0.dev20260730`.
- Install took **~2 minutes** because the uv/pip caches were warm from the earlier run
  and `modelsRoot` was pointed at the old extract's existing 12 GB of weights
  (`POST /engine/download {"modelsRoot": "..."}` — the chosen-root path, which also
  re-proved `extra_model_paths.yaml written with chosen root`). A cold box will be far
  slower; this run proves correctness, not install duration.

### Found during this leg, not actioned — Frame-Interpolation tries to build cupy on macOS

`ComfyUI-Frame-Interpolation`'s own `install.py` reaches "Checking cupy... Installing
cupy...", and `cupy-wheel` fails to build with
`ModuleNotFoundError: No module named 'pkg_resources'` inside the isolated build env.
cupy is CUDA-only, so it can never succeed on Apple silicon. **It is not fatal** — the
script still exits 0, so we log `Custom install command succeeded for
ComfyUI-Frame-Interpolation`, the pip pins apply and the commit marker stamps. Cost is
a scary WARN + 20-line traceback in the log of every clean macOS install, and probably
the same on any GPU-less Linux box. The repo already has the right mechanism for this
(`requirementsDrop: { darwin: [...] }` in `nodesDeps.js`) but it filters
`requirements.txt`, not a node's own `install.py`. Not carded — raise with the user.

## Pod image — the remote twin, rebuilt and verified 2026-07-31T11:20–11:40Z

The dual-engine clause: `dev_configs/node_lock.json` also drives the RunPod image, so
fixing only the local twin would have been a half-fix. Built on the **dev** line per
MPI-340 — released users cannot resolve a `-dev` tag, so nothing shipped.

- **Lock synced into the build context** (`cp` from the canonical Cubric-Vision lock),
  committed + pushed to mpi-ci as **73f4514**. Diff was exactly the 7 expected lines:
  core `v0.28.0` -> `v0.29.2`, frontend 1.47.11 / 0.11.20, LTXVideo -> `3b9c5cde`, plus
  **MpiNodes and krea2edit, which had silently drifted behind** the canonical lock
  (pod `aaa1d2d9`/`17af8833` vs ours `69a43336`/`223a9383`). Syncing the whole file is
  what caught them.
- **CI run 30626614008, both legs green** — `v0.18.0-dev-cu130` -> Docker Hub,
  `v0.18.0-dev-cpu` -> GHCR. `comfyui_ref=v0.29.2` (the lock's TAG; a bare SHA makes
  `git clone --branch` exit 128), `wrapper_version=0.2.40`.
- **`[cubric] node-import smoke test OK`** in the cu130 build. That layer boots ComfyUI
  and greps the log for `IMPORT FAILED`, so it is a real assertion that every baked
  node — LTXVideo included — imports against 0.29.2. **Third independent proof of the
  fix**, after Windows and the Mac.
- `[cubric] torch 2.12.0+cu130 cuda 13.0` — the load-bearing wrong-CUDA-wheel guard.
- **cpu boot smoke passed here**: `/health` 200 with `wrapper_version 0.2.40`, and
  token-gated `/wrapper/stats` correctly 401s. Both tags `docker manifest inspect`
  clean, so both are publicly pullable — no visibility gate outstanding.
- App-side dev pins moved to `v0.18.0-dev` (commit `411f6cd6`). **The stable pins stay
  on v0.17.0 / ComfyUI 0.28.0** — the new LTX commit is backwards compatible, so the
  released Pod keeps working until a live verify promotes this.

**The one thing an agent cannot do: the live Pod verify.** Deploying a Pod is user-only.
Card stays in `doing`/`validating` until the user runs a dev-mode Pod and confirms the
image line + `wrapper_version`.

## Still open
- Pod image rebuild: **deliberately deferred** by the user 2026-07-31 until local is
  proven, so the image is built with whatever node fixes local testing surfaces.
  Its `node_lock.json` copy is still at v0.28.0, image `v0.17.0`. LTXVideo is a baked
  node, so the bump does drift the image — but the new LTX commit is backwards
  compatible, so the Pod keeps working at 0.28.0 until the rebuild.

## Live Pod verify — leg 3 CLOSED 2026-07-31T20:47–20:57Z, on a real dev-mode Pod

The last user-only item. Pod deployed by the user from the dev app (`npm start`, so
`_devMode` is true and the dev pins resolve); every reading below was taken read-only
while it booted, no clicks and no generation.

**Pod:** `thlt3mns6055r5`, machine `so5311pahl76`, NVIDIA L4, EU-RO-1, network volume
`9t3awufudk`, $0.39/hr. Created `20:47:05.579Z`.

### The image line — what the box asked for

From the app's own log (`%APPDATA%/Cubric Vision/logs/app.log`):

```
[2026-07-31T20:47:03.002Z] [INFO] [runpod] Pod image for NVIDIA L4: docker.io/madponyinteractive/cubric-vision-pod:v0.18.0-dev-cu130
[2026-07-31T20:47:03.570Z] [INFO] [runpod] dev_mode: Pod boots the `dev` R2 runtime channel (vision/dev/)
```

Confirmed independently against the RunPod record (`GET /runpod/pods/:id`):

| field | value |
|---|---|
| `imageName` | `docker.io/madponyinteractive/cubric-vision-pod:v0.18.0-dev-cu130` |
| `env.CUBRIC_RUNTIME_CHANNEL` | `dev` |
| digest (RunPod system log) | `sha256:e9dd0fda9ed2b68b3a840157f5bcbe7534b6a686dc713fa2946b5dfce848223f` |

**The pin is genuinely being resolved, not cached.** The user's earlier attempt the same
morning logged `v0.17.0-dev` at `10:00:33Z`; the dev pins moved to `v0.18.0-dev` at
`12:37Z` (`411f6cd6`); this `20:47Z` create logged `v0.18.0-dev`. Same app, same code
path, different answer either side of the bump.

### `wrapper_version` — the other half

`GET /remote/comfy/status` once the handshake completed:

```
{"running":true,"ready":true,"comfyReady":true,"wrapperVersion":"0.2.40","connecting":false}
```

`0.2.40` matches the R2 `dev` manifest exactly. Note the Pod env carries
`CUBRIC_WRAPPER_VERSION=0.2.36` — that is the inert app-side pin the bootstrap unsets
(already chased and closed in MPI-342); the fetched wrapper self-reported 0.2.40.

**Beyond the box:** `comfyReady: true` — ComfyUI itself came up on 0.29.2 on the L4, so
this proves boot, not merely image resolution.

### Connect took ~9 minutes — diagnosed, not a defect

Cold pull of a same-day tag. `v0.18.0-dev-cu130` is 9.3 GB / 23 layers and was pushed
`2026-07-31T11:35:41Z`, ~9 h before the boot, so neither the host nor the region's CDN
had it. (`v0.17.0-cu130` for comparison: 9.2 GB, pushed 2026-07-24 — near-identical
size, so this is age, not bloat.)

On top of that the RunPod system log showed a retry cascade — a dozen layers entering
`Retrying in 5/4/3 seconds` the moment they started. Pod pulls are **anonymous**: there
is no `containerRegistryAuth` anywhere in the Pod spec, so they are subject to Docker
Hub's per-IP anonymous rate limit, which RunPod hosts share across tenants. Every layer
did eventually report `Pull complete`, so it was backoff, not corruption.

Two artefacts settle the "is it stuck / did it restart" question:

- `createdAt` and `lastStartedAt` are both `20:47:05.5` — one continuous attempt, the
  Pod never bounced or got rescheduled. The console's layer counter climbing 4 -> 16 ->
  23 is progressive manifest enumeration, not a restart; layers that went green stayed
  green.
- `Status: Downloaded newer image …` at `21:55:51` local, then `Status: Image is up to
  date …` at `21:55:52` — the cache filling, one second apart.

**Measured, not assumed — the user re-ran it 15 min later and the mechanism is NOT
host caching.** Deleting the Pod and reconnecting landed on a *different* machine
(`f4ukl6gl2vvl`, vs `so5311pahl76` the first time), pulling the *same* tag, and reached
`comfyReady` in **133 s versus ~558 s** — 4x faster on hardware that had never held the
image.

| | 1st connect | 2nd connect |
|---|---|---|
| machine | `so5311pahl76` | `f4ukl6gl2vvl` |
| tag | `v0.18.0-dev-cu130` | same |
| time to `comfyReady` | ~558 s | **133 s** |

So the expensive event is the **first pull of a young tag into a region** — Docker Hub
edge cold-miss plus the anonymous rate-limit backoff — not per-host warmth. The user also
notes a stopped Pod is reclaimed and re-rented, so ~99% of creates land on fresh hardware
anyway; that turns out not to matter much once the tag itself is warm.

**Released users are unaffected either way** — they pull `v0.17.0`, in circulation since
24 July.

### Verdict

Leg 3 passes. `v0.18.0-dev` resolves, pulls, boots, runs ComfyUI 0.29.2, and serves
wrapper 0.2.40 on the `dev` R2 channel. The stable pins remain on `v0.17.0` — promoting
them is a separate, deliberate decision and is NOT required by 1.3.0.

### Follow-up worth carding (not done here)

Anonymous registry pulls make every fresh tag a coin-flip on another tenant's rate
limit. Two known fixes: authenticate the pull, or mirror the GPU image to GHCR the way
the CPU image already is. The move to Docker Hub was deliberate (MPI-189, cold-start
measurement), so this is a revisit rather than a regression.

---

## REOPENED 2026-08-01 — the SAME hole, one dependency down: torch

This card's thesis is "the uv installer installs unpinned software and the drift is
self-concealing". The ComfyUI half is fixed and stayed fixed. But the install path
had a second unpinned dependency, and that one shipped a build that silently
produced garbage.

**Found by looking at the pixels.** The 1.3.0 macOS leg on build #4 (`3cb4a58d`)
passed every automated signal — engine installed, ComfyUI 0.29.2 stamped, SDXL
Realistic 7/7 deps, `Prompt executed in 73.22 seconds`, a normal gallery card at
832x1024, a 1.8MB PNG. The image was uniform grey noise. Nothing in the log, the
UI, the timings or the file size distinguished it from a good run.

### Root cause

comfy-cli's `MAC_M_SERIES` branch is the only one of its GPU branches that installs
from the PyTorch **nightly** channel, and it does so with `--pre` and no version
(`comfy_cli/command/install.py`):

```
pip install --pre torch torchvision torchaudio \
  --extra-index-url https://download.pytorch.org/whl/nightly/cpu
```

Every other branch — NVIDIA (`whl/cu*`), AMD (`whl/rocm*`), Intel Arc (`whl/xpu`),
CPU (`whl/cpu`) — uses a stable index. We passed `--m-series` and inherited the
nightly as a side effect. So the engine a Mac user ended up with depended on the
calendar date they clicked Install.

### Isolation — one variable, ComfyUI held at 0.29.2 throughout

| torch | channel | result |
|---|---|---|
| `2.14.0.dev20260731` | nightly | grey noise (2 prompts, 2 runs, reproducible) |
| `2.14.0.dev20260730` | nightly | correct image |
| `2.13.0` | **stable** | correct image, 73.45s (no speed cost) |

The 0.29.2 pin is innocent — it renders correctly with either working torch. The
earlier macOS generation on this card's own checklist passed legitimately; it ran on
an engine that happened to catch a good nightly.

Cross-platform: Windows ships a frozen `2.13.0+cu130` inside the prebuilt portable
archive (read out of the shipped engine), Linux resolves stable from PyPI. macOS was
the only platform installing an unreleased PyTorch.

### Fix — commit `baefe4c3`

- `dev_configs/system_dependencies.json`: new `torchMac` pin (2.13.0 / 0.28.0 / 2.11.0),
  beside the existing `engine.version` pin.
- `routes/platformEngine.js`: exports `TORCH_MAC`.
- `routes/engine.js` step 2b: on darwin, install the pinned torch BEFORE comfy-cli runs,
  so ComfyUI's `requirements.txt` then reports torch as already satisfied and leaves it
  alone; and pass `--skip-torch-or-directml` at step 3 so comfy-cli's nightly branch
  never executes. Both guards on purpose — either alone still leaves a path to a nightly.
- Windows and Linux install paths untouched.

Blast radius swept: `installArgs` is the ONLY comfy-cli install invocation in the repo,
`/engine/repair-deps` delegates to `_runEngineDownload` rather than installing torch
itself, `/engine/upgrade` does not touch torch, and no other JS installs torch.

### Verification — real clean install on the rented M-series Mac

Engine folder deleted entirely (including the hidden `.mpi_engine_version` stamp, so
this ran the genuine first-install path, not repair), fixed files swapped in, install
driven through the app's own `POST /engine/download`:

```
[install-torch] + torch==2.13.0  + torchvision==0.28.0  + torchaudio==2.11.0
macOS torch pinned: torch==2.13.0 torchvision==0.28.0 torchaudio==2.11.0
comfy-install: ... install --m-series --version 0.29.2 --skip-torch-or-directml
```

- `pip list` in the new venv: torch 2.13.0, torchvision 0.28.0, torchaudio 2.11.0.
- **Zero occurrences of "nightly" in the entire install log.**
- 16 custom nodes reinstalled, ComfyUI 0.29.2 stamped.
- Generation on that clean engine: correct, sharp image, 75.13s.

Build #5 = mpi-ci run `30674488835` from `baefe4c3`, green on all three platforms
(`HEAD is now at baefe4c3` in all three job logs). The three changed files are
byte-identical (CRLF-normalised) inside the shipped macOS zip, and all three update
bundles carry the fix and still read `fromVersion 1.2.0` with `delete` of 2. Build #4
vs #5 update-bundle file lists are identical — same 212 entries, nothing added or
removed; only the four files' contents changed.

### Standing lesson

An unpinned dependency anywhere in the install path means the build we test is not the
build the user gets. Pinning ComfyUI was necessary and not sufficient. Also: every
automated success signal agreed on a build that produced garbage — only opening the
image caught it.
