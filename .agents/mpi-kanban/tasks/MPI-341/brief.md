# MPI-341 — Pod image build hardening (smoke test + constraints pin)

Source: reviewed `https://github.com/YanWenKun/ComfyUI-Docker` on 2026-07-23. That repo is
docker-compose desktop images with **nothing** about RunPod, proxies, tokens or Pod
lifecycle — but two of its build practices are directly worth stealing. Everything else in
it we either already do better (driver-floor placement via `allowedCudaVersions`, baked
TAESD weights, sha-verified lazy-weight bakes, R2-floated runtime) or deliberately reject
(bundle-copy-to-volume entrypoint conflicts with Design A; union-of-deps `pak` lists are
bloat for our pinned node set).

**Blocked on MPI-340.** Build these to the dev tag. Do not rebuild the released v0.16.0.

## 1. Build-time node-import smoke test (the valuable one)

ComfyUI ships `--quick-test-for-ci`: boot, import every custom node, exit. YanWenKun runs
it in CI before pushing. Our `cubric-vision-pod-image.yml` has **no test step at all**
(verified) — we build, push, and discover breakage on a live Pod.

This is precisely the bug class that already cost us a shipped release. MPI-149:
`routes/downloadManager.js _createDepJob` dropped `pipPins`, so the `kornia==0.8.2` pin
never re-fired, kornia resolved to 0.8.3, which removed the `pad` re-export from
`kornia.geometry.transform.pyramid` — LTXVideo then failed to import, and the only symptom
was a remote gen dying with `Node 'Stage1_Bypass' not found`. The Dockerfile carries a
long comment about this trap ("LTXVideo kornia pin"). An import test catches the entire
class at build.

It also automates a gate we currently run by hand — `MPI-139/plan.md:187` states the
build-verify as *"8 nodes register (esp. LTXVideo) + a clean gen"*, done manually on a
live Pod.

**Implementation — in the Dockerfile, not in CI.** Place it immediately after the
"cu130 torch re-assert AFTER node bake" step:

```dockerfile
# --- node-import smoke test (MPI-341) ---------------------------------------
# ComfyUI's own CI flag: boots, imports every baked custom node, exits non-zero on
# an import failure. Catches the kornia/LTXVideo class of trap (see the kornia pin
# above) at BUILD time instead of as a live `Node 'Stage1_Bypass' not found`.
# --cpu because the GH runner has no GPU.
RUN python /opt/ComfyUI/main.py --quick-test-for-ci --cpu
```

Why in the Dockerfile rather than a CI `docker run` step: a CI test needs
`load: true` on the build to have the image locally before pushing, which doubles image
storage on a runner whose disk **already overflows** (the workflow carries a "Free up
runner disk" step reclaiming 25-30GB, and a comment that the cu128 build hit
`No space left on device`). A `RUN` layer costs nothing extra, fails the build before any
push, and also fires on local builds.

Caveat to check on first run: it only covers image-BAKED nodes. The code-only volume nodes
(MpiNodes, VideoHelperSuite, UltimateSDUpscale, PainterI2V) install at connect and are not
present at build — they stay unverified by this. Note it, do not try to solve it here.

## 2. Constraints file instead of post-hoc assert

YanWenKun generates a constraints file once and passes `-c` to every later pip install:

```dockerfile
RUN pip list --format=freeze \
  | awk -F== 'BEGIN{w["torch"]=1;w["torchvision"]=1;w["torchaudio"]=1} $1 in w{print $1"=="$2}' \
  > /opt/constraints.txt
```

Our MPI-244 guard asserts the cu130 trio is intact *after* the node bake. That catches
drift but only once pip has already done it — the build fails and someone re-diagnoses.
Constraints make the drift **unresolvable at resolve time**: a node whose
`requirements.txt` lists bare `torch` (comfyui_controlnet_aux does exactly this) cannot
pull a non-cu130 wheel in the first place.

Emit the file right after the cu130 trio install, then add `-c /opt/constraints.txt` to the
pip calls inside the node-bake inline Python (both the `installRequirementsCommand` branch
and the default `pip install -r requirements.txt` branch) and to the kornia pin.

**Keep the MPI-244 assert.** It becomes the belt to this suspenders — its Dockerfile
comment already says "never remove". Do not treat constraints as a replacement.

## Not adopted (recorded so it is not re-litigated)

- **Layer-splitting the torch/nvidia wheel install** (their `base-cu130-slim-s1` does a
  `pip install --dry-run`, extracts the `nvidia-*` list and installs cublas alone, cudnn
  alone, then 5-at-a-time — explicitly "so we have more smaller image layers instead of a
  big solid one"). Plausibly cuts cold Pod pull time via registry download parallelism,
  which matters because RunPod exposes NO pull-progress signal (MPI-135: stuck-pull-at-0 is
  undiagnosable). But UNMEASURED — needs one timed A/B on a dev tag before the dry-run
  complexity is worth it. Candidate follow-up for MPI-329's cold-start work, not this card.
- **Cron watcher on upstream ComfyUI releases** (`check-comfyui-release.yml`: every 8h,
  diff the latest tag against a recorded file, commit, dispatch builds). Maps onto the
  `project_comfyui_bump_cadence` memory (bump every 2-4 weeks, currently a manual
  remember-to). For us: **notify only, never auto-rebuild** — we pin deliberately per model
  wave. Worth a separate small card if the manual cadence keeps slipping. Useful gotcha
  from their implementation: bot pushes do not trigger workflows, so they explicitly call
  `createWorkflowDispatch` as a workaround.
- Multi-stage separately-tagged base image (their `base-*-s1`/`s2` split) — would cut our
  ~25min rebuild since torch reinstalls every run, but it is a real restructure of the
  Dockerfile plus a second workflow. Revisit only if rebuild frequency becomes the pain
  again; MPI-156's R2 float already removed the most common reason to rebuild.
- `comfy-kitchen`: already in our stack (ships with ComfyUI core, `==0.2.10`) and recorded
  as a **resolved non-issue** in MPI-131/MPI-139 — "do not re-investigate".

## Verify

- Build to the MPI-340 dev tag; the smoke-test layer must PASS on a clean build.
- Prove it actually bites: temporarily unpin kornia (drop the `kornia==0.8.2` line), rebuild,
  confirm the build FAILS at the smoke-test layer on the LTXVideo import. Restore the pin.
  Without this the test could be silently vacuous.
- Confirm `pip list` in the final image still shows `+cu130` for all three torch packages.
- Connect a dev Pod and run one LTX gen (the node pack the trap targets).

## Files

- `c:/AI/Mpi/mpi-ci/cubric-vision-pod/Dockerfile` (use `git -C`).
- `docs/builder/02-image-and-rebuild.md` — record both practices + the source repo.
