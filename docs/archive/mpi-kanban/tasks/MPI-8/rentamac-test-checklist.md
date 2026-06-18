# macOS rentamac test checklist — 0.0.8 install + 0.0.9 update

**Hardware:** rentamac.io Mac Mini M4, 10-core, 16 GB RAM, macOS Tahoe 26.4+, arm64. SSH + admin.
**Goal:** validate the 4 mac fixes (commit `b6d46bf`) on real Apple Silicon BEFORE bumping 1.0.0.
**Workflow:** Fabio drives the Mac (SSH); Claude observes/relays commands. Run top to bottom.

Artifacts (from mpi-ci run, version 0.0.8):
- Full install: `CubricVision-macos-arm64-v0.0.8.zip`
- Update bundle (phony): `CubricVision-macos-arm64-update-v0.0.9.zip`
- Extracted root: `CubricVision-macos-arm64-v0.0.8/`

---

## 0. Pre-flight (environment sanity)

```sh
sw_vers                  # macOS version
uname -m                 # expect: arm64
sysctl -n machdep.cpu.brand_string   # expect: Apple M4
```
PASS if arm64 + Apple M4.

---

## 1. Gatekeeper / quarantine on first download  (FIX #3)

Download the full zip to the Mac (scp / browser / curl from the public release).
Then BEFORE removing quarantine manually, observe the natural state:

```sh
cd ~/Downloads
xattr -p com.apple.quarantine CubricVision-macos-arm64-v0.0.8.zip 2>/dev/null && echo "QUARANTINED (expected for a download)" || echo "no quarantine"
# extract with the real macOS tool (Archive Utility behaviour), not unzip:
ditto -x -k CubricVision-macos-arm64-v0.0.8.zip ./extracted
cd extracted/CubricVision-macos-arm64-v0.0.8
```

