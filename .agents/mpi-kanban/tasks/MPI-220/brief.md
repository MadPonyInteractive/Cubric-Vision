# MPI-220 — Delete RunPod branch, rename 1.2 → 1.1

## Goal
Kill the `RunPod` branch (local + remote). Rename `1.2` → `1.1`. Nothing else.

## Why
- `master` = released v1.0.1.
- `RunPod` = was going to be v1.1, but has bugs.
- `1.2` = the continuation of RunPod; the RunPod-impacting fixes now live on `1.2`.
- So `RunPod` is dead weight. `1.2` inherits the `1.1` name and ships as the
  next release after master **later** (that release is OUT OF SCOPE for this card).

## Precondition — MUST BE TRUE
1. `git log RunPod --not 1.2 --oneline` returns **empty** — i.e. RunPod has
   NO commits that are missing from 1.2. If it returns anything, STOP and ask
   the user: those commits die with the branch. (Fixes were said to live on
   1.2, so expect empty — but verify, don't assume.)

(The user assigns this card only after the 1.2 agents are finished, so no
"wait for agents" gate is needed here.)

## State captured at card creation (2026-07-07)
- Local branches: `1.2` (current), `RunPod`, `master`.
- Remote branches: `origin/1.2`, `origin/RunPod`, `origin/master`.
- `1.2` tracks `origin/1.2` (already pushed).
- No `1.1` branch anywhere — the name is free.
- `appVersion.js` / package.json version: NOT part of this card. Do not touch.

## Steps (run from repo root `c:\AI\Mpi\Cubric-Vision`)

```bash
# 0. Verify preconditions
git checkout 1.2
git status                       # expect clean (or user-approved)
git log RunPod --not 1.2 --oneline   # MUST be empty; else STOP + ask user

# 1. Delete RunPod locally
git branch -d RunPod             # -d (safe): fails if unmerged. If it refuses
                                 # AND step-0 confirmed no unique commits, use -D.

# 2. Rename 1.2 -> 1.1 (local)
git branch -m 1.2 1.1

# --- everything below is a PUSH = user-authorized live op. Get the OK first. ---

# 3. Push new 1.1 and set upstream
git push -u origin 1.1

# 4. Delete old remote branches
git push origin --delete RunPod
git push origin --delete 1.2

# 5. Verify
git branch -a                    # expect: 1.1, master (+ origin/1.1, origin/master)
git remote prune origin          # drop stale remote-tracking refs
```

## Gates / safety
- **Push is user-authorized.** Do NOT run steps 3–5 without the user's explicit
  go-ahead (repo push policy). Steps 0–2 are local-only and safe.
- **`-d` before `-D`.** Let git's merge check be the backstop. Only force-delete
  after step-0 proves RunPod has no unique commits.
- No CI/branch-protection assumed on `1.2`/`RunPod`. If a rule blocks the remote
  delete, surface it — don't force.
- `1.2` open PRs, if any, will need re-pointing to `1.1` (none known at card time).

## Out of scope
- Any version bump (appVersion.js, package.json). Branch rename ≠ version change.
- Promoting 1.1 to master / cutting the next release. Separate future work.
