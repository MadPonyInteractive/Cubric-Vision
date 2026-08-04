# MPI-340 — Dev Pod images + dev runtime channel (dev_mode-gated)

## Why now

1.1.0 shipped (MPI-335). Released portable builds resolve the Pod image and the Pod
runtime from two **shared, global** pins:

- `POD_IMAGE_VERSION = 'v0.16.0'` / `POD_IMAGE_VERSION_CPU = 'v0.16.0'`
  (`routes/remotePodLifecycle.js`) — every released app creates Pods on these exact tags.
- R2 channel **`stable`** — `bootstrap.sh` on EVERY Pod curls `wrapper.py` + `start.sh`
  from `https://pod.cubric.studio/vision/stable/` at boot.

So today: a `./publish-runtime.sh stable` push reaches **released users on their very next
Pod boot**, with no app update and no opt-in. Since MPI-156 deliberately made wrapper/start
edits rebuild-free, wrapper edits are the *frequent* change — which means the currently
unprotected path is the one we touch most.

Three RunPod cards are queued behind this (MPI-333 verify perf, MPI-329 cold model-load,
MPI-341 image build hardening). All of them want to change Pod-side code. This card is the
safety substrate that makes that work non-scary.

## The gate already exists

`routes/remotePodLifecycle.js:37` already has a server-side `_devMode`
(mirrors `main.js` / `dev_configs/app_config.js`: `BUILD_HASH === 'dev'`). It is
already used at line 585 to open the raw ComfyUI port on dev builds only. A released
portable stamps a real build hash, so `_devMode` is **false** there — it cannot resolve a
dev tag or a dev channel by any code path. That is the whole isolation guarantee.

## Design (two halves — the second is the one that matters most)

### Half 1 — dev image tags

Add dev consts next to the stable ones and branch in `podImageForCard()`:

```js
// Dev-only tags (MPI-340). _devMode is false in every released build, so a shipped
// app can never resolve these. Bump freely; the stable pins above stay frozen.
const POD_IMAGE_VERSION_DEV = 'v0.17.0-dev';
const POD_IMAGE_VERSION_CPU_DEV = 'v0.17.0-dev';

function podImageForCard(gpuTypeId) {
  if (gpuTypeId === CPU_SENTINEL) {
    const v = _devMode ? POD_IMAGE_VERSION_CPU_DEV : POD_IMAGE_VERSION_CPU;
    return `${POD_IMAGE_BASE_CPU}:${v}-cpu`;
  }
  const v = _devMode ? POD_IMAGE_VERSION_DEV : POD_IMAGE_VERSION;
  return `${POD_IMAGE_BASE}:${v}-cu130`;
}
```

**No CI change needed** — verified in `mpi-ci/.github/workflows/cubric-vision-pod-image.yml`
"Compute tags": the tag is built as `${image}:v${manifest_version}-${cuda_profile}`, so
dispatching with `manifest_version=0.17.0-dev` produces exactly
`v0.17.0-dev-cu130` and `v0.17.0-dev-cpu`. Keep both legs in the same dispatch (the
v0.10.3-cpu 404 trap — a GPU-only push left CPU pods pulling a tag that did not exist).

### Half 2 — dev R2 runtime channel (the wrapper blast radius)

