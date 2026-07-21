# Build dispatch — all-3-OS portable artifacts via mpi-ci CI

Per-OS portable builds **cannot be cross-built** (linux/mac `node_modules` need
their own runner), so all three OSes come from the private **mpi-ci** CI. This
Windows host could build win32 locally, but for uniformity and fewer moving parts
all three OSes go through CI.

## Preconditions (STOP gates)

1. master **must be pushed first** — CI builds the *pushed* ref, not your local
   tree. `git push` is a live op → user-authorized.
2. `npm run release:check` passes (version parity + changelog 1:1).
3. The user has approved the in-app changelog copy (`copy-review.md` Gate 1).

## Trigger the build — push the `v<ver>` tag

`build-portable.yml` triggers on **`push: tags: v*`** (and, as a fallback, manual
`workflow_dispatch`). For a release, the tag push is the build trigger. Pushing
the tag is user-authorized — stop first.

```bash
git tag -a v<ver> -m "Cubric Vision v<ver>"
git push origin v<ver>
```

The `push: tags: v*` trigger fires and dispatches the private mpi-ci portable
build. **The tag publishes nothing public on its own** — `build-portable.yml`
(`permissions: contents: read`) only DISPATCHES a private artifact build; the
public GitHub Release is the separate `gh release create` step. Don't create the
release until the artifacts are downloaded and Gate 2 is approved.

**Fallback — rebuild one leg without moving the tag:** if a single OS fails, or you
need a rebuild without re-tagging, dispatch manually by branch ref + version (NOT
a bare SHA — checkout resolves `ref` as a branch/tag name and fails on a raw SHA):
```bash
gh workflow run build-portable.yml --repo MadPonyInteractive/Cubric-Vision \
  --ref master -f ref=master -f version=<ver>
```

Watch it:
```bash
gh run watch --repo MadPonyInteractive/mpi-ci
```

## Download artifacts to the D: Builds folder

When CI finishes, pull the 6 artifacts into the version's build folder:

```
D:\CubricStudio\Vision\Builds\v<ver>\
```

Per OS you get a **full build** and an **update (delta) bundle** — 6 files for 3
OSes (win32, linux, macos-arm64). Names follow the release contract:

```
CubricVision-windows-x64-v<ver>.zip            CubricVision-windows-x64-update-v<ver>.zip
CubricVision-linux-x64-v<ver>.tar.gz           CubricVision-linux-x64-update-v<ver>.zip
CubricVision-macos-arm64-v<ver>.zip            CubricVision-macos-arm64-update-v<ver>.zip
```

(See `docs/releases/github-release-checklist.md` for the canonical asset names
and `docs/releases/portable-distribution-contract.md` for the artifact contract.
Do not ship legacy `CubricStudio`-named assets.)

**Attach all 6 to the GitHub Release** — the full builds are for fresh installs;
the **delta bundles** are how existing users update without redownloading the
engine/models. They run their install's `update-from-zip.<bat|sh|command>` (or the
online `update.<bat|sh|command>`, which pulls the latest GitHub release) and point
it at the bundle. GitHub is the only update source, so the update bundles MUST be
on the release.

## Delete the CI artifacts after a verified download (storage hygiene)

The mpi-ci portable artifacts are ~1.6GB per build and count against the 2GB free
Actions storage quota. Once downloaded to the Builds folder and attached to the
release, the CI copies are dead weight. Delete them **after** confirming the
download landed, never before.

```bash
export MSYS_NO_PATHCONV=1   # Git Bash mangles leading-slash API paths
RUN_ID=$(gh run list --repo MadPonyInteractive/mpi-ci \
  --workflow cubric-vision-portable.yml -L 1 --json databaseId -q '.[0].databaseId')

# 1. Download (into D:\...\Builds\v<ver>\), then VERIFY the files exist locally
gh run download "$RUN_ID" --repo MadPonyInteractive/mpi-ci --dir "D:/CubricStudio/Vision/Builds/v<ver>"
ls -la "D:/CubricStudio/Vision/Builds/v<ver>"   # confirm the 6 files are present + non-empty

# 2. ONLY after the files are confirmed on disk: delete the run's artifacts
for id in $(gh api --paginate "repos/MadPonyInteractive/mpi-ci/actions/runs/$RUN_ID/artifacts?per_page=100" -q '.artifacts[].id'); do
  gh api -X DELETE "repos/MadPonyInteractive/mpi-ci/actions/artifacts/$id"
done
```

Retention is already `retention-days: 3` in the workflow as a backstop, so
skipping this only delays reclaim by 3 days. Deleting Actions artifacts touches
nothing else (git, the GitHub Release, and the Pod image are all separate).

## Notes

- The macOS build matrix is arm64-only — only expect the files CI actually
  produced; don't invent a macos-x64 asset.
- If CI fails one OS leg, the others still produced artifacts; re-run only the
  failed leg via the `workflow_dispatch` fallback above.
