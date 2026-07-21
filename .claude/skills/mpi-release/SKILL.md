---
name: mpi-release
description: Cut a Cubric Vision release — the single GitHub-only release flow. Bump the right version digit (2nd = new features/ops/engine, 3rd = bug fixes, 1st = breaking), stamp the files via mpi-version-bump, build the portable artifacts in CI, and publish a GitHub Release with the full builds + update bundles. Use when the user says "cut a release", "ship a release", "make a release", "publish the release", "release to GitHub", "ship this version", "release the fixes", or indicates master is ready to go public. There is ONE release flow now — no pre-release tiers, no branch merging.
user-invocable: true
---
# mpi-release — the one GitHub-only release flow

Cubric Vision ships from **master** to a **public GitHub Release**. That's it —
one branch, one channel. Every release is the **same mechanical operation**; only
the version digit differs:

| Digit | When | Example |
|---|---|---|
| **3rd (patch)** | Bug fixes only, no new ops/engine/schema | `1.1.0 → 1.1.1` |
| **2nd (minor)** | New operations, new model support, or a ComfyUI engine bump | `1.1.1 → 1.2.0` |
| **1st (major)** | Breaking change (schema bump, incompatible op change) | `1.2.0 → 2.0.0` |

Pick the digit, then run the exact same steps below. There is no separate
"promote", "patch", or "publish" skill — this is all of them.

Read the two references in this skill's `references/` before running:
`build-dispatch.md` (CI build + artifact download) and `copy-review.md` (the two
mandatory user-facing copy gates). The version file edits belong to
**`mpi-version-bump`** — this skill calls it, it does not re-implement it.

## Invariants (do not skip)

- **Prep all, then STOP before each live op.** Version edits, notes, and the copy
  drafts are fine to do autonomously. PAUSE and wait for the user before: `git
  push`, pushing the `v*` tag (fires the CI build), and `gh release create` (the
  public moment). These are irreversible / public-facing.
- **Two copy-review gates are mandatory** — the in-app changelog and the GitHub
  release body. The user rewrites dev-speak into user-speak before it ships. See
  `references/copy-review.md`.
- **Shared git tree.** Commit by explicit pathspec (`git commit --only <paths>`),
  never `git add -A` (see `.claude/rules/git.md`).

## Preconditions

- You are on **master** and it is at the version you're bumping *from*. Confirm
  with `git show master:js/core/appVersion.js`.
- The user-facing changes are feature-complete and `docs/releases/UNRELEASED.md`
  holds the accumulated notes since the last release.
- You know the digit to bump (table above).

## Steps

### 1. Stamp the version — via mpi-version-bump
Run **`mpi-version-bump`** for the chosen digit. It bumps `appVersion.js` +
`package.json` + `package-lock.json`, updates the operation/model registries and
`operation_registry.json` if ops changed, folds every `docs/releases/UNRELEASED.md`
item into the `js/data/releaseNotes.js` block + a new archival
`docs/releases/YYYY-MM-DD-v<ver>.md`, then clears UNRELEASED back to its header.
Hold `release:approve`/`check` until after Gate 1.

> Derived stage (`js/core/appStage.js`) is automatic: `X.Y.Z` (Z>0) = alpha,
> `X.Y.0` (Y>0) = beta, `X.0.0` = release. You don't set it.

### 2. 🛑 Gate 1 — user reviews the in-app changelog
Present the `releaseNotes.js` block rendered the way `MpiChangelogDialog` shows it
(kicker `<Stage> · v<ver>`; fixed section order Breaking → Important → What's new →
Fixes → Engine; each item plain text). Apply the user's edits to `releaseNotes.js`
AND the archival md so they stay aligned (`references/copy-review.md` Gate 1). Then
`npm run release:approve` + `npm run release:check`.

### 3. Commit master (explicit pathspec) — then 🛑 STOP for push
Commit only your files (shared tree — never `git add -A`). Pushing master is a
live op: stop, let the user push (or run it once authorized). CI builds the
*pushed* ref, so master must be pushed before the build.

### 4. 🛑 Build — push the `v<ver>` tag, then download artifacts
Per `references/build-dispatch.md`: the `v<ver>` tag push is the build trigger
(`push: tags: v*` → private mpi-ci build). Pushing the tag is user-authorized —
stop first. When CI finishes, download the **6 artifacts** (3 full builds + 3
update bundles) to `D:\CubricStudio\Vision\Builds\v<ver>\`, verify they landed,
then delete the CI run's artifacts (storage hygiene).

> The tag publishes **nothing** on its own — it only fires the private artifact
> build. The public moment is `gh release create` in Step 6.

### 5. 🛑 Gate 2 — user reviews the GitHub release body
The release body is user-facing → present it for review/rewrite
(`references/copy-review.md` Gate 2). The body bundles the accumulated changelog
blocks since the last release (each version added its own block; a release that
skips versions lists all of them). Keep within the claim boundary in
`docs/releases/github-release-checklist.md` (image + video gen allowed; no
unshipped-roadmap claims; Vision is local image/video, not an assistant) and
include the platform-disclosure block from that checklist.

### 6. 🛑 Publish — create the GitHub Release
With the user's authorization, create the release on the existing tag and attach
all 6 artifacts (full builds **and** update bundles — the update bundles are how
existing users patch in place via the online `update.*` script; without them
every update is a full re-download):
```bash
gh release create v<ver> --repo MadPonyInteractive/Cubric-Vision \
  --title "Cubric Vision v<ver>" --notes-file <body.md> \
  D:/CubricStudio/Vision/Builds/v<ver>/CubricVision-*-v<ver>.zip \
  D:/CubricStudio/Vision/Builds/v<ver>/CubricVision-*-v<ver>.tar.gz \
  D:/CubricStudio/Vision/Builds/v<ver>/CubricVision-*-update-v<ver>.zip
```
Use the canonical asset names from `docs/releases/github-release-checklist.md`
(no legacy `CubricStudio` names).

### 7. Summary
Report the published tag, release URL, and attached assets. **Comms are out of
scope** — announcement copy (Patreon / Discord / YouTube / Gumroad) is owned by
the MadPony-Identity launch-comms workflow, a separate manual step the user
drives. (Patreon is a comms/support channel only — it no longer gates release
downloads.)
