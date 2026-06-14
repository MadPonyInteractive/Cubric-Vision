# Patch Distribution — Patreon Pro patches vs public GitHub releases

After the first public release (`1.0.0`), Cubric Vision ships through **two
distinct channels**. Do not conflate them — the difference decides whether a
git tag is pushed and whether anything becomes public.

## The two channels

### 1. Patreon Pro patch (`1.0.1`, `1.0.2`, …)

A point bug-fix release delivered **only to Patreon Pro tier supporters**, in the
weeks between public versions.

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

## Cloudflare R2 upload (Patreon Pro)

The canonical R2 reference is
`MadPony-Identity/capabilities/cloudflare-r2/README.md` (bucket setup, approval
gates, secrets). Secrets live in `C:\Users\Fabio\.secrets\` — never copy keys or
tokens into any repo. For a patch:

- **Stable Pro path** — reuse the existing path and swap the files behind it, so
  the Patreon Pro post link never changes between patches:
  `vision/pro/v1.0.0-9b3054cbac074cf4be5b/` →
  `https://dl.cubric.studio/vision/pro/v1.0.0-9b3054cbac074cf4be5b/index.html`.
- **Upload** the 3 full builds + an updated `index.html` with `rclone copyto`
  (`--s3-no-check-bucket`). The Pro `index.html` lists the **3 full builds only**;
  the `-update-*.zip` deltas are not put on this page (they feed the in-app
  updater). Copy the prior version's `index.html`, swap version + filenames + MB
  sizes + a one-line "what's new".
- **Replace, don't accumulate** — delete the prior version's build files from the
  path after the new ones upload (deletion is approval-gated; get the user's OK).
- **Verify** — `rclone lsf` the path, then HTTP `HEAD` each public URL and confirm
  `200` with `Content-Length` matching local bytes; confirm the old version 404s.
- Uploading paid-member files, replacing live files, and deleting are all
  approval-gated. Publishing the link on Patreon is the user's step.

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
