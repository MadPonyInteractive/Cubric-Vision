# MPI-249 validation

## Linux leg, run against the REAL v1.4.0 artifact — 2026-08-10

Half of this card is now evidenced. The other half is **hardware-impossible on the
box we have**, which is a finding, not a to-do.

**VERIFIED on `CubricVision-linux-x64-v1.4.0.tar.gz` (the published artifact, not a
dev checkout), on the ThinkPad X121e / Ubuntu 22.04:**

- Transfer integrity — sha256 `3d0b7824…`, 503,654,656 bytes, IDENTICAL both ends.
- Archive shape — ONE top-level folder, 6,410 files, exec bits intact on `uv`,
  the Electron binary and all five launchers.
- **0 dangling symlinks** in the extracted tree (`find -xtype l`), on a real
  filesystem rather than an archive listing.
- Bundled `uv 0.12.3` runs on a 2011 Sandy Bridge CPU.
- **The app LAUNCHES** — confirmed by Fabio on the physical screen and by the server
  binding 127.0.0.1:3000. Driven over ssh into a WAYLAND session with `DISPLAY=:0`
  (Xwayland); the box has no `.Xauthority` and no xvfb, so that is the way in.
- **`uv-bootstrap` is the path taken** — `nvidia-smi not found` →
  `Resolved config: uv-bootstrap (vendor none, CUDA unknown)`. That is
  `_provisionUvEngine`, the leg a RunPod run can never substitute for.
- **`Successfully checked out tag: v0.31.0`** — the Linux provision pulls the engine
  version 1.4.0 ships, so the bump is proven on this path too.
- **`Successfully installed torch-2.13.0+cpu torchvision-0.28.0+cpu
  torchaudio-2.11.0+cpu`** — the correct CPU wheel set, and the heaviest single step
  (a 191.8 MB wheel).
- The in-app updater works here: `portable check — current=1.4.0 latest=1.3.1`.

**NOT verified, and why:**

- **The engine install never COMPLETED.** ComfyUI's own (much lighter) requirements
  were still going when the laptop thermally shut down and rebooted — twice. The
  archived hardware note predicts exactly this ("thermally shuts down under sustained
  load"). The second attempt RESTARTED rather than resumed (engine tree went 1.3 GB →
  446 MB), so it re-downloaded torch and cooked itself again at 87 °C.
- **A generation on Linux is PERMANENTLY unprovable on this machine.** `/proc/cpuinfo`
  reports `avx` but NOT `avx2`, checked directly — MPI-415's `kornia_rs` SIGILL as a
  hardware fact. No amount of retrying changes it; it needs a different Linux box.

**Consequence for the shipped release notes:** the 1.4.0 body says Linux "extracts and
launches, and engine setup runs" — deliberately NOT "installs successfully", and it
states plainly that no image or video has ever been generated on Linux here. Do not
strengthen that wording without a completed install on capable hardware.

**Also fixed while doing this:** `~/.ssh/config` had `linuxbox` at 192.168.0.200 with
nothing on it. The machine is at **192.168.0.209** (found by sweeping the /24 for an
open port 22); the config now points there. First failure of the session was a dead
ethernet cable — `hostname -I` returning EMPTY is the whole diagnosis, no lease.


## 2026-08-27 -- ADD TO THE macOS LEG: does DramaBox's 4-bit text encoder work on Apple Silicon?

Raised from MPI-607, which wires DramaBox (ComfyUI-MelodramaBox) as a Flow for 2.0. Gate line
lives on MPI-595's checklist under the existing macOS item; this is the actual check to run.

**Background.** DramaBox's recommended text encoder is a 4-bit Gemma-3-12B (~8 GB), which needs
`bitsandbytes`. The alternative is bf16 at ~24 GB and HF-gated, so if 4-bit does not work the
flow has no text encoder it can load on that machine.

