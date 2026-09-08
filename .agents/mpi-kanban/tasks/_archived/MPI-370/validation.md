# MPI-370 validation

Shipped in `a851eb18`. Code-verified; NOT verified on real hardware.

## Verified during implementation

- `tests/requirements-filter.test.cjs` passes. Covers: the real locked
  requirements body (exactly one line dropped, `torch` survives), version
  specifiers / extras / environment markers, the `onnxruntime-gpu-extra`
  prefix guard, null-on-no-match, empty drop list, idempotence, and a comment
  merely naming the package.
- **Negative control run.** Renamed the `requirementsDrop` passthrough in
  `_createDepJob`, re-ran the test, and confirmed it fails with
  "_createDepJob must carry requirementsDrop", then restored it. The wiring
  assertion genuinely bites - a pure-function-only test would have gone green
  while the fix was dead on the path that actually fails.
- `tests/controlnet-aux-torch-guard.test.cjs` still passes - the torch guard on
  this dep did not regress.
- `requirementsDrop` confirmed present on the dep as loaded through the
  backend's `_require` of `dependencies.js`, not just in the source file.
- `node --check routes/downloadManager.js` passes.

## NOT verified - needs a Mac

**A real macOS install of a depth model completing without the Installation
Failed dialog.** No Apple hardware was available, so the earliest true proof is
a 1.3.0 build in a Mac user's hands. Everything above proves the filter is
correct and reaches the install loop; none of it proves pip is then happy.

When a Mac user does run it, the log line to look for is:

```
[INFO] [download] requirements filtered for comfyui_controlnet_aux on darwin: dropped onnxruntime-gpu
```

Absence of that line on a Mac means the field did not survive to the install
loop and the fix is not active.

## Explicitly out of scope

- CPU `onnxruntime` is NOT installed as a replacement. DepthAnythingV2 runs
  through `AIO_Preprocessor`, which is torch-based. Revisit only if an
  ONNX-dependent preprocessor is wired later.
- Remote/Pod path untouched: the Pod bakes this node into a CUDA Linux image,
  so the wrapper never runs this install.

## LIVE ON APPLE HARDWARE — 2026-07-31

Rented Mac Mini M4, macOS 26.5, arm64, 16 GB RAM, 197 GB free (rentamac.io).
Driven over **SSH** this time — `ssh rentamac@gate1.rentamac.io -p 27847`, key
auth, host key fingerprint verified against the dashboard before first connect.
SSH was beta and unusable in the 2026-06-10 session; it now works and removes the
copy-paste relay for everything except GUI actions.

Build: `CubricVision-macos-arm64-v1.3.0.zip` from CI run `30602683182` (source
`bd8a0cc6`), pushed over `scp` in 1m44s and confirmed **byte-exact** —
`c6af05e37642a04d9bb778e8857f70ec8136018c4db69edb056e004e45e2310e` on both ends.

### The precondition was MANUFACTURED, because scp does not quarantine

A file copied over SSH carries no `com.apple.quarantine`. Testing "clear
quarantine, then launch" against a never-quarantined file would look exactly like
a pass — the trap `docs/releases/github-release-checklist.md` § "prove the test
machine BEFORE trusting its result" warns about. So the attribute was written by
hand to mimic a Safari download before extracting:

```
xattr -w com.apple.quarantine "0081;68000000;Safari;$(uuidgen)" <zip>
```

`spctl --status` = `assessments enabled`, so Gatekeeper was genuinely armed.

### Results

- **Quarantine propagated through Archive Utility to 6564 extracted files**, and
  Gatekeeper duly blocked `start.command` with the *"Apple could not verify…
  Move to Trash"* dialog. The block was real, not assumed.
- **`xattr -dr com.apple.quarantine <folder>` cleared it: 6564 -> 0**, and
  `start.command` stayed `rwxr-xr-x`. The documented instruction works verbatim.
- **The app then launched with ZERO manual repair** — no chmod, no symlink
  recreation, nothing beyond the one documented command. (The 0.0.7 build needed
  all three.)
- **`ditto` symlink fix still holds at 1.3.0**, verified on a real Archive Utility
  extract: 14 symlinks inside `Electron.app`, including the five that broke the
  0.0.7 launch (`Electron Framework`, `Resources`, `Versions/Current`,
  `Libraries`, `Helpers`). **Zero dangling** inside the bundle. Exec bits survived
  on all four `.command` files and `uv/uv`.
- **Apple Silicon detected correctly**: `[gpu-detect] Resolved config:
  uv-bootstrap (vendor apple, CUDA unknown)` — the LOCAL uv/comfy-cli path, not
  the Windows prebuilt-archive one.
- `[update] up to date (current=1.3.0 latest=1.2.0)` — the expected pre-publish
  state, seen live.

### gitProvision's macOS branch fired correctly — FIRST RUN EVER on Apple hardware

The box had **no Xcode Command Line Tools** despite the rental advertising "Xcode
pre-installed", so `/usr/bin/git` was the Apple stub. `_provisionUvEngine` called
`ensureGit()` and the failure was reported with the actual cause and the actual
remedy, in the app AND in `app.log` with a full stack:

