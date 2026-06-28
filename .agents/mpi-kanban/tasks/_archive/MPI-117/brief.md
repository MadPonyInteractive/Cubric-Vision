# MPI-117 Brief

## Goal

Make the ComfyUI environment **fully reproducible and identical** across both
install paths — **local app engine AND RunPod Pod image (CI)**. Three things
must be version-locked, all consumed by both paths:

1. **ComfyUI core (backend).** App already pins `v0.19.3`; the Pod floats
   (`master`). Pin the Pod to the same core.
2. **ComfyUI frontend.** Frontend (`comfyui-frontend-package`) versions
   INDEPENDENTLY of core (separate PyPI package). The app currently inherits
   whatever frontend ships inside the portable `.7z`; the Pod inherits whatever
   its core clone pulls. Lock the frontend version explicitly on both — do not
   assume "pinning core pins the frontend." Confirm what frontend `v0.19.3`'s
   portable actually ships and pin the Pod to match.
3. **Custom nodes.** Neither side pins today (both float). Lock a commit per pack
   and have both paths consume it.

Success = a workflow behaves identically on a local install and on a Pod because
core + frontend + every node are the same versions in both.

## Branch constraint (HARD)

**Land this on the `RunPod` branch ONLY — NOT `master`.** The RunPod branch is
the v1.1.0 shared trunk (see memory `project_runpod_branch_v110`). Do not push
any of these changes to the shipped `master` line. Even the app-side node-pin
edits (`dependencies.js`) go on the RunPod branch, not master.

## Problem

The shipped app and the RunPod **product Pod image** run **different ComfyUI
versions and different custom-node commits**. The whole point of the CI image is
to mirror the app environment exactly (custom nodes drift heavily between
commits); right now it does not. This must be fixed **before** the RunPod build
is released.

### Evidence (verified 2026-06-19)

**App (master / shipped) — core PINNED, custom nodes NOT PINNED:**
- Core: `dev_configs/system_dependencies.json` → `engine.version: "0.19.3"`.
  `routes/platformEngine.js:19-20` builds the URL from that:
  `https://github.com/Comfy-Org/ComfyUI/releases/download/v0.19.3/...` (Windows
  prebuilt portable `.7z`; Linux/macOS via comfy-cli). Stamped to
  `.mpi_engine_version`, version-checked in `routes/engine.js`. Hard pin.
  ComfyUI **core = v0.19.3**. Frontend = whatever ships inside that portable.
- **Custom nodes: NOT pinned (verified 2026-06-19).** Every entry in
  `js/data/modelConstants/dependencies.js` (lines 144-217) downloads a **branch
  zip**: `.../archive/refs/heads/main.zip` (Impact-Pack: `Main.zip`). A branch
  zip = that branch's HEAD **at install time** — no commit, no tag. The 7 packs:
  MpiNodes, PainterI2Vadvanced, VideoHelperSuite, Impact-Pack, KJNodes,
  UltimateSDUpscale, Frame-Interpolation, Impact-Subpack.
- **Consequence — app-vs-app drift:** two users installing days apart can get
  DIFFERENT node versions. The app has NO fixed node version for the Pod to
  "match." So pinning the Pod is not enough; the app must pin node commits too,
  and both sides pin to the SAME commit set. Core (v0.19.3) is the only
  reproducible piece today.

**Product Pod image (`mpi-ci/cubric-vision-pod/Dockerfile`) — FLOATS:**
- Line 63: `ARG COMFYUI_REF=master` → core cloned from **master HEAD at build
  time**, not v0.19.3. Builds were triggered with `comfyui_ref=master`
  (see memory `project_mpi_ci_pod_build_procedure`).
- Lines 112-118: all 7 custom-node packs `git clone --depth 1` of their default
  branch — **no commit pins**. Dockerfile comment claims "pinned to the same
  branch the app downloads," but `--depth 1` of a branch = that day's HEAD, NOT a
  reproducible commit. Each rebuild can grab different node commits than the app.

### Why it matters
- A workflow authored/validated against the Pod's newer ComfyUI may use node
  params/behaviour absent in the app's v0.19.3 → breaks for the user.
- Node drift is the bigger risk than core: KJNodes / VHS / Impact change params
  frequently.
- The provenance manifest machinery (MPI-90: wrapper stamps `comfyui_ref`, app
  gates first gen on schema-version) was built anticipating this drift — but the
  `master` default defeats it.

## Answer to "do we have to rebuild?"
**Yes.** ComfyUI core + custom nodes are baked into the image at **build time**
(`git clone` in the Dockerfile). The version is a build-arg, not runtime config —
there is no way to re-pin a running Pod. Re-pin → rebuild → repush → make GHCR
package public → bump the RunPod template image tag.

