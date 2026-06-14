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
- Build the per-OS artifacts via the private **`mpi-ci`** CI, dispatched by
  **commit SHA + `version=` input** (`ref=<sha>`, no tag). `mpi-ci` builds the
  *pushed* ref, so `master` must be pushed before dispatch.
- Per-OS artifacts **cannot be cross-built** (linux/mac `node_modules` need their
  own runner) — all three OSes come from CI, same as `1.0.0`. A Windows host can
  build `win32` locally only.
- Built artifacts are downloaded to **`D:\CubricStudio\Vision\Builds\v<ver>\`**.
- **Cloudflare upload + Patreon delivery happen in the separate
  `MadPony-Identity` project** (`c:\AI\Mpi\MadPony-Identity`), NOT in
  Cubric-Vision. A Cubric-Vision session's job ends when artifacts land in the
  D: Builds folder; the user takes over for the Cloudflare/Patreon step.

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

`git push` and `gh workflow run` (the `mpi-ci` dispatch) are **user-authorized**.
Prepare the fix, version bump, changelog entries, and commit; then stop and wait
for the user before pushing or dispatching.

**See:** `README.md` (this folder), `portable-distribution-contract.md`,
`build-experience-log.md`, `docs/versioning.md`, `/mpi-version-bump` skill.
