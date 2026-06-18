# Patch Distribution — Patreon pre-release patches vs public GitHub releases

After the first public release (`1.0.0`), Cubric Vision ships through **two
distinct channels**. Do not conflate them — the difference decides whether a
git tag is pushed and whether anything becomes public.

> **The three release skills own these flows.** This doc is the reference; the
> executable procedure lives in `.claude/skills/`:
> `mpi-apply-patch` (a patch), `mpi-merge-branches` (promote a minor +
> mint/GC the Cloudflare link), `mpi-release-public` (the public GitHub tag).
> Shared mechanics in `mpi-release-shared`. The Cloudflare link is **owned here**
> in Cubric-Vision; MadPony-Identity only *posts* the finished link.

## The two channels

### 1. Patreon pre-release patch (`1.0.1`, `1.0.2`, …)

A point bug-fix release delivered to Patreon supporters (Pro first, Early Access
later — see the tier cadence below), in the weeks between public versions.

- **No git tag.** The `build-portable.yml` dispatcher has a `push: tags: 'v*'`
  trigger that auto-publishes a GitHub Release. Pushing a `v1.0.x` tag would leak
  the patch publicly. Patreon patches are therefore tagless.
- Commit the fix + version bump to **`master`** (the release trunk).
- Build the per-OS artifacts via the private **`mpi-ci`** CI. `master` must be
  **pushed** first (`mpi-ci` builds the pushed ref). Dispatch with
  `-f ref=master -f version=<ver>` — **NOT** a bare commit SHA: the checkout
  action resolves `ref` as a branch/tag name and fails on a raw SHA
  (`A branch or tag with the name '<sha>' could not be found`). No tag is pushed.

  ```bash
  gh workflow run cubric-vision-portable.yml --repo MadPonyInteractive/mpi-ci --ref main \
    -f source_repo=MadPonyInteractive/Cubric-Vision -f ref=master -f version=<ver>
  ```
- Per-OS artifacts **cannot be cross-built** (linux/mac `node_modules` need their
  own runner) — all three OSes come from CI, same as `1.0.0`. A Windows host can
  build `win32` locally only.
