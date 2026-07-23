# MPI-342 Validation

## Phase 1 - Pin edits: DONE, auto-verified 2026-07-23

Four sites moved in one pass:

| File | From | To |
|---|---|---|
| `dev_configs/node_lock.json` core | `v0.27.0` / `bb131be9` | `v0.28.0` / `700821e1364eaab0e8f21c538a2131719fec57bf` |
| `dev_configs/node_lock.json` frontend | `1.45.20` / `0.11.1` | `1.45.21` / `0.11.9` |
| `dev_configs/system_dependencies.json` | `engine.version 0.27.0` | `0.28.0` |
| `mpi-ci/cubric-vision-pod/node_lock.json` | stale copy | fresh copy, byte-identical |
| `mpi-ci/cubric-vision-builder/Dockerfile` | `COMFYUI_REF=eca4757...` (v0.25.1 SHA) | `COMFYUI_REF=v0.28.0` (MPI-183 retarget) |

Checks run: `git diff` shows exactly those sites; `diff` of the two `node_lock.json`
copies = BYTE-IDENTICAL; residual `0.27.0` grep over `dev_configs/ js/ routes/ scripts/`
and both Dockerfiles returns only historical comments, the 1.1.0 release-notes string, and
`torchvision==0.27.0+cu130` (a different package).

## Research settled (2026-07-23) - the pin rule and the two "check first" gates

1. **0.28.0 IS the ceiling.** Latest ComfyUI release is v0.28.0 (2026-07-15); there is no
   0.29. The pin rule's "research the highest floor in the wave" question is closed by
   fiat - nothing can need higher without going to unreleased master.
2. **Core SHA of tag v0.28.0** = `700821e1364eaab0e8f21c538a2131719fec57bf`.
   CI input stays the TAG (`git clone --branch` rejects a bare SHA - MPI-189).
3. **Frontend pins** read from `requirements.txt` at the v0.28.0 tag:
   `comfyui-frontend-package==1.45.21`, `comfyui-workflow-templates==0.11.9`.
4. **Local-engine URL is safe.** The v0.28.0 release ships all four Windows portable
   assets (`nvidia`, `nvidia_cu126`, `amd`, `intel`), so
   `routes/platformEngine.js` `COMFY_BASE` resolves.
5. **`comfyui-krea2edit` does NOT force a bump for 0.28 - but it WILL for 0.29.**
   Our pin `17af8833` = v1.1 (2026-07-09). Upstream v1.2.1 (`dc7940f4`) exists only to
   "tolerate ComfyUI's new `ref_latents` wrapper argument", which ComfyUI core introduced
   in commit `c9602625` dated **2026-07-19 = AFTER the 0.28.0 tag**. So 0.28.0 is clear.
   **Trap for the next core bump:** anything at-or-past `c9602625` (i.e. 0.29+) breaks
   `Krea2EditModelPatch` unless the node is bumped past `dc7940f4` in the same pass.
6. **Grounded node = a node-commit question, confirmed.** `Krea2EditGroundedEncode`
   (with `grounding_px`) exists at krea2edit HEAD; the README recommends v1.2, our pin is
   v1.1. `installRequirements:false` = volume-resident, so wiring it needs NO image.
   Separate card, per brief.md "NOT in this card".
7. **Side finding, fixed here:** the mpi-ci lock copy was stale on
   `ComfyUI-MpiNodes` (`ba9e1569`, from the MPI-293 sync) while the canonical lock had
   `aaa1d2d9` (v1.2.6 box nodes, MPI-309). The fresh copy closes that drift. Harmless at
   runtime (volume-resident node, the app-side lock wins) but it was real desync.

## Still NOT verified (needs a live dev Pod)

Phases 3-5 in `plan.md`: MPI-341's remaining three checks, MPI-340's build-gated dev-tag
leg, and the workflow sweep on 0.28. (Phase 2, the build, is done - see below.)

## Phase 2 - CI dev image build: GREEN (2026-07-23)

Two dispatches. Both tags now exist, are public, and pull-verify (step 5a):

- `docker.io/madponyinteractive/cubric-vision-pod:v0.17.0-dev-cu130` (Docker Hub)
- `ghcr.io/madponyinteractive/cubric-vision-pod:v0.17.0-dev-cpu` (GHCR)

