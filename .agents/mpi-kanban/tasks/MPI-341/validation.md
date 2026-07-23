# MPI-341 — validation

## Verified (2026-07-23)

- **`--quick-test-for-ci` exit-code semantics** — read upstream `main.py` at BOTH `v0.27.0`
  (our current `node_lock` core pin) and `v0.28.0` (the MPI-342 target): `if
  args.quick_test_for_ci: exit(0)`, unconditional. `nodes.init_extra_nodes` only LOGS
  `IMPORT FAILED: <dir>` for custom nodes. => the grep in the Dockerfile layer is the actual
  gate; the brief's bare `RUN` would have been vacuously green.
- **`PIP_CONSTRAINT` mechanics** — local pip: `list` and `uninstall` ignore it (exit 0, no
  error), and a constrained resolve really is forced (`certifi==0.0.1` in the file →
  `Collecting certifi / Using cached certifi-0.0.1.tar.gz`, not latest).
- Dockerfile parses as intended by inspection only — **no build has been run**.

## The build happened (2026-07-23, MPI-342 dev tag) — and the constraint had a real bug

`v0.17.0-dev-cu130` built green on ComfyUI 0.28 (mpi-ci run 29998306717, 19m3s), but only
on the SECOND dispatch. The first (29997521777) died at the node bake, and the cause was
this card's own new guard:

```
Collecting git+https://github.com/facebookresearch/sam2 (from comfyui-impact-pack/requirements.txt line 10)
      ERROR: Cannot install torch>=2.5.1 because these package versions have conflicting dependencies.
          The user requested torch>=2.5.1
          The user requested (constraint) torch==2.12.0+cu130
      ERROR: ResolutionImpossible
```

`PIP_CONSTRAINT` pins by LOCAL version (`+cu130`), which exists ONLY on the pytorch index —
but the constraint reaches EVERY pip call while `--index-url` was passed to exactly one.
sam2's `pyproject.toml` has `build-system.requires = ["setuptools>=61.0", "torch>=2.5.1"]`,
so pip builds it in a PEP-517 **isolated build env**; that env inherits the constraint but
not the index. The pin was unsatisfiable, not merely strict.

Fixed in mpi-ci `16354e5`: `ENV PIP_EXTRA_INDEX_URL=https://download.pytorch.org/whl/cu130`
beside the constraint. Extra, not primary. It is an `ENV` so it also covers RUNTIME — the
wrapper's connect-time node installs would have hit the identical wall on any node that
builds from source, which is a live-Pod failure this build caught first.

Lesson for the card: a constraint that names a wheel most pip invocations cannot reach is
broken by construction, not strict. Keep the extra index pinned next to the constraint.

## Outstanding (needs the dev-tag build — rides with MPI-342)

1. ~~Build to the MPI-340 **dev** tag; the smoke-test layer must PASS on a clean build.~~
   **DONE** — `[cubric] node-import smoke test OK` in run 29998306717, on ComfyUI 0.28,
   with all 7 baked pip-req packs installed. Released `v0.16.0` untouched.
2. ~~**Prove the smoke test bites**: temporarily drop the `kornia==0.8.2` pin, rebuild,
   confirm the build FAILS at the smoke-test layer on the LTXVideo import. Restore the pin.~~
   **DONE 2026-07-23 — the gate BITES.** Proof run `30028617382` on throwaway branch
   `mpi-341-kornia-proof` (`manifest_version=0.17.1-dev`, `only_profile=cu130`).

   Method correction (handoff step was wrong): the pin and its `python -c "from
   kornia.geometry.transform.pyramid import pad"` self-check share ONE `RUN`, so
   unpinning alone would have failed at that layer, ~20 layers early, proving nothing.
   The WHOLE kornia `RUN` was disabled instead, so the node-req install's unpinned
   kornia (0.8.3) reached the smoke layer.

   Log evidence (`gh run view 30028617382 --log-failed`):
   - `Downloading kornia-0.8.3-py3-none-any.whl` → `Successfully installed ... kornia-0.8.3`
     (unpinned latest resolved, as designed)
   - LTXVideo requirements: `Requirement already satisfied: kornia ... (0.8.3)` (no re-pin)
   - **step `[11/22]` (the smoke layer) went RED:**
     `77: [INFO]  0.4 seconds (IMPORT FAILED): /opt/ComfyUI/custom_nodes/ComfyUI-LTXVideo`
     → `[cubric] a baked custom node failed to IMPORT — build stops here` → `exit code: 1`
   - cpu leg GREEN (Dockerfile.cpu bakes no nodes → nothing to import → smoke layer trivially
     passes; only the cu130 image exercises this gate, as the handoff predicted).

   A green build here would have meant the gate is vacuous and is itself the bug. It went red
   at exactly the right layer naming exactly the right node. Branch pushed only to origin for
   the CI run, then deleted local + remote; **never merged**. `main` never carried the broken
   pin. Throwaway `0.17.1-dev` tag was never pushed (the build died before the push step), so
   the proven `v0.17.0-dev` tags are untouched.
3. ~~**Prove the constraints bite** (cheap, same build)~~ **DONE 2026-07-23** - verified on
   the pulled FINAL image `v0.17.0-dev-cu130` (digest `sha256:80351c10`), not on build logs:
   - `pip list` -> `torch==2.12.0+cu130`, `torchaudio==2.11.0+cu130`, `torchvision==0.27.0+cu130`
   - `/opt/constraints.txt` holds exactly those three lines
   - `PIP_CONSTRAINT=/opt/constraints.txt` and
     `PIP_EXTRA_INDEX_URL=https://download.pytorch.org/whl/cu130` both set in the image env
     (so the runtime guard is live for the wrapper's connect-time installs)
   - `import torch` -> `2.12.0+cu130 cuda 13.0`
   - bonus: `/opt/ComfyUI/comfyui_version.py` -> `__version__ = "0.28.0"` (MPI-342 core bump
     proven baked)
4. ~~Connect a dev Pod and run one LTX gen (the node pack the trap targets).~~ **DONE
   2026-07-23** - LTX 2.3 High i2v_ms on the `v0.17.0-dev-cu130` Pod (RTX 4090, ComfyUI
   0.28): `Prompt executed in 159.93 seconds`, `MpiVideo_00001.mp4` served, gallery card
   `i2v_ms_001 512x960 2m 40s`. The pack the kornia trap kills imports AND generates.

## Known coverage gap (do not try to solve here)

The smoke test only covers IMAGE-BAKED nodes. Code-only volume nodes (MpiNodes,
VideoHelperSuite, UltimateSDUpscale, PainterI2Vadvanced) install at connect and do not exist
at build time — unverified by this layer.