```
[ERROR] [engine] Engine download/install failed
  Error: git is provided by the Xcode Command Line Tools, which are not installed.
  Run "xcode-select --install", complete the dialog, then retry.
    at installGit        app/routes/gitProvision.js:140:15
    at ensureGit         app/routes/gitProvision.js:179:12
    at _provisionUvEngine app/routes/engine.js:337:27
    at async _runEngineDownload app/routes/engine.js:478:31
```

This also demonstrates **MPI-387 fix C on macOS** — the message names the real
phase and the real remedy rather than a generic "extraction failed". The Windows
SAC laptop could not prove that item because nothing failed there; this run can.

Engine sizing before the failure: 23 universal deps, 2.75 GB.

## THE FIX FIRED ON DARWIN — 2026-07-31T08:21Z, both filter lines present

The item this card exists for. Read from
`<extract>/user-data/logs/app.log` on the rented M4:

```
[2026-07-31T08:21:06.551Z] [INFO] [download] requirements filtered for ComfyUI-Impact-Pack on darwin: dropped git+https://github.com/facebookresearch/sam2
[2026-07-31T08:21:29.486Z] [INFO] [download] requirements filtered for comfyui_controlnet_aux on darwin: dropped onnxruntime-gpu
```

The second line is this card's fix: `requirementsDrop: { darwin: ['onnxruntime-gpu'] }`
survived `_createDepJob`'s whitelist and reached the install. **Its absence was the
failure signal** — an unlisted dep field vanishes silently — so presence is the proof.

The first is MPI-387's git-less drop, configured for darwin at
`nodesDeps.js:88-92` but **only ever seen fire on win32 until now**. Free evidence.

Both fired during the ENGINE/UW install, not a model install: `comfyui_controlnet_aux`
and `ComfyUI-Impact-Pack` are UNIVERSAL nodes. The planned "install SDXL Realistic to
pull controlnet_aux" step was therefore not needed to obtain this proof.

`comfyui_controlnet_aux` then installed clean — custom command succeeded, pip pins
applied (`numpy==2.5.1, opencv-python==5.0.0.93, pillow==12.3.0, scipy==1.18.0,
scikit-image==0.26.0, einops==0.8.2`), commit marker stamped. No "Installation failed".

Final state: `__universal_workflow__` **complete, 100%, zero incomplete deps**;
14 custom-node folders extracted under `engine/ComfyUI_macos/custom_nodes/`.

### Caveat — the run was interrupted and re-driven, and why that is not a confound

The UW download stalled to tens of KB/s partway through (see § CDN throttle below).
It was cancelled via `POST /comfy/models/download/cancel` and re-driven via
`POST /engine/repair-deps`, which is the designed recovery for exactly that state and
runs the identical `finishCustomNodeInstall` pip path. The filter lines above come
from that repair pass. The filtering happens at requirements-install time and is
path-independent, so the re-drive does not weaken the claim.

## CDN throttle seen on the rented Mac — NOT an app bug (measured, 2026-07-31)

Recorded because it cost ~35 min of a billed machine and was initially misdiagnosed
as an app-side download bug. It is not.

At ~08:00–08:20Z, sustained transfers from `models.cubric.studio` decayed hard while
short bursts stayed fast. Measured on the Mac, same file, overlapping in time:

| what | result |
|---|---|
| app / NDH, sustained | 35–80 KB/s |
| `curl`, sustained (no app) | 193 MB in first 30s, then 102 → 83 → 51 → 42 → 34 KB/s |
| `curl`, short 40 MB burst | 17–48 MB/s |
| plain Node `https.get`, app's own Electron runtime | 28.8 MB/s |
| NDH standalone, our exact options + our SHA256 pipe | 9.2 MB/s |
| `dd` write to the same directory | 5.8 GB/s |
| **Hetzner 1GB, sustained 90s, same box, same time** | **8–9 MB/s, ZERO decay** |

`curl` alone reproduces the decay curve with no app in the picture, and the box's
uplink is provably fine (Hetzner). So the app, NDH, the SHA256 pipe, the disk, the
HTTP version (h2 and 1.1 both fast) and macOS App Nap are all excluded — App Nap was
tested by activating the window and made no difference.

It was **transient**: by 08:30Z a fresh 40 MB burst ran at 48.4 MB/s again and the
1.75 GB weight had completed on its own (final size 1,745,546,848 — exact).

Two things worth knowing regardless of cause:
- **The stall watchdog cannot see a crawl.** `_watchdogSweep` (`downloadManager.js:796`)
  fires only when a downloader moves ZERO bytes for `STALL_MS`. A 35 KB/s trickle
  resets `_lastByteTs` on every tick, so a download that would have taken 8.5 hours is
  indistinguishable from healthy progress. Whether that should change is a judgement
  call — killing a genuinely slow link is its own failure mode.
