# Cubric Vision close-out steps

Run by `mpi-end-session` § 7 (project extension point) — after the shared passes,
before the commit. These are the release mechanics the generic pack does not know
about.

Pointers, not auto-edits: surface a one-line proposal per affected file and wait
for explicit per-file approval, same discipline as the rest of close-out. If
nothing drifted, say so in one line.

> Was `.claude/skills/mpi-end/SKILL.md` until 2026-08-09. That wrapper's other
> halves — the coordination scope gate, the knowledge-healing pass, and the
> `validating`-is-not-a-parking-space rule — now ship inside `mpi-end-session`
> (§ 0, § 3, § 6), so only the project half survives here.

## Release-awareness check (do NOT skip)

Diff THIS session's changes (working tree, or the session's commit(s) if the
commit step already ran) and ask, per the kind of work that landed:

### Resolve WHICH file first: run `gh release list | head -3`

A version with a tag/release has FROZEN notes — `RELEASE_NOTES['<that version>']`
in `js/data/releaseNotes.js` is as archival as
`docs/releases/YYYY-MM-DD-vX.Y.Z.md`, and writing into it describes features that
are in no build the user can install. New user-facing work ALWAYS goes to
`docs/releases/UNRELEASED.md`, which `/mpi-version-bump` folds into the next
version. **`package.json` version is NOT the signal** — it reads `1.2.0` both
while 1.2.0 is in development and after 1.2.0 ships. A handoff or card naming a
version is a claim to verify, not an instruction: this check exists because
MPI-356 wrote two entries into `RELEASE_NOTES['1.2.0']` on a handoff's say-so,
three days after v1.2.0 was published.

### Unreleased changelog (`docs/releases/UNRELEASED.md`)

Did this session add a user-facing change (new feature, fixed bug, behaviour
change) that belongs in the next release notes? OR does an EXISTING entry now
contradict what shipped — a feature reverted, renamed, replaced, or descoped? If
either, propose the edit to `UNRELEASED.md` (right section: `importantChanges` /
`whatIsNew` / `fixes`) and wait for approval. Stale changelog notes ship silently
— this step exists because a reverted "Wan 2.2 model split" note nearly shipped
after the model was merged back to one.

### A change to an UNRELEASED thing owes no entry

Before writing "X changed from A to B", grep `UNRELEASED.md` and
`js/data/releaseNotes.js` for the FEATURE itself. If it appears only in
`UNRELEASED.md` — or in neither — then no released build contains A, so the line
describes a difference nobody can perceive. Fold the correction into the existing
unreleased entry, or write nothing. This is not the same as the stale-entry check
above: that one catches an entry contradicting what shipped; this catches an entry
describing a delta against something that never shipped. (2026-08-07: proposed
three lines about MiniMax H3's size tier and VRAM floor — for a model that has
never appeared in `releaseNotes.js`.)

### Versioning

Did the change touch anything the version system tracks? Read
`.claude/rules/versioning.md` (then `docs/versioning.md`) FIRST, then check
whether a bump or registry edit is warranted:

- `APP_VERSION` + `package.json` + `package-lock.json` (kept identical) — app release.
- `SCHEMA_VERSION` + migrations + project-creation defaults — project data-shape change.
- Operation/command registries kept aligned: `js/data/commandRegistry.js`,
  `js/core/operationRegistry.js`, `operation_registry.json`, universal workflows,
  model `supportedOps`.
- Engine/provisioning: `dev_configs/system_dependencies.json` + provisioning routes/docs.
- Release notes: `js/data/releaseNotes.js` + `docs/releases/YYYY-MM-DD-vX.Y.Z.md`.

Note: models have NO version field — only operations do. New model weights = a NEW
model id/entry (e.g. "Wan 2.2 Smooth V2"), never a bump on the existing one.

Do NOT bump here. Run `npm run release:check`, then tell the user whether a
`/mpi-version-bump` or a full `mpi-release` (the one GitHub-only release flow)
pass is needed, naming the specific surfaces that drifted.

### Curated pip-set drift (MPI-413) — ONLY when this session touched `dev_configs/node_lock.json` or `js/data/modelConstants/nodesDeps.js`

Run `node scripts/compile-node-deps.mjs --check`. It reports what an
`installRequirements: true` node declares that `dev_configs/python_deps.in` does
not cover; anything reported means the node ships with MISSING dependencies,
because neither engine runs a node's `requirements.txt` any more — both install
the one curated file. Fix by adding the reported packages to `python_deps.in`,
regenerating with `node scripts/compile-node-deps.mjs`, and committing BOTH files
(never hand-edit the `.txt`).

**Why this lives here and not in a hook or the suite:** `--check` FETCHES each
node's `requirements.txt` from `raw.githubusercontent.com` at its pinned commit,
so it cannot go in `node --test` (offline runs would flake) and is too slow for a
pre-commit hook. `tests/curated-python-deps.test.cjs` already guards the
INVARIANTS automatically (no engine-owned torch stack, exactly one opencv
distribution) but it does NOT guard COVERAGE — a newly added node's deps going
missing is invisible to it. The Pod image build's `IMPORT FAILED` grep catches it,
but only when someone builds an image. This step is the gap between those two. The
`/mpi-add-model` playbook has the same step; this catches the hand-edit path that
bypasses the skill.

## Hard rules

- Never bump a version or rewrite release notes from close-out — surface what needs
  a bump and defer to `/mpi-version-bump` or `mpi-release`.
- Never edit the installed plugin. Record a needed pack change as a kanban card so
  an issue can be filed on `MadPonyInteractive/mpi-kanban`.