`publish-runtime.sh` **already takes a channel argument** (`CHANNEL="${1:-stable}"` →
`vision/<channel>/`), and `bootstrap.sh` already reads `CUBRIC_RUNTIME_CHANNEL` (default
`stable`) — MPI-156 built this for exactly this purpose ("An image can override, e.g.
CUBRIC_RUNTIME_CHANNEL=canary, without a rebuild"). Nothing new to build; it just is not
wired up.

Wire it at Pod-create, NOT in the Dockerfile — a Pod env override needs no rebuild and
covers GPU and CPU Pods with one line. In `_createPodInternal`, alongside the existing
`_devMode` block but **outside** the `if (noGpu)` branch so CPU download Pods get it too:

```js
// MPI-340: dev builds boot the `dev` R2 runtime channel, so `publish-runtime.sh dev`
// never reaches a released user's Pod. Released builds leave this unset -> `stable`.
if (_devMode) spec.env.CUBRIC_RUNTIME_CHANNEL = 'dev';
```

Then the dev loop is: edit `wrapper.py` / `start.sh` → `./publish-runtime.sh dev` →
restart the Pod. `stable` is untouched.

Seed the dev channel once by publishing the current stable files to `dev` before first use,
so a dev Pod never boots an empty channel (bootstrap falls back to the baked copy on a
404, so this is a nicety, not a correctness requirement — but a silent baked-fallback is
exactly the kind of thing that wastes an hour).

### Half 2b — promote dev to stable (the release verb)

The dev/user split for `wrapper.py` + `start.sh` is the **channel**, not a second copy of
the files. Keep ONE `wrapper.py` and ONE `start.sh` in mpi-ci — git already versions them;
duplicating into `wrapper.dev.py` means two files to keep in sync, silent divergence, and
every fix applied twice. The shape mirrors the GitHub release flow exactly:

| GitHub release | Pod runtime |
|---|---|
| master working tree | `wrapper.py` / `start.sh` in mpi-ci |
| `npm start` from source (`BUILD_HASH = 'dev'`) | dev app boots `vision/dev/` |
| publish a GitHub Release | promote to `vision/stable/` |
| released users pull the release | released Pods boot `vision/stable/` |

Confirmed: `js/core/buildInfo.js` is `BUILD_HASH = 'dev'` in source and only
`scripts/build-portable.mjs` stamps a real hash, so a source `npm start` is always
`_devMode` and a portable never is.

**Gap to close:** `./publish-runtime.sh stable` publishes the **working tree**, not the
bytes that were tested on dev. Edit → push dev → test → keep tinkering → promote, and
untested code reaches released users. So add a promote mode that copies server-side:

```
./publish-runtime.sh dev       # deploy working tree to the dev channel
./publish-runtime.sh promote   # rclone copy vision/dev/* -> vision/stable/*
```

`promote` copies `start.sh`, `start-cpu.sh` and `wrapper.py` remote-to-remote (exact tested
bytes, no re-upload), then writes a fresh `stable` manifest. The script **already** emits a
`manifest.json` carrying `wrapper_version` plus sha256 of all three files, and curl-verifies
every public URL — so the guard is nearly free: recompute the working-tree shas, compare
against the live `vision/dev/manifest.json`, and REFUSE the promote on mismatch with a
message naming which file drifted. That makes "promote only what you tested" mechanical
instead of remembered.

Keep `./publish-runtime.sh stable` working as-is for a deliberate hotfix straight to
released users, but it should print a loud warning that it bypasses the dev channel.

## Known limits — accept, do not build around

- **The network volume is still shared.** A dev Pod and a released Pod hitting the same
  volume can cross-contaminate: manifest `manifest_schema_version` (a dev bump past
  `MANIFEST_SCHEMA_MAX = 2` would 409-block the released app, see
  `docs/runpod-remote-engine.md` section 10 / MPI-90) and volume custom-node commits
  (a dev pin would show as node drift on stable). Use a separate volume when a dev change
  touches the manifest schema or a volume node pin. Not worth automating.
- Dev tags are throwaway. Do NOT let a dev tag become the stable pin by promotion-in-place;
  promotion is a clean rebuild at a real version (below).

## Promotion path

**Runtime only** (`wrapper.py` / `start.sh` — the common case, no rebuild):
prove it on a dev Pod → `./publish-runtime.sh promote` → released Pods pick it up on their
next boot. That is the whole release.

**Image** (a baked layer changed — torch, ComfyUI, a pip-req node, `bootstrap.sh`):
dev tag proves out on a live Pod → rebuild at a real version (e.g. `0.17.0`) in ONE CI
dispatch covering **both** GPU and CPU legs (the v0.10.3-cpu 404 trap: a GPU-only push left
CPU Pods pulling a tag that did not exist) → bump `POD_IMAGE_VERSION` +
`POD_IMAGE_VERSION_CPU` → app restart (the consts are held in memory) → fresh Pod. Then the
dev consts move to the next dev version.

The two are independent — a runtime promote does not need an image bump, which is the whole
point of MPI-156.

## Verify

- Source run (`_devMode` true): connect a GPU Pod, confirm the RunPod console Container log
  shows `create container ...:v0.17.0-dev-cu130`, and the Pod log shows
  `[cubric-bootstrap] fetching runtime from https://pod.cubric.studio/vision/dev (channel=dev)`.
- Same for a CPU download-mode Pod (`-cpu` tag, same dev channel line).
- Portable build (`_devMode` false): confirm it still resolves `v0.16.0-cu130` and
  `channel=stable`. This is the release-safety assertion — do not skip it.

## Files — code

- `routes/remotePodLifecycle.js` — dev consts, `podImageForCard()` branch, `spec.env` line.
- `c:/AI/Mpi/mpi-ci/cubric-vision-pod/publish-runtime.sh` — the `dev` channel is already
  supported (`CHANNEL="${1:-stable}"`); ADD the `promote` mode + the drift refusal.

## Docs, rules + skills — the channel is a trap if it is undocumented

Every place below currently says `./publish-runtime.sh stable` as **the** way to ship a
runtime edit. After this card that instruction is wrong for day-to-day work (it skips dev
entirely and lands straight on released users). Grep-verified list, all live files:

- **`CLAUDE.md:74`** — Context Router row "Product Pod runtime". Currently
  `edit -> ./publish-runtime.sh stable -> restart Pod`. Becomes
  `edit -> ./publish-runtime.sh dev -> test -> ./publish-runtime.sh promote`.
  This row is the single highest-traffic instruction of the set — it is what a cold agent
  reads before touching `wrapper.py`. Fix it first.
- **`docs/runpod-remote-engine.md` section 5** (the MPI-156 R2-float paragraph) — document
  the two channels + the promote verb. Section 6 — document the dev/stable image tag pair.
- **`docs/builder/02-image-and-rebuild.md:100`** — same `publish-runtime.sh stable` line.
- **`.claude/commands/build-pod-image.md:123`** — same. Also note near line 94/96 that a
  dev build bumps the DEV consts, not `POD_IMAGE_VERSION`/`POD_IMAGE_VERSION_CPU`.
- **`.claude/rules/comfy_engine.md:291`** — "rebuild + `POD_IMAGE_VERSION` bump + app
  restart" needs the dev-tag branch.
- **`docs/runpod-troubleshooting.md`** — 4 "ships via `publish-runtime.sh`" mentions;
  the RULE at line 70 (wrapper edits reach BOTH pod flavors) should name the channel.
- **`c:/AI/Mpi/mpi-ci/cubric-vision-pod/README.md`** section "Runtime externalize" — the
  full dev loop + promote (this is the file `CLAUDE.md:74` routes to).

### `mpi-release` — a NEW precondition (this card creates the hazard, so it closes it)

`.claude/skills/mpi-release/SKILL.md` and `.claude/skills/mpi-version-bump/SKILL.md`
currently have **no mention of the Pod at all** (grep-verified: zero hits for
pod/wrapper/runtime). That is fine while one channel exists — `stable` is by definition
whatever is live. Once dev/stable split, an un-promoted dev runtime is a silent release
hazard: ship app 1.2.0 that expects new wrapper behavior while `stable` still serves the
old `wrapper.py`, and every released user breaks on their next Pod boot.

Add to **`mpi-release` section "Preconditions"** (not a mid-flow gate — you want to know
before stamping any version) a runtime-channel drift check:

```bash
curl -s https://pod.cubric.studio/vision/dev/manifest.json
curl -s https://pod.cubric.studio/vision/stable/manifest.json
```

The manifests already carry `wrapper_version` + `start_sha256` + `start_cpu_sha256` +
`wrapper_sha256`, so the diff is exact. If the shas differ, STOP and put it to the user:
promote first (`./publish-runtime.sh promote`), or confirm the dev runtime work is
deliberately not shipping in this release. Never auto-promote inside the release flow —
promotion is a live op affecting released users, same class as `git push`.

`mpi-version-bump` needs **no change** — it is the in-repo file-edit mechanic (app version,
operation registry, release notes). The Pod runtime is a separate artifact on a separate
cadence; keep them decoupled. Recording that here so the next agent does not "helpfully"
wire a wrapper bump into the app version bump.

### Rule-file note

The dev/stable channel split is a cross-cutting convention, so add a one-line entry to
`.claude/rules/dos_and_donts.md`: a runtime edit goes to `dev` first; `stable` is reached
only by `promote` (or a deliberate, warned hotfix).
