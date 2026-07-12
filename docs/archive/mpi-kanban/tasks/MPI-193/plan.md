# MPI-193 Plan — quarantine volume copies of image-baked node packs at Pod boot

## Goal
A volume Pod must load every custom node pack exactly ONCE, from the image-baked,
version-locked copy. Volume-only packs (per-model nodes, ComfyUI-GGUF) keep working.

## Why (evidence, 2026-07-05 live session — full trail in docs/builder/research/pod-perf-investigation.md)
- ComfyUI import-times log showed 4 packs loaded twice: `comfyui-videohelpersuite`,
  `comfyui-kjnodes`, `ComfyUI-MpiNodes`, `ComfyUI-LTXVideo` from BOTH
  `/opt/ComfyUI/custom_nodes` (baked) and `/workspace/comfyui/custom_nodes` (volume).
  The volume VHS dir was `ComfyUI-VideoHelperSuite-4ee72c065db2...` (sha-suffixed name).
- Volume copies import LAST → their node registrations OVERRIDE the baked, node_lock.json-pinned
  versions (MPI-117). That is silent version drift on LTX-critical packs.
- ComfyUI's frontend threw a blocking "Duplicate VHS install detected" error dialog.
- Live-proven NOT the MPI-191 perf tax (removing dups left the 36s gap; that was volume read
  bandwidth) — this card is a CORRECTNESS/hygiene fix, not the perf fix.
- The dup copies are leftovers from pre-baking-era images that installed packs to the volume at
  boot. Volumes persist across image upgrades; every existing user volume is presumed dirty.

## Constraints (do not violate)
1. **Do NOT remove the volume custom_nodes scan** (`custom_nodes /workspace/comfyui/custom_nodes`
   line in the extra_model_paths.yaml that start.sh writes). It is load-bearing:
   per-model packs (e.g. ComfyUI-PainterI2Vadvanced) install there so adding a model never
   forces an image rebuild (Dockerfile comment ~line 153), and ComfyUI-GGUF lives ONLY there
   (hard import-dep of KJNodes GGUFLoaderKJ — handoff 60c42614; MPI-190 deferred its removal).
2. Baked copy WINS on conflict. Never quarantine a volume pack with no baked twin.
3. Never DELETE user volume data — quarantine by rename (reversible), don't rm.
4. Must be idempotent (runs every boot) and self-healing for all existing dirty volumes.
5. Ephemeral pods root nodes at `$CUBRIC_ROOT` (`CUBRIC_EPHEMERAL=1` → `/cubric-data`, MPI-78) —
   resolve the volume nodes dir from the SAME variable start.sh already uses to write the yaml,
   not a hardcoded /workspace path.
6. **HARD PREREQ (live-proven 2026-07-05, accidental):** the app/wrapper node-STATUS/install flow
   must treat an image-BAKED pack as "installed" even when absent from the volume. When the
   MPI-191 test left VHS/KJ/Mpi/LTXV parked off the volume, a fresh 5090 pod WEDGED a Wan 5B gen
   (4min "GENERATING", VRAM 1.9/32 — nothing loaded; suspected mid-boot reinstall race, see
   memory project_comfy_node_install_boot_race). Find that flow (grep wrapper.py + routes/ for
   node status/install), make it baked-aware FIRST — otherwise every quarantined volume
   reproduces this wedge. Verification MUST include a Wan (VHS-using) gen on a deduped volume.

## Implementation (all in mpi-ci repo: c:\AI\Mpi\mpi-ci\cubric-vision-pod\start.sh — use `git -C`)
1. In start.sh, AFTER the data-root/yaml variables are resolved and BEFORE the
   "volume node deps: pip install" loop, add a dedupe pass:
   - Canonicalize dir names on both sides: lowercase, strip a trailing `-<40-hex>` git-sha
     suffix, strip `-_.` separators. (Must match: `ComfyUI-VideoHelperSuite-4ee72c06…` ↔
     `comfyui-videohelpersuite`; `ComfyUI-MpiNodes` ↔ same; case-insensitive.)
   - Build the baked set from `/opt/ComfyUI/custom_nodes/*/`.
   - For each dir in the volume custom_nodes root: skip if already `*.disabled*`; if its
     canonical name is in the baked set → `mv "$d" "${d}.disabled-mpi193"`.
   - ComfyUI skips dirs whose name ends with `.disabled` — VERIFY the suffix check in the
     engine source first (grep `.disabled` in engine/ComfyUI_windows_portable/ComfyUI/nodes.py);
     if it requires the name to END in `.disabled` exactly, use `${d}.mpi193.disabled` instead.
   - Log one `[cubric] node-dedupe:` line per quarantined dir + a summary count.
2. Make the existing "volume node deps pip install" loop in start.sh skip `*.disabled*` dirs
   (don't pip-install quarantined packs).
3. Check the CURRENT node-install path (app → wrapper `/wrapper/...` node install; grep wrapper.py
   and routes/ for the install flow) and confirm it refuses/skips installing a pack whose
   canonical name is baked — if it doesn't, add the same canonical check there so dups can't
   come back. (The known dups are legacy-era leftovers; this step is belt-and-braces.)
4. Ship: `bash -n start.sh`, then `./publish-runtime.sh stable` from
   `c:\AI\Mpi\mpi-ci\cubric-vision-pod\` (R2 runtime fetch, MPI-156 — NO image rebuild).
   On Windows run it through Git Bash (plain `bash` resolves to a distro-less WSL and fails
   with `execvpe(/bin/bash) failed`); pass `RCLONE=<winget rclone.exe path>` if not on PATH
   (see the resolver inside publish-runtime.sh). The script's final curl-verify loop can exit
   nonzero in a sandboxed/offline shell even when uploads succeeded — confirm by re-fetching
   `https://pod.cubric.studio/vision/stable/start.sh` and grepping for the dedupe marker.
5. Commit both repos by explicit pathspec (never `git add .`): mpi-ci start.sh (+wrapper.py if
   step 3 touched it); Cubric-Vision docs/kanban files.

## Verification (live Pod = USER-gated; prepare everything, then hand the run to the user)
- Fresh volume Pod boot log MUST show: the `[cubric] node-dedupe:` lines (first boot on a dirty
  volume), NO "Duplicate VHS install detected" dialog in the web UI, and the import-times list
  with each of VHS/KJNodes/MpiNodes/LTXVideo appearing EXACTLY once, from `/opt/...`.
- ComfyUI-GGUF still imports (KJNodes loads clean), PainterI2Vadvanced (or any per-model pack
  on the volume) still imports.
- Second boot: dedupe pass logs zero moves (idempotent).
- An LTX gen completes end-to-end (nodes functional, not just imported).
- The MPI-192 debug door (`.expose-comfy` marker in Cubric-Vision root + 8188 port) is the
  fastest way to eyeball the web UI/dialog — delete the marker file when validation is done.

## Verify mode
user-ux (live Pod boots + a paid gen are user-run; agent prepares and self-checks everything
offline first: bash -n, canonicalization unit-test via a scratch script with the 4 real dir
names, publish + R2 re-fetch grep).

## Out of scope
- The MPI-191 perf fix (weights volume→disk hot-store) — separate card, separate design.
- Removing ComfyUI-GGUF / the deferred MPI-190 dep-entry cleanup.
- Any image rebuild.