- Cancelling a job whose deps are already complete logs
  `Illegal transition <node>: complete → cancelled (cancel) — rejected` for each.
  The store guard **correctly rejected** them; noted so the warnings are not mistaken
  for a defect later.

## Generate smoke PASSED on Apple hardware — 2026-07-31T08:45Z (first time in any release)

ComfyUI booted on Metal from the packaged 1.3.0 build and executed a real prompt
dispatched from the UI:

```
Total VRAM 16384 MB, total RAM 16384 MB
pytorch version: 2.14.0.dev20260730     <- the documented unpinned MPS nightly
Mac Version (26, 5)   Set vram state to: SHARED   Device: mps
Using pytorch attention
...
Prompt executed in 77.18 seconds
```

SDXL Realistic t2i, 832x1024 (4:5), image landed in the gallery. Sampling ran
~3.2-3.4 s/it for the 7-step pass and ~8 s/it for the 3-step pass on an M4/16 GB.

**Bonus, also never validated on Apple hardware: SAM3 open-vocabulary text masking.**
Prompt "eyes" -> `# of Detected SEGS: 2`, `Prompt executed in 16.63 seconds`, both eyes
masked correctly in the overlay. `SAM3ClipModelWrapper` and `SAM3` both loaded on mps.
(`WARNING: No VAE weights detected, VAE not initalized.` is emitted by the SAM3
checkpoint load — SAM3 has no VAE — and is benign.)

## TWO NEW DEFECTS FOUND AT FIRST BOOT — both pre-existing, neither macOS-specific in cause

### A. The uv engine installs an UNPINNED ComfyUI, then stamps it with the pinned version

**Measured on the box:**

| | value |
|---|---|
| `engine/.mpi_engine_version` (what we stamp) | `0.28.0` |
| `engine/ComfyUI_macos/comfyui_version.py` (what is actually there) | `0.29.0` |
| `dev_configs/system_dependencies.json` -> `engine.version` | `0.28.0` |

`_provisionUvEngine` builds its `comfy install` args at
[engine.js:405-407](../../../../routes/engine.js#L405-L407) and passes **no version
flag**, so comfy-cli clones whatever is current on master. `engine.js:538-544` then
writes `config.engine.version` — the pin — into `.mpi_engine_version` regardless of
what actually landed.

**The drift is self-concealing.** `/engine/version-check`
([engine.js:613-620](../../../../routes/engine.js#L613-L620)) compares that stamp
against `COMFY_VERSION`. Both read `0.28.0`, so they match, no upgrade is ever
offered, and a 0.29.0 tree is reported as a correct 0.28.0 install forever.

**Observed consequence — a shipped node is dead.** Our pinned `ComfyUI-LTXVideo`
commit fails to import against 0.29.0:

```
Cannot import .../custom_nodes/ComfyUI-LTXVideo module for custom nodes:
cannot import name 'interleaved_freqs_cis' from 'comfy.ldm.lightricks.model'
```

Verified on the box: `comfy/ldm/lightricks/model.py` in core 0.29.0 does **not**
define `interleaved_freqs_cis`, and `ComfyUI-LTXVideo/embeddings_connector.py:13`
imports it (used at `:258`). So **LTX video generation is broken on every local
uv engine** — macOS and Linux both, since both take `_provisionUvEngine`.

**Windows is NOT affected** — it takes the prebuilt-archive path, which carries a
real pinned 0.28.0.

**This is time-activated, which is why it has never been seen.** While 0.28.0 was
current, the unpinned install happened to produce 0.28.0 and everything agreed.
It broke the moment 0.29.0 shipped. It is also plausibly the first time ComfyUI has
booted on a local uv engine at all: the Windows SAC laptop had no GPU and skipped the
smoke, the dev PC's smoke ran remote on a Pod, and the Linux box could not boot
ComfyUI (MPI-415 / kornia SIGILL).

**Fix direction:** `comfy install` accepts `--version`, confirmed from comfy-cli's own
help on this box (`--version <str>  Specify version`; `--commit <str>` also exists).
Pass `COMFY_VERSION` through. Do NOT stamp a version that was not verified from
`comfyui_version.py` after the install.

### B. TAESD previews are enabled but the decoder weights are never installed

Every generation logs:

```
Warning: TAESD previews enabled, but could not find models/vae_approx/taesdxl_decoder
```

We turn TAESD on in two places — `--preview-method taesd` at
[comfy.js:390](../../../../routes/comfy.js#L390) and
`Comfy.Execution.PreviewMethod`/`Comfy.PreviewMethod` at
[engine.js:527-528](../../../../routes/engine.js#L527-L528) — but no taesd decoder
exists in the dependency tables (no `taesd`/`vae_approx` entry anywhere in
`js/data/modelConstants/`), and `models/vae_approx/` does not exist on disk.

Consequence: **no live preview image during sampling** on this engine; the user gets
a progress bar with no picture. Cause is platform-independent — it is a missing
dependency, not a macOS issue — though local-engine previews have rarely been
exercised (see the note above about where smokes have actually run).
