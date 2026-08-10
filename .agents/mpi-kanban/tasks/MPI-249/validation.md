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