- Download the artifacts to **`D:\CubricStudio\Vision\Builds\v<ver>\`**. Each CI
  artifact yields a full build **and** an `-update-<ver>.zip` delta bundle (6
  files total for 3 OSes).
- **Upload to Cloudflare R2 from here** — the patch loop is self-contained in
  Cubric-Vision (see the R2 section below). MadPony-Identity owns public RELEASES
  and announcement/comms copy, not patch-upload mechanics.
- **Carry the fix to the current dev branch too — UNBUMPED.** After the patch
  lands on master, apply the same fix to the in-progress dev branch (the next
  minor, e.g. `RunPod` = 1.1.x) the cleanest way (merge master if clean, re-apply
  if the same files diverged) and add a one-line note to
  `docs/releases/UNRELEASED.md`. **Bump nothing** on the dev branch — the branch
  itself is the next minor bump; the note is folded in at promote time. This is
  `mpi-apply-patch`'s final step.

## Cloudflare R2 upload (pre-release link)

The canonical R2 reference is
`MadPony-Identity/capabilities/cloudflare-r2/README.md` (bucket setup, approval
gates, secrets). Secrets live in `C:\Users\Fabio\.secrets\` — never copy keys or
tokens into any repo. The link is **owned in Cubric-Vision** (the release skills
create/GC it); Identity only posts the finished link. For a patch:

- **Reuse the CURRENT minor link** and swap the files behind it, so the Patreon
  post link never changes between patches. The link is **tier-neutral** and
  named by minor only — no `pro/` segment, no patch digit:
  `vision/v<major>.<minor>-<randomhex>/` →
  `https://dl.cubric.studio/vision/v<major>.<minor>-<randomhex>/index.html`.
  Find the current one with `rclone lsf .../vision/ --dirs-only`; a patch never
  creates or deletes a link. (See `mpi-release-shared/references/link-model.md`
  for the full naming + GC lifecycle — a NEW link is minted, and the prior one
  GC'd, only at a **promote**, not a patch.)
- **Upload, with `rclone copyto` (`--s3-no-check-bucket`), BOTH:**
  - the **3 `-update-<ver>.zip` delta bundles** — these are how supporters update
    from a prior version. They run their install's
    `update-from-zip.<bat|sh|command>` and point it at the bundle (preserves
    engine/models/projects/settings). The online `update.*` script must NOT be
    used for a pre-release patch — it pulls the latest **GitHub** release, where
    the patch is not published; if a later public release exists it would
    *downgrade* the user. Never describe a pre-release patch as an "in-app /
    built-in updater" update.
  - the **3 full builds** — for fresh/clean installs only.
  Plus an updated `index.html` with two sections ("update from vX" listing the
  deltas + the `update-from-zip` steps, and "fresh install" listing the fulls).
  Copy the prior version's `index.html`, swap version + filenames + sizes + a
  one-line "what's new".
- **Swapping files** — replace what changes behind the stable path. Leaving the
  prior full build available is fine (clean-install fallback); the new deltas are
  the actual patch mechanism. Any deletion is approval-gated — get the user's OK.
- **Verify** — `rclone lsf` the path, then HTTP `HEAD` each public URL and confirm
  `200` with `Content-Length` matching local bytes.
- Uploading paid-member files, replacing live files, and deleting are all
  approval-gated. Publishing the link on Patreon is the user's step.

## Tier cadence — one tier-neutral link, time-gated

The link is **tier-neutral**: the same URL serves both tiers, staggered in time.
This is why the path and the `index.html` copy must never say "Pro".

- A **new** link is minted only at a **promote** (`mpi-merge-branches`, a minor
  bump). On promote day it is the **Pro** drop.
- The **same** link is announced to **Early Access** ~2 weeks later. The link
  existed the whole time — only the announcement is delayed. The +2wk
  announcement is the user's manual Patreon/Discord step, not the skills'.
- **Patches** (3rd digit) between promotes reuse that link in place.
- At the **next** promote the prior minor link is **garbage-collected** — safe,
  because by then that version has shipped as a public GitHub release, so Early
  Access can still get it from GitHub. GC (delete) is double-gated.

See `mpi-release-shared/references/link-model.md` for the authoritative lifecycle.

### 2. Public GitHub release

Done later, **bundling all accumulated patches** since the last public version.
This is the only time a `v*` tag is pushed (firing `push: tags: 'v*'` → publish).

Example: if only `1.0.1` and `1.0.2` patches happened, the public release is
`1.0.2` and its changelog lists **both** fixes.

## Accumulating changelog

Both changelog surfaces are keyed by `APP_VERSION` and **accumulate** — each
release ADDS a version block, never overwrites a prior one:

- **Runtime** — `js/data/releaseNotes.js` (a `{ "1.0.0": {...}, "1.0.1": {...} }`
  map; consumed by `MpiChangelogDialog`, shown once per `APP_VERSION`). The dialog
  does exact-key lookup — it shows ONLY the current version's block, never
  concatenates. A user who jumps `1.0.0 → 1.0.2` sees only `1.0.2`'s block, so
  repeat earlier fixes in the latest block if jumpers must see them.
- **Archival** — `docs/releases/YYYY-MM-DD-v<ver>.md` (one file per version; the
  running app never reads these).

`npm run release:check` enforces a 1:1 mapping between the two and that
`APP_VERSION` / `package.json` / `package-lock.json` all match. Every version bump
MUST add BOTH a `releaseNotes.js` block AND a `docs/releases/*.md` file, or the
gate fails. The public GitHub release note is assembled from all per-version
archival blocks since the last public release.

## Live-op authorization

`git push`, `gh workflow run` (the `mpi-ci` dispatch), and R2 uploads/deletes are
**user-authorized**. Prepare the fix, version bump, changelog entries, and commit;
then stop and wait for the user before pushing, dispatching, or uploading. Live
verification of the fix (running the app, generating) is the user's call before a
build is dispatched.

**See:** `README.md` (this folder), `portable-distribution-contract.md`,
`build-experience-log.md`, `docs/versioning.md`, `/mpi-version-bump` skill.
