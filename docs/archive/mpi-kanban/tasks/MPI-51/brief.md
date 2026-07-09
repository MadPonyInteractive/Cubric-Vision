# Branch cleanup, contributor onboarding, and rules/docs sync for open source

Created 2026-06-07. The maintainer (Fabio) is newer to git/GitHub workflows and
wants this session to be **partly educational** — explain *why* things are done,
not just do them.

## Part A — Teach: what branches are and why repos use them

Write a short, plain-language explanation (in this card or a docs page) covering:

- What a branch is (a movable pointer to a line of commits; master = the trunk).
- Why teams use them: isolate work-in-progress, review before merging, let many
  people work without stepping on each other.
- **Why it matters for open source:** outside contributors fork the repo, branch,
  and open a Pull Request; maintainer reviews + merges. They do NOT push to master
  directly. Branches + PRs are how untrusted contributions stay safe.
- The lifecycle: branch → commit → push → PR → review → merge → **delete branch**.
  Stale merged branches are clutter; deleting them after merge is normal hygiene.

## Part B — Clean up the two (now three) stale branches

Verified on 2026-06-07 — all are fully merged into master (0 unique commits):

| Branch | State | Action |
|---|---|---|
| `dev` | merged, 618 commits behind master | delete (local + remote) after confirming |
| `backup/raw-gpu-attempt` | merged, 262 behind | delete — it was a backup of an abandoned raw-GPU attempt |
| `mpi-8-linux-engine-bootstrap` | merged this session | delete — feature branch already merged |

Commands (confirm with maintainer first — deletion is the kind of irreversible
action to verify):

```
git push origin --delete dev
git push origin --delete backup/raw-gpu-attempt
git push origin --delete mpi-8-linux-engine-bootstrap
git branch -d dev backup/raw-gpu-attempt mpi-8-linux-engine-bootstrap
```

Double-check nothing references `dev` as a base (CI, branch protection, README).

## Part C — Make the repo contributor-ready

Audit + add what an open-source repo needs so contributors know where they are:

- `CONTRIBUTING.md` — how to set up, branch, run, test, open a PR, code style
  (BEM, ComponentFactory, no hardcoded colors, etc. — the Critical Rules that
  currently live in CLAUDE.md).
- `README.md` — does it orient a newcomer? Build/run instructions, project scope
  (Vision = image/video only), license (AGPL-3.0).
- Issue/PR templates already exist under `.github/` — review they ask for the
  right info (platform, arch, GPU, artifact name, log tail — per MPI-8 work).
- `CODE_OF_CONDUCT.md`, license headers, `SECURITY.md` if wanted.
- Branch protection on master (require PR review) — decide policy.

## Part D — Promote agent memory into committed rules/docs

This is the subtle one. A lot of hard-won project knowledge lives ONLY in private
agent memory (`~/.claude/projects/.../memory/` and `~/.claude/memory/`) and in
`CLAUDE.md` / `.claude/rules/`. External contributors and their AI tools won't see
private agent memory. Sweep memory and decide what should become **committed**
docs/rules so everyone (human + AI) has the same context.

Candidates already in project memory worth reviewing for promotion:

- Models-path-absolute, GPU build selection, dev_mode derivation, portable
  launcher split (MPI-8 runtime knowledge) → likely belongs in docs/ now that
  the code shipped.
- Comfy models path source, extra model folders, cache dedupe → engine docs.
- Component gotchas (radio emits 'select', canvas spinner flags, queue render
  diff, gallery patterns) → already partly in `.claude/rules/`? Verify coverage.
- Backend logger arity, import-depth gotcha → contributor footguns; document.

Rule: do NOT dump raw memory into the repo. Curate — promote what's broadly
useful and stable; leave session-specific or speculative notes in memory.
Per CLAUDE.md, ask before changing `.claude/rules/`.

## Notes / constraints

- Repo is going public, AGPL-3.0, one-repo open source (see project memory
  "Repo distribution & gating"). HF token already scrubbed from history.
- Branch deletion is irreversible-ish (reflog aside) — confirm before running.
- This is a separate session from MPI-8 execution; do not block MPI-8 on it.
