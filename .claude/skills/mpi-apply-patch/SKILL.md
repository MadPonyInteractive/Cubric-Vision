---
name: mpi-apply-patch
description: Ship a Cubric Vision bug-fix patch (3rd-digit bump on the master/released line, then carry the same fix to the current dev branch without bumping it). Use whenever the user says "let's apply a patch", "apply a patch", "ship a patch", "patch this", "cut a patch", "patch release", or describes fixing a bug a Patreon/Pro/Early-Access supporter reported on the released version. This is the bug-fix-between-releases flow — it bumps only the last version digit on master, rebuilds, and refreshes the existing Cloudflare download link; it does NOT publish to GitHub and does NOT create a new download link.
user-invocable: true
---
# mpi-apply-patch — bug-fix patch on the released line

A supporter on the released version hit a bug. The fix lands on **master** (the
released trunk) as a 3rd-digit patch, gets rebuilt, and refreshes the **existing**
Cloudflare link. The same fix is then carried to the **current dev branch** — but
that branch is **never bumped** (the branch itself *is* the next minor bump; it
only records the fix in its unreleased changelog).

Read `mpi-release-shared/SKILL.md` and the references it names before running.
Obey the shared invariant: **prep everything, STOP before each live op**
(push, build dispatch, R2 upload). Two copy-review gates are mandatory.

## Preconditions

- The fix itself is written/committed on **master** first (or write it now on
  master). If you're on the dev branch, the fix belongs on master to start.
- Current released version is master's `APP_VERSION` (e.g. `1.0.1`).

## Steps

### 1. Bump master (3rd digit) — via mpi-version-bump
Run the **`mpi-version-bump`** skill's patch quick-path on master: bump the 3rd
digit in `js/core/appVersion.js` + `package.json` + `package-lock.json`; add the
`releaseNotes.js` block + archival `docs/releases/YYYY-MM-DD-v<ver>.md`; fold any
relevant `docs/releases/UNRELEASED.md` items that apply to this patch. Don't run
`release:approve`/`check` yet — the copy gate comes first.

### 2. 🛑 Gate 1 — user reviews in-app changelog
Present the `releaseNotes.js` block (see `mpi-release-shared/references/copy-review.md`).
Apply the user's edits to `releaseNotes.js` AND the archival md. Then
`npm run release:approve` + `npm run release:check`.

### 3. Commit master (explicit pathspec) — then 🛑 STOP for push
Commit only your files (shared tree — never `git add -A`). Pushing master is a
live op: **stop, let the user push** (or run it once authorized).

### 4. 🛑 Build — dispatch CI, download artifacts
Per `mpi-release-shared/references/build-dispatch.md`: dispatch
`build-portable.yml` with `-f ref=master -f version=<ver>` (NO tag), watch,
download the 6 artifacts to `D:\CubricStudio\Vision\Builds\v<ver>\`.

### 5. 🛑 Gate 2 + R2 — refresh the CURRENT link (no new link, no GC)
Per `mpi-release-shared/references/link-model.md`, the patch **reuses the current
minor link** — find it (`rclone lsf .../vision/`), don't create or delete one.
Build the `index.html` (copy prior, swap version/files/sizes/what's-new),
**user reviews the page copy** (Gate 2), then upload the 6 artifacts + index and
verify (`mpi-release-shared/references/r2-upload.md`). All R2 ops are
user-authorized — stop before uploading.

### 6. Carry the fix to the current dev branch — NO bump
Switch to the current dev branch (e.g. `RunPod` = the in-progress 1.1.x). Apply
the **same fix the cleanest way**:
- If master merges cleanly and only touches files the branch hasn't diverged on,
  a `git merge master` (or cherry-pick of the fix commit, **excluding** the
  version-bump commit) is enough.
- If the same files have diverged on the branch, **re-apply the fix by hand** to
  match the branch's code.

Then add a one-line note to `docs/releases/UNRELEASED.md` describing the fix
(it'll be folded in when the branch is eventually promoted). **Do not bump**
`appVersion.js`/`package.json`/anything on the dev branch — the branch carries no
version of its own yet.

### 7. Summary
Report: master patched to `<ver>` + pushed?/built?/uploaded?; dev branch carries
the fix + UNRELEASED note, unbumped. Note that publishing the Cloudflare link to
Patreon/Discord and the Early-Access +2wk announcement are the user's manual
steps. This patch is **not** on GitHub (that's `mpi-release-public` later).