MelodramaBox's own requirements.txt excludes macOS outright (`platform_system != "Darwin"`).
**That marker is stale** - 0.50.2 publishes `bitsandbytes-0.50.2-py3-none-macosx_14_0_arm64.whl`.
Copying it would have excluded the only Mac we ship to, since `build:portable:mac` is
`--arch arm64`. `dev_configs/python_deps.in` therefore carries an INVERTED marker:
`platform_system != "Darwin" or platform_machine == "arm64"` - Apple Silicon installs it,
Intel Macs do not (no wheel AND no sdist, and a line pip cannot satisfy fails the whole install,
which is the MPI-370 class).

**What to check on the Mac, in order:**

1. Does `pip install -r python_deps.txt` complete? A resolve failure here is MPI-370 all over
   again and outranks everything below.
2. Does an arm64 Mac on **macOS < 14** resolve? The wheel is tagged `macosx_14_0`. If it does
   not, the marker needs a version bound too, or a floor documented.
3. Does the 4-bit encoder actually LOAD and RUN? `bitsandbytes` having a Mac wheel does not
   mean nf4 works on MPS. `dramabox_nodes/model/text_encoder.py:167` builds a
   `BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4")`; the pre-quantized branch
   skips that config but still needs bitsandbytes to dequantize, so both paths depend on it.
4. If 3 fails: DramaBox needs a platform gate before 2.0. **None exists** - there is no
   `platform` field on any dep and no `process.platform` check in flowsRegistry, commandRegistry
   or the Model Library. Fabio's preference (2026-08-27) is a WARNING at install that still lets
   the user through, then an error toast on run - not a hard block, because a hard block written
   from a guess could wrongly kill a working feature. The reason a gate is justified at all
   rather than just a description line (cf. MPI-584, "the user's GPU is the limit"): the failure
   arrives AFTER a 16.36 GB download and reads as a broken app, i.e. misattributed.

Not testable from Windows. `ssh macbox` was refused on 2026-08-27 (rented box, connection
refused at gate1.rentamac.io) and no Mac was rented for this.

### 2026-08-30 — check 2 ANSWERED from Windows, no Mac needed

A resolve is not a run, and a resolve is all check 2 asks for. `uv` resolves against a
declared target platform without downloading anything, so the wheel question is answerable
here:

```
uv pip install --dry-run --no-deps --python-platform aarch64-apple-darwin -r dev_configs/python_deps.txt
```

**Answer: no, an arm64 Mac below macOS 14 does not resolve — and bitsandbytes is only half
of it.** Two packages have a macOS floor, and the older one has been there since the curated
set was created:

| package | only Mac wheel | arrived in |
|---|---|---|
| `bitsandbytes==0.50.2` | `macosx_14_0_arm64` | MPI-607 |
| `embreex==4.4.0` | `macosx_13_0_arm64` | **MPI-413** — the original curated set |

`embreex` comes via `trimesh[easy]` and its marker is `platform_machine != 'aarch64'`, which
does **not** exclude Apple Silicon: macOS reports `arm64`, and `aarch64` is the Linux spelling.
So it is selected on every Mac we ship to.

**The set's effective macOS floor is therefore 14 (Sonoma), and nothing declares it.**

**Bounding the bitsandbytes marker does not fix this** — measured, not assumed. Re-running the
same resolve with `(platform_machine == "arm64" and platform_release >= "23") or sys_platform
!= "darwin"` moves the failure to `embreex` instead of clearing it. Linux stayed at 149
packages, so the bound itself is harmless; it just does not buy anything on its own.

**What this changes about check 1.** "Does `pip install -r python_deps.txt` complete?" now has
a version-dependent answer: **yes on macOS 14+, no below it**, for a reason that predates
DramaBox. Anyone reporting "pip was fine on Mac" was on 14+.

**Recommendation — declare the floor, do not chase it.** macOS 14+ is one line in the release
notes and the install docs. The alternative is un-pinning `trimesh[easy]`'s Extra and finding a
`bitsandbytes` old enough to publish a macOS 13 wheel, which trades a documented floor for two
downgrades on every other platform.

**Checks 3 and 4 are untouched by this** — whether nf4 actually runs on MPS still needs a Mac,
and the install-warning + run-toast gate Fabio asked for on 2026-08-27 is still unimplemented.
The other two platforms are clean: Linux (glibc ≥ 2.28, the Pod) resolves 149 packages and
Windows resolves clean.
