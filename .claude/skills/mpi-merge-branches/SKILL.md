---
name: mpi-merge-branches
description: Promote the current Cubric Vision dev branch into master as the next minor version, build it, and cut a fresh tier-neutral Cloudflare pre-release link (garbage-collecting the previous one). Use when the user says "let's merge the branches", "merge the branches", "promote the branch", "promote to master", "cut the next pre-release", "ship the next version to Patreon", or indicates the in-progress dev branch is ready to become the next Pro/Early-Access drop. This is the minor-version promote flow — it creates a NEW download link and deletes the prior one; it does NOT publish to GitHub and does NOT push a git tag.
user-invocable: true
---
# mpi-merge-branches — promote dev branch → master (next minor pre-release)

The in-progress dev branch (e.g. `RunPod`, which *is* the next minor — 1.1.x) is
ready. Merge it into **master**, build it, and cut a **new** tier-neutral
Cloudflare link for the Pro drop, garbage-collecting the previous minor's link.
This is a Patreon **pre-release**, not a public release — **no git tag, no GitHub
release** (that comes later via `mpi-release-public`, ~1 month on).

Read `mpi-release-shared/SKILL.md` and its references first.
`references/link-model.md` is the authority on the link create/GC. Obey
**prep-all-then-STOP** before every live op; both copy gates are mandatory; the
link delete is double-gated.

## Preconditions

- The dev branch is feature-complete for this minor and its
  `docs/releases/UNRELEASED.md` holds the accumulated notes (incl. any patch
  fixes carried over by `mpi-apply-patch`).
- You know the target minor version (the branch's identity — e.g. `1.1.0`). The
  branch carries no version constant of its own until this promote.

## Steps

### 1. Merge dev branch → master
Merge the current dev branch into master. Resolve conflicts toward the dev
branch's forward state (it's ahead). master now becomes the new minor line.

### 2. Stamp the version + fold the changelog — via mpi-version-bump
On master, run **`mpi-version-bump`** for the minor: set `appVersion.js` +
`package.json` + `package-lock.json` to `<major>.<minor>.0`; fold every
`docs/releases/UNRELEASED.md` item into the `releaseNotes.js` block + a new
archival `docs/releases/YYYY-MM-DD-v<ver>.md`, then clear UNRELEASED back to its
header. (Note the derived stage: `X.Y.0` with Y>0 = **beta** — see
`js/core/appStage.js`.) Hold `release:approve`/`check` until after Gate 1.

### 3. 🛑 Gate 1 — user reviews in-app changelog
Present the `releaseNotes.js` block; apply edits to it AND the archival md
(`mpi-release-shared/references/copy-review.md`). Then `npm run release:approve`
+ `npm run release:check`.

### 4. Commit master (explicit pathspec) — then 🛑 STOP for push
Commit only your files. Pushing master is a live op — stop for the user.

### 5. 🛑 Build — dispatch CI, download artifacts
Per `references/build-dispatch.md`: dispatch `build-portable.yml` with
`-f ref=master -f version=<ver>` (NO tag), download the 6 new artifacts to
`D:\CubricStudio\Vision\Builds\v<ver>\`.

### 6. 🛑 Gate 2 + R2 — create the NEW link, then GC the old one
Per `references/link-model.md`:
- **Mint a new link** `vision/v<major>.<minor>-<randomhex>/` (fresh random hex,
  tier-neutral — no `pro/`, no patch digit). Build the `index.html`, **user
  reviews the page copy** (Gate 2), upload the 6 artifacts + index, verify
  (`references/r2-upload.md`). Upload is user-authorized — stop first.
- **GC the prior minor link** (`rclone purge`) — **double-gated**: confirm with
  the user that the prior version is already public on GitHub (so Early Access
  isn't stranded), then delete. If the prior version hasn't been publicly
  released yet, do NOT delete — surface that and wait.

### 7. Summary + handoff
Report: branch merged to master at `<ver>`; built; new link minted; old link
GC'd (or held, with reason). The new link is now the Pro drop; **Early Access
gets the same link announced ~2 weeks later** — both are the user's manual
Patreon/Discord steps (and MadPony-Identity's posting workflow). Going forward,
patches to this minor reuse this link via `mpi-apply-patch`.
