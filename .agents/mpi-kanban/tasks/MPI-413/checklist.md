# MPI-413 Checklist

- [x] Phase 2a — curated input + generated lock
- [x] Phase 2b — generator + drift check
- [x] Phase 2c — consumer (one-pass install, per-node steps disabled)
- [x] Phase 2d — anti-drift docs (playbook + rule)
- [x] Phase 2 real-engine verification on the Linux box (2026-08-04) — 1 pip pass,
      0 triton/nvidia, torch untouched at +cpu, 47 already-satisfied, marker idempotent
- [x] Phase 1 residual — CLOSED AS SUPERSEDED (`--no-deps` makes a local PIP_CONSTRAINT
      structurally unable to matter; see plan.md § Phase 1 disposition)
- [x] Pod convergence — code written (Dockerfile + wrapper.py + build-context copy + docs)
- [ ] Pod convergence — SHIP IT to **dev only**. **Every step is a user-authorized live op
      — ask before each.** `promote` is NOT here: it is a release gate (plan.md § Plan
      drift, 2026-08-04).
  - [x] `./publish-runtime.sh dev` in `c:/AI/Mpi/mpi-ci/cubric-vision-pod` — **DONE
        2026-08-04**, both halves now live on dev. Verified by BYTES three ways: dev
        manifest `start_sha256`, the fetched `dev/start.sh` body and the working tree all
        hash to `7ff17c62…`. `stable` untouched (wrapper `0.2.40`, start `0b716774…`)
  - [x] `build-pod-image` → **v0.19.0-dev, run 30910192827, BOTH legs green** (cu130 →
        Docker Hub, cpu → GHCR), both pull-verified public (cu130 config sha `51cb77e8`,
        cpu `1b666059`). The MPI-341 grep — the one card metric no box could measure —
        came back **`[cubric] node-import smoke test OK`, zero `IMPORT FAILED`**: the
        curated set is NOT under-specified. Same log: exactly **ONE** opencv distribution
        (`opencv-contrib-python-headless 5.0.0.93`) where three used to fight over `cv2`,
        `[cubric] cv2 5.0.0 ximgproc True`, and `post-node torch 2.12.0+cu130` — the
        `--no-deps` pass dragged in no torch/triton/CUDA wheels
  - [x] cpu boot smoke (done-definition step 4) — `/health` 200 with
        `wrapper_version 0.2.41`, `/wrapper/stats` 401 unauthenticated. Its bootstrap log
        independently re-proved the dev channel: fetched `manifest start_sha256 7ff17c62…`,
        then `unset CUBRIC_WRAPPER_VERSION — fetched wrapper self-reports`
  - [x] Recreate the Pod from the **Windows dev app** — Pod `vhks7b6fl1x57h` (L4, EU-RO-1,
        volume `9t3awufudk`), image line in app.log reads
        `cubric-vision-pod:v0.19.0-dev-cu130`, `wrapperVersion 0.2.41`, reached comfyReady.
        **The wrapper's pip-less `_run_node_install` finally RAN** (it never had): MPI-438's
        ensure installed VideoHelperSuite through it with no pip step, and all 40 `VHS_*`
        classes imported after the restart — i.e. the curated image really does already
        carry VHS's Python deps, which is this card's whole premise
  - [x] Bump `WRAPPER_VERSION` `0.2.36` → `0.2.41` and `POD_IMAGE_VERSION_DEV` /
        `POD_IMAGE_VERSION_CPU_DEV` → `v0.19.0-dev` in `routes/remotePodLifecycle.js`;
        app restarted and PROVEN to have re-read them (listener PID 9188 → 1408, child
        StartTime 14:03:34 > file mtime 14:01:03). Stable pair untouched at `v0.17.0`.
        The wrapper pin is only the baked-fallback label — nothing compares it, and
        `bootstrap.sh` unsets it on a successful fetch
  - [x] **start.sh guard — PROVEN BY EFFECT, which beats the log line.** The first boot did
        NOT exercise it: VHS is the only code-only pack shipping a `requirements.txt` and it
        was not on the volume at boot, so the loop was a no-op either way. Pod was stopped +
        restarted with VHS now resident (fresh container proven: ComfyUI history 0 entries,
        VRAM back to 203MB) — the decisive run.
        The literal boot line was **NOT retrievable**: the app has no route to the Pod's
        container log, and the RunPod console only retained from ComfyUI's boot onward, so
        a console search for `volume node deps` returned "No logs found". That is a
        retention artifact, NOT a negative — do not read it as the guard failing.
        The guard was instead proven by its EFFECT, deductively:
        1. VHS's `requirements.txt` at pinned commit `4ee72c06` is exactly two lines —
           `opencv-python` and `imageio-ffmpeg` (fetched from the repo at that commit).
        2. VHS is resident on the volume (Pod log imports it from
           `/workspace/comfyui/custom_nodes/comfyui-videohelpersuite`).
        3. Had the boot loop run, `pip install -r` would have installed both.
        4. The Pod log reads `[VideoHelperSuite] - WARNING - Failed to import
           imageio_ffmpeg` → it is ABSENT → the loop did not run → the guard skipped it.
        5. **Same file, same conclusion for `opencv-python`: never installed. So the
           curated `opencv-contrib-python-headless` is STILL the only cv2 on the Pod** —
           this is the runtime one-cv2 proof, and it is stronger than the boot line, which
           would only have announced the skip rather than demonstrated its effect.
        Corroborating, from the same boot: `[Impact Pack] SAM2 ... not installed` (the
        curated set deliberately drops `sam2`), `ComfyUI version: 0.29.2` (matches the
        `node_lock` tag the build was given), and registration unchanged at 1863 node
        types / 40 `VHS_*` / 8 `controlnet_aux` — nothing broke.
- [ ] DEFERRED TO THE NEXT RELEASE (not this card): `./publish-runtime.sh promote` + the
      stable `POD_IMAGE_VERSION` bump. `mpi-release`'s manifest-drift precondition is the
      backstop
- [ ] After the Pod ships — delete the now-dead local set together: `requirementsDrop` +
      `_filterRequirements` (routes/downloadManager.js), their `nodesDeps.js` entries,
      `tests/requirements-filter.test.cjs`, and the `install_command` / `pip_pins`
      passthrough at `routes/remoteModels.js:412-417`