## Scope of the fix
1. **Core (backend):** change `COMFYUI_REF` default `master` → the **v0.19.3 tag
   commit** (confirm `v0.19.3` is a clonable tag on `comfyanonymous/ComfyUI`; the
   app pulls the Comfy-Org *portable* release `v0.19.3` — verify the core repo tag
   that portable was cut from, so the Pod core == app core, not just same label).
1b. **Frontend:** identify the `comfyui-frontend-package` version inside the app's
   v0.19.3 portable, and pin the Pod to that exact frontend (the Pod installs
   frontend via core's requirements — verify it resolves to the same version, pin
   explicitly if not). Frontend drift = different node UIs / widget behaviour.
2. **Custom nodes — pin BOTH sides (app AND image) to one commit set.**
   Confirmed: NEITHER side pins today (app = branch zips in
   `dependencies.js:144-217`; image = `--depth 1 <branch>`). So:
   - **App:** change each `dependencies.js` url from
     `.../archive/refs/heads/<branch>.zip` to a **commit-pinned** form
     (`.../archive/<sha>.zip`) for all 7 packs. Decide the canonical commit per
     pack (current HEAD at the time of this fix is the natural choice — freeze it).
   - **Image:** replace each `--depth 1 <branch>` clone with `git checkout <sha>`
     using the **same** commits chosen for the app.
   - App is the source of truth; both must resolve to identical commits.
   - NOTE: PainterI2Vadvanced is in the app's `dependencies.js` (line 156) but the
     Pod Dockerfile bakes a different 7th pack — reconcile the node SET too, not
     just versions.
3. **Rebuild** both CUDA profiles (cu124 CI + cu128 local) per
   `mpi-ci/cubric-vision-pod/README.md`; bump image version; make GHCR public;
   update the RunPod template + app `POD_IMAGE` (`routes/remoteProxy.js`).
4. **Verify parity:** author a known workflow, run it on a Pod and in the app,
   confirm identical node availability + output.

## Node version-lock system (design — decide before implementing)

Hardcoding a `<sha>` per node in two places (`dependencies.js` + Dockerfile) is
the minimum, but it splits the source of truth and drifts again on the next bump.
A small lock system keeps both paths honest. Options, cheapest first:

- **A — single shared lock file (recommended starting point).** One JSON, e.g.
  `dev_configs/node_lock.json`: `{ "<node-id>": { "repo", "commit" } }` for all 7
  packs. App reads it to build the `dependencies.js` urls
  (`.../archive/<commit>.zip`); the Pod build reads the same file (build-arg or
  COPY) and `git checkout <commit>`. One edit point, both paths consume it.
  Add a `SCHEMA`/`NODESET_VERSION` field so a manifest can assert it (ties into
  MPI-90 provenance manifest the wrapper already stamps).
- **B — derive Pod from app.** Pod build pulls `dependencies.js` / the lock file
  from the app repo at build time so it physically cannot diverge. More plumbing
  (cross-repo fetch in CI), strongest guarantee.
- **C — verify-only gate.** Keep two lists but add a CI/preflight check that
  fails if app node commits != image node commits. Cheapest to add, does not stop
  drift, only catches it.

Decision needed: A vs B vs C (A is the lazy correct default). Also decide whether
the lock covers ONLY the 7 baked packs or also workflow-specific nodes installed
per-Pod (LTXVideo, BFS, etc. — those are currently `--depth 1` latest in the
install scripts; same drift class, may want the same lock).

## Build command needs revising (`.claude/commands/build-pod-image.md`)

The existing `/build-pod-image` command (and `build-pod-image` skill) takes
`<ref>` as a **hand-typed ComfyUI SHA** the human supplies, and has NO concept of
a frontend pin or a node lock. Once the lock system (above) exists, this command
must be revised to **consume the lock** instead of asking for a SHA:
- read core + frontend + node commits from the lock file (option A) and pass them
  as build-args automatically;
- stop prompting the human to "confirm the SHA" — derive it from the lock;
- carry frontend + node pins into BOTH the product Pod and (later) Builder flows.
Treat the command revision as part of this card's deliverable, not an afterthought
— otherwise the next rebuild silently re-floats.

## Rebuild handoff

The code/config changes here (lock files, `dependencies.js` pins, Dockerfile
pins) do NOT themselves produce a new image — they REQUIRE an image rebuild to
take effect (core/nodes are baked at build time). After this card's edits are
committed on the RunPod branch, the image rebuild is a **separate step**: the user
will either spin a parallel session or ask the implementing agent to run
`/build-pod-image` (product Pod). Sequence: land lock + command revision FIRST,
then rebuild so the new command/lock is what drives the build.

## Follow-up (next card)

A ComfyUI **version bump** follows this card: **MPI-118** bumps the app from
v0.19.3 to 0.25.0 (SHA `5ef0092`, frontend 1.45.15) to match the Builder + local
rig. Do NOT bump the version inside MPI-117 — MPI-117 only builds the lock
mechanism + fixes the Pod's floating drift. Design the lock so MPI-118 can move
the version by editing the lock file, nothing else. Build it bump-ready.

