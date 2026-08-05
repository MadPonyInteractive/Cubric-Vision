# Kanban private scratch

**Everything in this folder except this README is gitignored.** It is where card-adjacent
material lives when the card itself cannot hold it, because `.agents/mpi-kanban/` is tracked
and pushed to a public repo — see `.claude/rules/kanban.md` § "The board is PUBLIC".

Reference it from a card by path, never by content:

```markdown
Detail held outside the card: `.agents/mpi-kanban/private/<topic>/`
```

## What goes here

Working notes that should not be published but carry no legal weight — operational detail,
host and endpoint notes, draft correspondence, anything you would not want indexed but would
not lose sleep over.

## What does NOT go here

**Material under an actual confidentiality undertaking, third-party legal correspondence,
credentials, or personal data belonging to someone else.** A `.gitignore` is one `git add -f`,
one misconfigured tool, or one `git clean -x` away from failing. Those go **outside every git
root**:

```text
C:/AI/Mpi/_private/<topic>/
```

`C:/AI/Mpi/` is not a repository, so nothing there can be staged by accident.

Current occupant of that path: `minimax-h3-licence/` — the MiniMax H3 licence request and
authorization, held out-of-tree because the request carries a confidentiality undertaking
(MPI-449).

## Rule of thumb

Would leaking it be *embarrassing*, or would it be a *breach*? Embarrassing lives here.
Breach lives outside the repo.
