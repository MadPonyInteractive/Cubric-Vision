# MPI-186 — Plan (spike-gated)

> **GATE:** Phase 0 must PASS before any of Phase 1+ runs. If Phase 0 fails, close the card
> `wontfix` and record why in `validation.md`. All Pod shell commands are run by the USER on
> a live Pod — the agent provides exact commands and reads back the output the user pastes.

---

## Phase 0 — SPIKE: prove the compiled deps relocate (live Pod, USER-run)

**Success criterion:** on a real GPU Pod, ComfyUI runs entirely from a `pip --target` volume
dir via `PYTHONPATH`, with `comfy-aimdo` **actually active** (not silently fallen back).

Steps (user runs on a connected GPU Pod, in a Jupyter terminal):
1. `git clone --depth 1 --branch v0.27.0 https://github.com/comfyanonymous/ComfyUI.git /workspace/_spike/ComfyUI`
2. Install deps to a volume target, **excluding torch trio** (they must NOT be re-pulled —
   they'd shadow the image's arch-pinned CUDA torch):
   `grep -viE '^(torch|torchvision|torchaudio)([<>=!~ ]|$)' /workspace/_spike/ComfyUI/requirements.txt > /tmp/reqs.notorch.txt`
   `pip install --no-cache-dir --target /workspace/_spike/pylibs -r /tmp/reqs.notorch.txt`
3. **Import probe from PYTHONPATH only** (the make-or-break test):
   `PYTHONPATH=/workspace/_spike/pylibs python -c "import comfy_aimdo; import comfy_kitchen; print('so-load OK')"`
   - On ImportError, `ldd` the failing `.so` to see the missing lib (RPATH break).
4. **Full boot probe:** launch the volume ComfyUI with the image torch, watch the boot log:
   `CUBRIC_COMFY_MAIN=/workspace/_spike/ComfyUI/main.py PYTHONPATH=/workspace/_spike/pylibs python /workspace/_spike/ComfyUI/main.py --cpu-... ` (use the same launch args start.sh exports; run against the real GPU, not --cpu).
   - **PASS signal:** boot log shows `aimdo inited for GPU` / `DynamicVRAM support detected and enabled`.
   - **FAIL signal:** `DynamicVRAM support requires Pytorch ... Falling back to legacy ModelPatcher`, or aimdo/kitchen absent → the relocation broke the plugin. → ABANDON.
5. **One real gen** through this volume ComfyUI (LTX-2.3 or any video op) to confirm no OOM /
   no missing-node / no wrong-torch. Compare load time to a baked-image baseline gen.

**Verify:** boot log confirms aimdo active AND a gen completes clean AND torch is the image's
pinned CUDA build (`PYTHONPATH=... python -c "import torch;print(torch.__version__)"` shows
`+cu126`/`+cu128`, NOT a CPU or newer wheel). Record all three in `validation.md`.

> If Phase 0 fails → STOP. Close wontfix. The baked image stays as-is.

---

## Phase 1 — start.sh: volume-install flow (behind the version sentinel)

Edit `c:\AI\Mpi\mpi-ci\cubric-vision-pod\start.sh`. Insert BEFORE the
`export CUBRIC_COMFY_MAIN=/opt/ComfyUI/main.py` line (~209):

- Define `VOLUME_COMFY_DIR="$CUBRIC_ROOT/cubric/comfyui"`,
  `VOLUME_COMFY_PYLIBS="$CUBRIC_ROOT/cubric/comfyui_deps"` (DISTINCT from the sage
  `pylibs/` to keep PYTHONPATH order clean), and a sentinel
  `$VOLUME_COMFY_DIR/.installed_ref`.
- **Ephemeral guard:** if `CUBRIC_EPHEMERAL=1`, SKIP the volume install and keep the baked
  `/opt/ComfyUI` — no volume to persist to, so re-installing every boot is pure waste.
- Sentinel compare: `[ "$(cat $SENTINEL 2>/dev/null)" = "$CUBRIC_COMFYUI_REF" ]` → skip;
  else install.