## Out of scope (separate, later)
- The **Builder image** (`cubric-vision-builder`, core 0.25.0) parity — the user
  will address that separately. Note: the Builder/product README "use the same
  SHA" parity contract should be reconciled to whatever core the app lands on.

## Files
- `mpi-ci/cubric-vision-pod/Dockerfile` (lines 63, 112-118, 122-125)
- `mpi-ci/cubric-vision-pod/README.md` (build args)
- `mpi-ci/.github/workflows/cubric-vision-pod-image.yml` (dispatch defaults)
- App side (reference only): `dev_configs/system_dependencies.json`,
  `routes/platformEngine.js`, `js/data/modelRegistry.js` (node sources),
  `js/data/modelConstants/dependencies.js`.

## RES4LYF — tagless-repo lock case + future app dep

User installed **RES4LYF** (`ClownsharkBatwing/RES4LYF`) on the LOCAL image-authoring
rig, pinned to commit **`419de2d7c78f415dde9aa352a7231820ebfc17a4`** (2026-06-14;
reqs: opencv-python, matplotlib, pywavelets, numpy>=1.26.4). It is NOT in the app
or Builder yet — user trials image workflows locally first; future image workflows
for recent models will need it.

Two things this adds to MPI-117 scope:
1. **The lock system MUST support tagless repos.** RES4LYF has NO tags / NO releases
   (that's why ComfyUI-Manager only offers "nightly" = main HEAD). The only stable
   lock is a **commit SHA**. So the lock file (option A `node_lock.json`) entry shape
   must be `{ repo, commit }` and the app/Builder consumers must fetch the commit zip
   (`.../archive/<sha>.zip`) or `git checkout <sha>` — NOT a branch/tag. Good: a SHA
   is immutable (stronger than a tag a maintainer can move).
2. **RES4LYF is a NEW app dependency to ADD** (not just re-pin an existing one). When
   the lock lands, add RES4LYF as a `dependencies.js` DEPS entry, SHA-pinned to the
   commit the user validated locally (start from `419de2d`, bump deliberately). This
   is the FIRST node added correctly-pinned — use it as the template for re-pinning
   the other 7 floating nodes. Decide whether it ships in the app at the same version
   the user authors against (parity).

Do NOT add RES4LYF to `dependencies.js` before the lock exists — one SHA-pinned node
among 7 floating ones is an inconsistent half-measure. It lands with the lock, on the
RunPod branch.

## Lock SOURCE is per-node — Registry vs GitHub-tag vs GitHub-SHA (key design refinement)

A node's lockable version can come from THREE places; the lock file must record
which, because the download URL differs. Do NOT assume one URL shape.

1. **Comfy Registry** (registry.comfy.org) — a SEPARATE versioning system from
   GitHub releases. Nodes published via `comfy node publish` have proper semver
   versions + immutable CDN zips, even with ZERO GitHub tags. Example: the user's
   own **ComfyUI-MpiNodes** has 11 registry versions (latest **1.1.1**, 2026-06-17),
   URL `https://cdn.comfy.org/<publisher>/<node>/<version>/node.zip`. Query the
   registry: `https://api.comfy.org/nodes/<node-id>/versions`. NOTE: MpiNodes
   versions 1.0.5+ show status "Flagged" (1.0.4- "Active") — user should check the
   publisher dashboard before locking to a Flagged version.
2. **GitHub tag/release** — `archive/refs/tags/<tag>.zip` (if the node cuts tags).
3. **GitHub commit SHA** — `archive/<sha>.zip`, the fallback when a node has NEITHER
   registry nor tags. Example: **RES4LYF** is NOT in the registry and has no tags →
   SHA-pin only (`419de2d...`).

So the lock file entry needs a `source` discriminator, e.g.:
```json
"ComfyUI-MpiNodes": {"source":"registry","publisher":"mad-pony-interactive","node":"ComfyUi-MpiNodes","version":"1.1.1"},
"RES4LYF":          {"source":"git-commit","repo":"ClownsharkBatwing/RES4LYF","commit":"419de2d7c78f415dde9aa352a7231820ebfc17a4"},
"comfyui-kjnodes":  {"source":"git-commit","repo":"kijai/ComfyUI-KJNodes","commit":"<sha>"}
```
Both consumers (app `dependencies.js` builder + Pod Dockerfile) resolve the entry
to a concrete URL by `source`. **MpiNodes specifically: lock by Registry version
1.1.1** (the user's own release surface, cleaner than a GitHub SHA). For the other
6 packs, check per-node: in the registry → lock by version; else → SHA.

ACTION for the lock task: for each of the 7+ nodes, determine its source (query
`api.comfy.org/nodes/<id>/versions`; if empty, fall back to GitHub tag, else SHA)
and record source+value in the lock file.
