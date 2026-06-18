---
name: mpi-release-public
description: Publish the current master state of Cubric Vision as a public GitHub release — push the version tag, attach the already-built portable artifacts, and ship the accumulated changelog. Use when the user says "release to public", "publish the release", "make a public release", "cut the public release", "push to GitHub as a release", or indicates the ~1-month pre-release window is over and the matured version should go public. This is the ONLY flow that pushes a git tag and creates a GitHub release; it reuses the existing D: builds (no rebuild) and does not touch Cloudflare.
user-invocable: true
---
# mpi-release-public — promote master to a public GitHub release

After the ~1-month Pro/Early-Access pre-release window, the matured version on
**master** goes public on GitHub. No version bump (master is already at the
shipping version from its patches); no rebuild (reuse the artifacts already in
the D: Builds folder); no Cloudflare changes. The one thing that makes it public:
pushing a `v*` tag, which fires `push: tags: v*` and publishes the release.

Read `mpi-release-shared/SKILL.md` first. Obey **prep-all-then-STOP**: the tag
push is the irreversible public op — stop before it.

## Preconditions

- master is at the version you intend to publish (e.g. `1.0.2`). Confirm
  `git show master:js/core/appVersion.js`.
- The matching builds exist in `D:\CubricStudio\Vision\Builds\v<ver>\` (the same
  artifacts Pro/EA already ran — reuse them, identical bytes).
- `npm run release:check` passes on master.

## Steps

### 1. Assemble the public changelog
The public release note bundles **all accumulated per-version blocks since the
last public release** (changelog accumulates — each patch added its own block).
Example: if `1.0.1` + `1.0.2` shipped since public `1.0.0`, the public release is
`1.0.2` and its notes list both. Assemble from the archival `docs/releases/*.md`
files since the last public tag.

### 2. 🛑 Gate — user reviews the GitHub release body
The release body is user-facing → present it for review/rewrite
(`mpi-release-shared/references/copy-review.md`). Keep within the claim boundary
in `docs/releases/github-release-checklist.md` (image+video gen allowed; no
unshipped-roadmap claims; Vision is local image/video, not an assistant). Include
the platform-disclosure block from that checklist.

### 3. 🛑 STOP — push the tag (the publish trigger)
This is the public, irreversible step. With the user's authorization:
```bash
git tag -a v<ver> -m "Release v<ver>"
git push origin v<ver>
```
The `push: tags: v*` trigger in `build-portable.yml` fires. Per
`project_patreon_patch_train`, a tag is pushed **only** here — never on a patch
or a merge.

### 4. Attach the existing D: builds to the release
Reuse — do **not** rebuild. Upload the full builds **and** delta bundles from
`D:\CubricStudio\Vision\Builds\v<ver>\` as release assets, with the canonical
names from `docs/releases/github-release-checklist.md` (no legacy `CubricStudio`
names). If the tag-triggered CI already attaches them, verify rather than
re-upload.

### 5. Summary + handoff
Report the published tag, release URL, and attached assets. **Comms are out of
scope** — announcement copy (Patreon/Discord/YouTube/Gumroad) is owned by the
MadPony-Identity launch-comms workflow, a separate manual step the user drives.
Note that this public release is what makes the prior pre-release link safe to GC
at the next promote (see `link-model.md`).