Inputs: `manifest_version=0.17.0-dev`, `comfyui_ref=v0.28.0` (the TAG),
`wrapper_version=0.2.37`, `push_latest=false`.

### Run 1 - 29997521777: cpu GREEN, cu130 FAILED at the node bake

Root cause, and it was NOT the 0.28 bump - it was MPI-341's own new guard:

```
Collecting git+https://github.com/facebookresearch/sam2 (from comfyui-impact-pack/requirements.txt line 10)
  Installing build dependencies: finished with status 'error'
      ERROR: Cannot install torch>=2.5.1 because these package versions have conflicting dependencies.
      The conflict is caused by:
          The user requested torch>=2.5.1
          The user requested (constraint) torch==2.12.0+cu130
      ERROR: ResolutionImpossible
```

`PIP_CONSTRAINT` pins by LOCAL version (`+cu130`), which exists only on the pytorch
index - but the constraint applies to EVERY pip call while `--index-url` was passed to
exactly one. sam2's `pyproject.toml` declares
`build-system.requires = ["setuptools>=61.0", "torch>=2.5.1"]`, so pip builds it in a
PEP-517 ISOLATED build env; that env inherits the constraint but not the index, and PyPI
has no `2.12.0+cu130`. The pin was unsatisfiable, not merely strict.

Fix (mpi-ci `16354e5`): `ENV PIP_EXTRA_INDEX_URL=https://download.pytorch.org/whl/cu130`
beside the constraint. Extra, not primary, so PyPI still serves everything else.
Blast radius: the same env is deliberately live at RUNTIME for the wrapper's connect-time
node installs - any volume node that builds from source would have hit the identical wall
on a live Pod, so `ENV` closes both. `Dockerfile.cpu` bakes no torch and sets no
constraint - no twin to fix.

### Run 2 - 29998306717 (`only_profile=cu130`): GREEN in 19m3s

Build-log evidence:

- `[cubric] torch 2.12.0+cu130 cuda 13.0`
- `[cubric] baked pip-req node packs installed: ['ComfyUI-LTXVideo', 'comfyui-impact-pack',
  'comfyui-kjnodes', 'comfyui-frame-interpolation', 'ComfyUI-Impact-Subpack', 'RES4LYF',
  'comfyui_controlnet_aux']` - impact-pack/sam2 now builds
- `[cubric] kornia 0.8.2 pad OK`
- `[cubric] post-node torch 2.12.0+cu130 torchvision 0.27.0+cu130`
- **`[cubric] node-import smoke test OK`** - MPI-341 check 1 PASSES on a clean dev build,
  on ComfyUI 0.28
- pushed `v0.17.0-dev-cu130@sha256:80351c10b7e7e991b5d5f426cc78041295ea8889335fda22200959ea93c8654c`

## MPI-341 verification status

1. Smoke layer passes on the clean dev build - **DONE** (run 2 log above).
2. Unpin-kornia proof that the gate bites - NOT RUN (needs a deliberate ~19min failing rebuild).
3. `+cu130` trio + `/opt/constraints.txt` in the FINAL image - **DONE 2026-07-23**, checked on
   the pulled image `sha256:80351c10`, not on build logs: constraints.txt holds the three
   `+cu130` lines, `pip list` agrees, `PIP_CONSTRAINT` + `PIP_EXTRA_INDEX_URL` both live in
   the image env, `import torch` -> `2.12.0+cu130 cuda 13.0`, and
   `/opt/ComfyUI/comfyui_version.py` -> `__version__ = "0.28.0"`.
4. One LTX gen on the dev Pod - NOT RUN (live Pod, user).

## Step 5b boot smoke: PASS (2026-07-23)

`ghcr.io/.../cubric-vision-pod:v0.17.0-dev-cpu` ->
`{"ready":true,"comfy_ready":false,"download_mode":true,"wrapper_version":"0.2.37",...}`
and `/wrapper/stats` 401 unauthenticated (route + auth proven). Build "done" definition
steps 1-4 are now satisfied; only the user's live Pod verify (step 5) is left.

## Phase 4 - MPI-340 dev-tag leg: cpu half PROVEN LIVE (2026-07-23)

Code half: `POD_IMAGE_VERSION_DEV` + `POD_IMAGE_VERSION_CPU_DEV` moved `v0.16.0` ->
`v0.17.0-dev` in `routes/remotePodLifecycle.js`. Stable pins untouched.