- Install fn: `rm -rf "$VOLUME_COMFY_DIR.tmp"` first (clean any interrupted attempt) →
  shallow clone the pinned ref → `pip install --target "$VOLUME_COMFY_PYLIBS"` with the
  **torch trio excluded** (Phase 0's grep filter) → atomic `mv .tmp → final` →
  write sentinel LAST (so an interrupted install never leaves a false-positive sentinel).
- On clone/pip failure: fall back to baked `/opt/ComfyUI` + loud log line, do NOT `exit 1`
  into a RunPod crash-loop.
- Export `CUBRIC_COMFY_MAIN="$VOLUME_COMFY_DIR/main.py"` and
  `PYTHONPATH="$VOLUME_COMFY_PYLIBS${PYTHONPATH:+:$PYTHONPATH}"` (only when the volume
  install is the active path).

**Verify (user, live):** fresh volume → boot logs the install once (~3.5-5.5 min) + a gen
works; recreate Pod on the same volume → boot logs "already on volume — skip" in <1s + a gen
works.

---

## Phase 2 — extra_model_paths.yaml: keep baked universal nodes loading

In the `start.sh` heredoc that writes `$EXTRA_PATHS_YAML` (~line 52), add a stanza so the 7
baked packs in `/opt/ComfyUI/custom_nodes` still load once `main.py` runs from the volume
(ComfyUI otherwise resolves `custom_nodes/` relative to `main.py` → the baked packs orphan
silently → every gen fails "Node not found"):

```yaml
cubric_baked_nodes:
  base_path: /opt/ComfyUI
  custom_nodes: custom_nodes/
```

**Verify (user, live):** boot log lists the baked packs (MpiNodes, VHS, LTXVideo, GGUF,
Impact-Pack/Subpack, KJNodes, Frame-Interpolation, UltimateSDUpscale) as loaded; run an LTX
gen (uses MpiNodes + LTXVideo) and a video gen (uses VHS) — both must succeed.

---

## Phase 3 — Dockerfile: remove the baked ComfyUI layers

Only after Phases 1-2 are live-proven via the R2-fetched start.sh (no rebuild needed to test
them). Edit `c:\AI\Mpi\mpi-ci\cubric-vision-pod\Dockerfile`:

- Remove the ComfyUI clone + `pip install -r requirements.txt` layer (~line 76-78). Keep the
  torch trio pin, the sage build, the node-lock baked packs, weights, taesd — all unchanged.
- The image no longer ships `/opt/ComfyUI/main.py`. Decide the fallback: either keep a
  minimal baked ComfyUI for the ephemeral/failure path (safer, ~keeps some size) OR accept
  volume-only (smaller, but a first-boot clone failure has no fallback). **Recommend keep a
  baked fallback** given the ephemeral + network-failure modes — the win is the *deps* layer
  leaving, and the clone is small; the ~5GB is the pip deps, which DO leave.
  - i.e. keep the shallow clone (small), drop only the `pip install -r requirements.txt`
    (the 5GB). Reconsider based on Phase 0/1 measured sizes.

**Verify:** rebuild via the `build-pod-image` skill (Flow A / product Pod), measure the new
image size vs current, anon-pull-verify the tags, then a fresh-volume + warm-volume live gen.

---

## Phase 4 — docs + version bumps

- Bump `POD_IMAGE_VERSION` in `routes/remotePodLifecycle.js` (needs app restart to take).
- Update `docs/runpod-remote-engine.md` §6 (image/volume split now includes ComfyUI deps on
  the volume) + `docs/builder/02-image-and-rebuild.md` (what's baked vs volume).
- The `CUBRIC_PYLIBS` doc drift (§6 says sage installs to volume; Dockerfile bakes it) —
  note it while here, don't fix it in this card.

**Verify:** `docs` reflect reality; a cold read of §6 predicts the actual boot behaviour.

---

## Open questions to resolve during Phase 0/1 (don't guess)

1. Does `pip --target` re-download deps the image already has? (Investigation says yes —
   `--target` bypasses site-packages.) → confirms the 5GB genuinely moves, doesn't dedup away.
2. Upgrade path: does re-running `pip --target` over an existing dir leave stale `.dist-info`
   that breaks `importlib.metadata.version()` (transformers probes it)? → on a version bump,
   `rm -rf "$VOLUME_COMFY_PYLIBS"` before re-install (clean slate) rather than upgrade-in-place.
3. Measured first-boot install time on a real Pod NIC (investigation estimate 3.5-5.5 min).
