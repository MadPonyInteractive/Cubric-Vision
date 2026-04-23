---
name: mpi-write-plan
description: Decompose a complex goal into a structured plan file using parallel sub-agents for investigation. Use this whenever the user describes a multi-step feature, a non-trivial bug fix with unclear root cause, or says "write a plan", "make a plan for this", "plan out X", or "I need to implement Y" and the goal has multiple moving parts.
---

# mpi-write-plan Skill

## Purpose
Decomposes a complex goal into to-dos using parallel sub-agents during the investigation phase only. Outputs a structured plan file.

## Core principle
**Parallel sub-agents ONLY in investigation. Execution is always sequential.**

Parallel investigation is safe because sub-agents only read and write findings — they never touch the codebase. Execution must be sequential because each to-do may depend on the previous one, and the user needs to verify each step before the next begins.

## Key rules
1. Sub-agents write findings to files — they do NOT implement
2. Investigation phase: parallel. Execution phase: sequential (via `/mpi-execute-next`)
3. To-dos must be independently verifiable — each is a single, focused task
4. Plan file must be in `docs/plans/YYYY-MM-DD-<slug>.md` format
5. **No forward dependencies.** A to-do's verify step must be satisfiable using only what exists after *that* to-do completes — never after a later one. If step A can only be verified once step B (which comes later) is done, merge A into B.

## To-do decomposition principle

**Err on the side of fewer, larger to-dos.** Split only when there is a clear reason:

- Split if one to-do depends on a prerequisite being complete first
- Split if the verification for each is meaningfully different and testable at different stages
- Split if the same file needs unrelated changes that could conflict

**Do NOT split just because:**
- It's multiple CSS rules — group CSS changes to the same file/feature into one to-do
- It's multiple utility functions in the same file
- It's several small related tweaks

If two tasks are in the same file and related, they belong in the same to-do. One to-do, one file, one commit.

## Verification step rules

Every to-do **must end with a `**Verify:**` line** — no exceptions. The verify step must be **actually testable at that stage of implementation:**

- **If the UI exists at that point** — describe what the user should click/toggle/see
- **If the UI doesn't exist yet** — frame the verification as a console.log check: `**Verify:** Look in browser dev tools console for "..."`
- **If the feature cannot be tested at all** (e.g., purely structural code) — write: `**Verify:** Look at the code — confirm the [specific thing] is present and correct`

**The agent executing the to-do should add `console.log(...)` calls where needed during implementation, then tell the user what log to look for.** The plan's verification step is the source of truth for what to look for.

Never write a verification step that assumes the UI being built by that same to-do already exists.

### The most common forward-dependency failure

A prop or API is *added* in step N but can only be *seen working* after step M (which comes later) passes it in. Step N's verify then silently assumes step M is done. Fix: move step N's code changes into step M, or merge the two to-dos. The rule of thumb: if you can't demo the change without writing code from a later step, it doesn't belong in its own to-do.

## Usage
`/mpi-write-plan` — describe goal → parallel investigation → synthesize plan

## Workflow
1. User describes goal
2. Identify investigation areas (2-4)
3. Spawn parallel sub-agents, each writes to `/tmp/investigation/<area>.md`
4. Synthesize findings into a draft list of to-dos
5. **Self-audit before writing the file** — for each to-do in order, ask:
   - "Can this be verified *right now* without completing any later to-do first?"
   - If no → merge it into the to-do it depends on (or move it after that to-do)
   - "Does this to-do have an explicit `**Verify:**` line?"
   - If no → add one
6. Write the plan file with [ ] to-dos
7. User reviews plan before moving to execution

## Related commands
- `/mpi-execute-next` — executes to-dos one at a time with brief gate