Live half, cpu (Pod `3ln3y4anycuort`, source run so `_devMode` is true):

- `Status: Downloaded newer image for ghcr.io/.../cubric-vision-pod:v0.17.0-dev-cpu`
  (`sha256:3e1b6add`) - the dev IMAGE tag path resolving a real dev tag for the first time.
- `[cubric-bootstrap] fetching runtime from https://pod.cubric.studio/vision/dev (channel=dev)`,
  manifest `channel: "dev"`, `wrapper_version: "0.2.37"`; `wrapper.py` + `start-cpu.sh` both
  installed from the dev prefix. The dev RUNTIME channel and the dev IMAGE tag are separate
  mechanisms - this boot proved both at once.
- `[cubric] manifest stamped (schema 2, wrapper 0.2.37)` on a PRE-EXISTING volume holding 3
  models: schema 2 == the app's `MANIFEST_SCHEMA_MAX`, and the stamp merges (models[] and
  initialized_at survive via setdefault). Volume reuse across the image bump is safe.
- `[cubric] DOWNLOAD MODE - wrapper only, no ComfyUI (no GPU bill)`,
  `ComfyManager disabled`, `GET /health 200`.

Still open on this leg: the same proof on the GPU tag `v0.17.0-dev-cu130`, and the
released-run-resolves-`v0.16.0` side (NOT build-gated - needs a faked `BUILD_HASH`).

### Loose end closed: the app-side wrapper pin is inert

`[cubric-bootstrap] unset CUBRIC_WRAPPER_VERSION - fetched wrapper self-reports version`.
The bootstrap clears the app's env var on purpose, so the stale
`const WRAPPER_VERSION = '0.2.36'` cannot mislabel an R2-floated boot - the fetched wrapper
reports its own version (0.2.37 in the stamp above). No app-side bump needed.

### GPU half PROVEN (2026-07-23, Pod `5sn0x7l1my2rvz`)

- `Status: Downloaded newer image for madponyinteractive/cubric-vision-pod:v0.17.0-dev-cu130`
- digest `sha256:80351c10b7e7e991b5d5f426cc78041295ea8889335fda22200959ea93c8654c` - the SAME
  digest CI pushed and the same one pull-verified locally. Build -> registry -> RunPod proven
  on one digest, end to end.
- `CUDA Version 13.0.3` (cu130 base), dev runtime channel fetched again, wrapper 0.2.37.

BOTH legs of the dev IMAGE tag path have now resolved a real `-dev` tag. MPI-340's
build-gated branch is closed. Its two NON-build-gated items remain open: the
released-build-resolves-`stable` proof (fake a `BUILD_HASH` stamp) and one real `promote`.

## Checklist item 4 (MPI-340 build-gated leg): DONE

## Phase 5 - workflow sweep on ComfyUI 0.28: PASS (2026-07-23)

All on the `v0.17.0-dev-cu130` Pod (RTX 4090), plus the local 0.28 portable where noted.

| workflow | result |
|---|---|
| LTX 2.3 High i2v_ms | PASS - 3 gens (512x960 cold + warm, 1216x704) |
| Krea2 t2i | PASS - cold 1m02s, warm 8s |
| Krea2 edit | PASS |
| Krea2 **masked edit** | PASS - **no seam**, so MPI-282's acceptance holds on 0.28 |
| Image describer (`qwen3vl_4b`) | PASS - the model 0.28's tokenizer fixes target |
| Head Swap app (qwen-edit + headswap LoRA) | PASS - `appHeadSwap_001` 896x1152, both heads on the correct bodies; box -> `injectionParams` -> `headSwapInjector` wiring intact |
| Krea2 t2i local (4060 Ti, 0.28 portable) | PASS - cold 37s / warm 23s |

**Small gap, stated honestly:** the plain Qwen-Edit operation was not run standalone. The
qwen-edit MODEL and its stack were exercised through Head Swap (same weights, same text
encoder), but `app_head_swap.json` is a different graph from the standard Qwen-Edit
workflow. Wan 2.2 and the remaining library models were not swept either - not installed on
that volume.

No schema drift, no missing nodes, no changed behaviour observed anywhere in the sweep.