CHECK exec bits survived the zip (FIX #2):
```sh
ls -l start.command update.command update-from-zip.command
# EXPECT: -rwxr-xr-x on all three (the x bits are the FIX #2 proof)
ls -l app/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron
# EXPECT: -rwxr-xr-x
ls -l uv/uv 2>/dev/null   # EXPECT -rwxr-xr-x if uv bundled
```
**FIX #2 verdict:** PASS if start.command is executable (has x). FAIL = the zip
exec-bit fix did not land → double-click would open TextEdit.

First-launch Gatekeeper test (GUI, via remote desktop): double-click start.command
in Finder. Expect either it launches, or one "cannot be opened" → right-click → Open
→ Open works. The xattr strip inside start.command should prevent repeat blocks.
**FIX #3 verdict:** PASS if the app launches after at most one right-click→Open.

---

## 2. App boots + version is 0.0.8

After start.command runs, the Electron window should appear. Confirm:
```sh
tail -n 40 "CubricVision-macos-arm64-v0.0.8/logs/app.log"
```
Look for clean boot, server on 127.0.0.1:3000, no stack traces. Confirm the app's
About/version shows 0.0.8.
PASS if boots clean and reports 0.0.8.

---

## 3. Engine install pulls MPS-capable torch  (FIX #1 install half)

In the app, run the ComfyUI engine install (first-run install flow). Watch the log:
```sh
tail -f "CubricVision-macos-arm64-v0.0.8/logs/app.log"
```
EXPECT in the install command: `comfy ... install --m-series`  WITHOUT `--fast-deps`
(that omission is FIX #1 — it forces the MPS nightly torch).

After install, verify torch is MPS-capable in the engine venv:
```sh
# venv is the sibling comfy-venv of the ComfyUI workspace (engine root)
ENGINE=~/.../CubricVision-macos-arm64-v0.0.8/engine   # adjust to real path
"$ENGINE"/../comfy-venv/bin/python3 -c "import torch; print(torch.__version__, torch.backends.mps.is_available())"
# EXPECT: a torch version + True
```
**FIX #1 (install) verdict:** PASS if mps.is_available() == True.

If git is missing the installer should say `xcode-select --install` (mac branch),
NOT an apt command. Confirm that wording if the path triggers.

---

## 4. Launch uses Metal/MPS, NOT --cpu  (FIX #1 launch half)

When ComfyUI starts, watch the log:
```sh
grep -E "Metal/MPS|CPU mode|--cpu|--use-pytorch-cross-attention" "CubricVision-macos-arm64-v0.0.8/logs/app.log" | tail
```
EXPECT: "Apple Silicon — starting ComfyUI with Metal/MPS." and the ComfyUI process
args contain `--use-pytorch-cross-attention` and NO `--cpu`.
Also confirm in ComfyUI's own stdout it reports the `mps` device (not `cpu`).
**FIX #1 (launch) verdict:** PASS if MPS device + no --cpu.

---

## 5. Real generation on MPS

Run one real image generation (smallest available checkpoint). Confirm:
- it completes without crashing,
- it is GPU-fast (seconds-to-low-minutes), not CPU-glacial (would be ~20× slower),
- Activity Monitor → GPU History shows GPU activity during the run.
PASS if it generates on GPU and the image is correct (not black — if black, note it:
that is the known FP16-VAE-on-MPS issue, fixable with --fp32-vae, deferred unless seen).

---

## 6. ffmpeg/ffprobe staged + EXECUTABLE + video works  (FIX #4 + FIX #5)

Confirm both media tools staged AND executable (FIX #5 — they shipped non-exec
in the first 0.0.8 build; the rebuild marks them 0755 + runtime self-heal):
```sh
ls -l "CubricVision-macos-arm64-v0.0.8/resources/ffmpeg" "CubricVision-macos-arm64-v0.0.8/resources/ffprobe"
# EXPECT: -rwxr-xr-x on BOTH (the x bit is the FIX #5 proof)
"CubricVision-macos-arm64-v0.0.8/resources/ffprobe" -version | head -1
"CubricVision-macos-arm64-v0.0.8/resources/ffmpeg"  -version | head -1
# EXPECT: version banners, no "Permission denied" / EACCES
```
Then in-app: import or generate a video, scrub/trim it, confirm frame count + gallery
thumbnail render.
**FIX #4 + #5 verdict:** PASS if both binaries are executable, -version runs, and
video trim/frame/thumb work. (If they were non-exec, video would fail with EACCES.)

---

## 7. OFFLINE update  0.0.8 → 0.0.9  (update-from-zip)

Copy `CubricVision-macos-arm64-update-v0.0.9.zip` to the Mac. With the app CLOSED:
```sh
cd "CubricVision-macos-arm64-v0.0.8"
./update-from-zip.command ~/Downloads/CubricVision-macos-arm64-update-v0.0.9.zip
```
EXPECT: applies cleanly, no asar stall (process.noAsar fix), ends with the chmod +
xattr sweeps. Then:
```sh
ls -l start.command          # EXPECT still -rwxr-xr-x (restoreLauncherBits)
```
Relaunch via start.command, confirm version now 0.0.9, and engine/models/projects
(if any were created) are PRESERVED.
PASS if updates to 0.0.9, launchers still executable, user data intact.

---

## 8. ONLINE update  (update.command)  — needs repo PUBLIC + 0.0.9 as 'latest'

Fabio: temporarily flip the Cubric-Vision repo PUBLIC and publish 0.0.9 as a
non-prerelease 'latest' release carrying the mac update bundle. Then on the Mac,
from a FRESH 0.0.8 install (re-extract from §1), with app closed:
```sh
cd "CubricVision-macos-arm64-v0.0.8"
./update.command
```
EXPECT: fetch-release.cjs (run via the bundled Electron, NO curl/system-node)
downloads the arm64 update bundle, then update-from-zip applies it. Confirm:
- the download works (redirect-aware https),
- no host-tool error,
- version becomes 0.0.9, launchers stay executable, data preserved.
PASS if online update completes end-to-end. Flip repo back to PRIVATE after.

---

## Post-test cleanup
- `gh release delete v0.0.8 --repo MadPonyInteractive/Cubric-Vision --yes; git push origin :refs/tags/v0.0.8`
- `gh release delete v0.0.9 --repo MadPonyInteractive/Cubric-Vision --yes; git push origin :refs/tags/v0.0.9`
- also delete the earlier throwaway v0.0.7 (handoff TODO).
- Record results in `.agents/mpi-kanban/tasks/MPI-49/validation.md` (mac section) and
  memory `project_macos_build_fixes` (flip each fix from UNVERIFIED to PASS/FAIL).

## Decision gate
Only AFTER §1–8 pass (or failures are understood + fixed): ask Fabio for the go to
bump 1.0.0. Do NOT bump before that conversation (hard rule from Fabio 2026-06-10).
