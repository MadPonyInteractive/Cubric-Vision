# Branches, Pull Requests, and Cleanup

Date: 2026-06-09

## Plain-language model

A git branch is a movable pointer to a line of commits. In this repository,
`master` is the trunk: it is the main line of work that release and public
source history should hang from.

People use branches so unfinished work can be isolated. A feature branch lets a
developer make commits, test them, and ask for review without changing `master`
until the work is ready. This matters more for open source because outside
contributors should not push directly to `master`. They normally fork the repo,
create a branch in their fork, push their work, and open a Pull Request. The
maintainer reviews the PR, asks for changes if needed, and merges only the work
that should become part of the project.

The normal lifecycle is:

```text
branch -> commit -> push -> PR -> review -> merge -> delete branch
```

Deleting a branch after it has been merged is normal cleanup. The commits do not
disappear when the branch has already been merged into `master`; the branch name
is just no longer needed as a pointer. Keeping old merged branches around makes
the repo harder to read because it looks like there is unfinished work when
there is not.

## How this applies to Cubric Vision

For Cubric Vision going public, `master` should be the protected trunk. Regular
work should happen in branches and land through Pull Requests. A contributor
does not need write access to the repo to help: they can fork it, branch, commit,
push to their fork, and open a PR back to this repo.

The maintainer's job is to keep `master` trustworthy:

- review PRs before merge;
- require the contributor to explain what changed and how it was tested;
- make sure code follows the project rules in `CLAUDE.md`, `.claude/rules/`,
  and the future `CONTRIBUTING.md`;
- delete merged branches after they are no longer needed.

Branch deletion should be treated as cleanup, not as code deletion, but it still
deserves a last check. Before deleting a branch, verify it is merged into
`master` and has no unique commits that would be lost.

## Recheck performed

Commands run from `c:\AI\Mpi\Cubric-Vision`:

```text
git -c safe.directory=C:/AI/Mpi/Cubric-Vision branch --merged master --all
git -c safe.directory=C:/AI/Mpi/Cubric-Vision branch --all --verbose --no-abbrev
git -c safe.directory=C:/AI/Mpi/Cubric-Vision rev-list --left-right --count master...dev
git -c safe.directory=C:/AI/Mpi/Cubric-Vision rev-list --left-right --count master...backup/raw-gpu-attempt
git -c safe.directory=C:/AI/Mpi/Cubric-Vision rev-list --left-right --count master...mpi-8-linux-engine-bootstrap
git -c safe.directory=C:/AI/Mpi/Cubric-Vision rev-list --left-right --count master...mpi-8/git-auto-provision
git -c safe.directory=C:/AI/Mpi/Cubric-Vision rev-list --left-right --count master...origin/dev
git -c safe.directory=C:/AI/Mpi/Cubric-Vision rev-list --left-right --count master...origin/backup/raw-gpu-attempt
git -c safe.directory=C:/AI/Mpi/Cubric-Vision rev-list --left-right --count master...origin/mpi-8-linux-engine-bootstrap
git -c safe.directory=C:/AI/Mpi/Cubric-Vision rev-list --left-right --count master...origin/mpi-8/git-auto-provision
```

Results:

| Branch/ref | `master` unique | branch/ref unique | Cleanup status |
| --- | ---: | ---: | --- |
| `dev` | 653 | 0 | Safe merged cleanup candidate |
| `origin/dev` | 653 | 0 | Safe merged cleanup candidate |
| `backup/raw-gpu-attempt` | 297 | 0 | Safe merged cleanup candidate |
| `origin/backup/raw-gpu-attempt` | 297 | 0 | Safe merged cleanup candidate |
| `mpi-8-linux-engine-bootstrap` | 37 | 0 | Safe merged cleanup candidate |
| `origin/mpi-8-linux-engine-bootstrap` | 37 | 0 | Safe merged cleanup candidate |
| `mpi-8/git-auto-provision` | 20 | 0 | Review first; local and remote refs differ |
| `origin/mpi-8/git-auto-provision` | 21 | 0 | Review first; local and remote refs differ |

Interpretation: all listed branches are merged into `master`; none has unique
work outside `master`. The first three branches are ordinary cleanup candidates.
`mpi-8/git-auto-provision` is also merged, but because the local branch and
remote branch point at different commits, it should be reviewed separately
before deletion instead of included in the first cleanup set.

## Proposed deletion set, pending maintainer confirmation

Safe merged cleanup:

```text
git push origin --delete dev
git push origin --delete backup/raw-gpu-attempt
git push origin --delete mpi-8-linux-engine-bootstrap
git branch -d dev backup/raw-gpu-attempt mpi-8-linux-engine-bootstrap
```

Deferred for review:

```text
mpi-8/git-auto-provision
```

## Deletion completed after explicit approval

The maintainer explicitly approved deleting:

```text
dev
backup/raw-gpu-attempt
mpi-8-linux-engine-bootstrap
```

Final pre-delete checks still showed zero branch-unique commits for the local
and remote refs. Remote refs were deleted first, then local refs.

Verification after deletion:

```text
git -c safe.directory=C:/AI/Mpi/Cubric-Vision branch --all --verbose --no-abbrev
```

Remaining refs:

```text
master
mpi-8/git-auto-provision
origin/master
origin/mpi-8/git-auto-provision
```

`mpi-8/git-auto-provision` remains deferred for separate review.
