---
name: mpi-release-shared
description: Shared reference library for the three Cubric Vision release skills (mpi-apply-patch, mpi-release-public, mpi-merge-branches). Holds the build-dispatch, R2-upload, link-model, and copy-review procedures they all reuse. Not a user workflow — agents read its references/ files directly; do not invoke it on its own.
user-invocable: false
---
# mpi-release-shared — release procedure library

Do **not** run this as a standalone workflow. It exists so the three release
skills don't duplicate the build/upload/link mechanics. When a release skill
tells you to "see `references/<x>.md`", read the file in this skill's
`references/` directory.

## The three release skills and how they differ

| Skill | Trigger | Branch | Version digit | GitHub tag? | Cloudflare link | Builds |
|---|---|---|---|---|---|---|
| `mpi-apply-patch` | "apply a patch" | **master** (then fix also onto current dev branch) | **3rd** (`1.0.1→1.0.2`) | NO | reuse **current** minor link, swap files | new (CI) |
| `mpi-release-public` | "release to public" | master as-is | none (ship current) | **YES `v*`** | untouched | **reuse** existing D: builds |
| `mpi-merge-branches` | "merge the branches" | current dev branch → **master** | the minor the branch already carries | NO | **create new** minor link, **GC** prior | new (CI) |

## References (read the one the skill names)

- `references/build-dispatch.md` — dispatch the all-3-OS portable build via mpi-ci CI, download artifacts to the D: Builds folder, what the 6 files are.
- `references/r2-upload.md` — rclone upload to Cloudflare R2, the index.html, verify. Secrets/config paths (never read the secret).
- `references/link-model.md` — the tier-neutral link naming, lifecycle, and garbage-collection rules. The single source of truth for *which* link.
- `references/copy-review.md` — the two mandatory user-review gates (in-app changelog + Cloudflare page). Why agent copy must be rewritten for users.

## Invariants every release skill obeys

- **Prep all, then STOP before each live op.** Code edits, bumps, notes, and the
  copy drafts are fine to do autonomously. PAUSE and wait for the user before:
  `git push`, `gh workflow run` (build dispatch), the tag push, any rclone
  upload, and any rclone delete. These are irreversible / public-facing.
- **Two copy-review gates are mandatory** wherever user-facing text is produced —
  see `references/copy-review.md`. The user rewrites dev-speak into user-speak
  before it ships.
- **Shared git tree.** The dev branch is shared by concurrent agents. Stage by
  explicit pathspec, commit only your own files, never `git add -A`. (See the
  `feedback_shared_tree_commit_hygiene` memory.)
- **Live Pod/secret rules still apply.** Never read `C:\Users\Fabio\.secrets\*`.
  The rclone config path is referenced, never opened.
- The actual file edits for a version bump are owned by the **`mpi-version-bump`**
  skill — release skills call it, they don't re-implement it.
