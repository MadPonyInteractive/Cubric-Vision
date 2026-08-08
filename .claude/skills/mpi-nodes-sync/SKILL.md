---
name: mpi-nodes-sync
description: Work on the first-party ComfyUI node pack (ComfyUi-MpiNodes) and keep Cubric Vision's pin in sync. Use when the user says "add a node", "new comfy node", "update a node", "change MpiNodes", "the nodes repo changed", "pin the nodes", "MpiNodes drift", "sync the nodes", "/mpi-nodes-sync", or when any work touches c:\AI\Mpi\ComfyUi-MpiNodes. Covers the sibling repo's own new-node / update-node / release procedures, which do NOT auto-load in a Vision session. Publishing to the Comfy registry (release) happens ONLY when the user explicitly asks.
user-invocable: true
---
# /mpi-nodes-sync — the node pack and the app's pin, in one flow

**The problem this exists for.** `ComfyUi-MpiNodes` is a **separate git repo**. On this dev
machine it is **symlinked into `custom_nodes`**, and the engine's drift check *skips* it on a
source run (`.claude/rules/comfy_engine.md` § Dev-symlink escape hatch). So a node edit works
locally with **no commit, no push, and no pin bump** — and ships to nobody. Measured
2026-08-08: the app pinned `a6e5d5e` while the repo was 5 commits ahead at `43a976f`, three
new nodes unreachable to every user.

A node change is not done until: **committed → pushed → the app's pin moved.**

## Repo facts

- Path: `c:\AI\Mpi\ComfyUi-MpiNodes` (remote `MadPonyInteractive/ComfyUi-MpiNodes`, branch `main`).
- Reachable via `permissions.additionalDirectories` — **file access only**. Its
  `.claude/commands/` do **NOT** load in a Vision session, so `/comfy-new-node`,
  `/comfy-update-node`, `/comfy-release` **cannot be invoked**. Read the markdown and follow
  it inline.
- Separate repo ⇒ every git call is `git -C c:/AI/Mpi/ComfyUi-MpiNodes ...`. Never run git
  from Cubric-Vision against it.
- The pin lives in **`dev_configs/node_lock.json` → `nodes["ComfyUI-MpiNodes"].commit`** and
  nowhere else in the app (`lockUrl()` in `js/data/modelConstants/nodesDeps.js` builds the
  download URL from it).

## The three sibling procedures — read the file, follow it inline

| Job | Read + follow |
|---|---|
| New node | `c:\AI\Mpi\ComfyUi-MpiNodes\.claude\commands\new-node.md` |
| Change an existing node | `c:\AI\Mpi\ComfyUi-MpiNodes\.claude\commands\update-node.md` |
| Publish to the Comfy registry | `c:\AI\Mpi\ComfyUi-MpiNodes\.claude\commands\release.md` |

Both node procedures end in a `changelog.md` bullet and a `README.md` row — do not skip them;
the release procedure consumes exactly those bullets.

**Release is user-triggered ONLY.** Never run `release.md` because a node changed. It bumps
`pyproject.toml`, pushes, and publishes a public registry version. Run it only when the user
says "release the nodes" in so many words. Committing + pushing + pinning does **not** need a
release.

## Steps

**1. Check drift first (always, even if the task sounds unrelated):**

```bash
git -C c:/AI/Mpi/ComfyUi-MpiNodes fetch --quiet origin
git -C c:/AI/Mpi/ComfyUi-MpiNodes status --short
git -C c:/AI/Mpi/ComfyUi-MpiNodes log --oneline -1 HEAD origin/main
node -e "console.log(require('./dev_configs/node_lock.json').nodes['ComfyUI-MpiNodes'].commit)"
```

Report the three states plainly: working tree clean?, HEAD == `origin/main`?, pin == HEAD?

**2. Do the node work** — via the matching sibling command file above.

**3. Commit in the node repo** (explicit pathspec, its own repo):

```bash
git -C c:/AI/Mpi/ComfyUi-MpiNodes commit --only <paths> -m "feat: <node> - <what>"
```

**4. Push — once the user has accepted the change.** Their acceptance IS the authorization
for this push; do not sit on an accepted change, and do not push work they have not seen.

```bash
git -C c:/AI/Mpi/ComfyUi-MpiNodes push origin main
```

**5. Move the pin** in `dev_configs/node_lock.json` to the **pushed** sha
(`git -C c:/AI/Mpi/ComfyUi-MpiNodes rev-parse HEAD`, full 40 chars). Pinning an unpushed sha
gives every user a 404 on the GitHub archive URL. **This file is co-owned — claim it first**
(`.agents/mpi-kanban/state/index.json` → `active_file_claims`).

**6. Nothing else.** MpiNodes is `installRequirements: false` = a VOLUME node: the pin bump
alone heals both engines through the drift ladder. **No Pod image rebuild**, no
`compile-node-deps.mjs`, no `python_deps` regen (`.claude/rules/comfy_engine.md` § node pins;
`mpi-ci/cubric-vision-pod/start.sh` § first-party node freshness). The pod's
`node_lock.json` is a build-context **copy**, refreshed by `/build-pod-image` — the app's file
is the source of truth; do not hand-sync it.

**7. If a node was REMOVED or RENAMED**, before pinning:

```bash
grep -rn "<OldClassName>" comfy_workflows/ js/services/workflowInjectors/ js/data/
```

A pinned commit that drops a `class_type` a shipped workflow still references breaks that
model at dispatch, and ComfyUI's own validation may pass it.

**8. `dev_configs/node_lock.json` is a version-bump trigger.** The Stop hook will say so.
Run `/mpi-version-bump` when the app release is cut — not per node change.

## Done means

- [ ] Node repo: working tree clean, HEAD == `origin/main`
- [ ] `changelog.md` + `README.md` updated in the node repo
- [ ] `dev_configs/node_lock.json` pin == that pushed sha (full 40 chars)
- [ ] Removed/renamed classes grepped out of `comfy_workflows/`
- [ ] Registry release: only if the user asked for one
