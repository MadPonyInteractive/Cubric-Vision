---
name: mpi-execute-next
description: Execute the next incomplete to-do from an mpi plan file. Use this whenever the user says "next", "do the next task", "continue the plan", "execute next", or drops/pastes a plan file path and wants to run a to-do. Always gates with a brief before writing code and a choice after.
---

# mpi-execute-next Skill

## Purpose
Executes one to-do at a time from the plan in context, with two mandatory gates: brief approval before code, and user choice after code.

The brief gate exists so the user can catch wrong assumptions before any code is written. The post-implementation gate exists so the user can verify behavior before the commit is locked in. These gates are the entire point of the human-in-the-loop pattern — never skip them.

## Gate 1 — Brief (before code)

1. Read the plan file. Find the first `[ ]` incomplete to-do.
2. Read `brief-template.md` to get the exact brief format.
3. Output the brief to the user (to-do text, files touched, approach, risk, verify after).
4. End your message with: *"Reply 'go' (or 'ok', 'yes', 'proceed') to start implementation."*

**STOP HERE. Do not write any code. Do not edit any files. Do not continue. Wait for the user to reply before doing anything else.**

"go" (or any affirmative) only approves starting implementation. It does NOT approve committing or moving to the next to-do.

## Phase 2 — Implementation (only after user replies "go")

Implement the to-do exactly as described. While implementing, **add `console.log(...)` calls** where helpful to make the verification testable without UI.

After implementation, report:
- What files changed
- Key changes made
- What console log to look for (if applicable) — "**Verify:** Look in browser dev tools console for: ..."

## Gate 3 — Post-implementation (AFTER implementation, before any next step)

After implementation is complete, output this completion message to the user verbatim (filling in the bracketed parts):

---
To-do implementation complete.

**Files changed:** [list files]
**Key changes:** [what was done]

**Verify:**
[Copy the full Verify instruction verbatim from the current to-do in the plan. Do not paraphrase. If you added console.log calls, append: "Also look in browser dev tools console for: [exact log message]"]

**Option 1 — Verified & commit** — say "1" or "verified"
**Option 2 — Keep talking** — say "2" or "keep talking"
---

**STOP HERE. Do not write any more text. Do not show the next to-do. Do not show the next brief. Do not mark the plan. Do not commit. The only valid next action is waiting for the user to reply with Option 1 or Option 2.**

## If user chooses Option 1 (verified & commit)
Do these steps in order — all of them, no skipping:
1. Remove all console.log calls added during verification (edit the files)
2. Open the plan file and change `[ ]` to `[x]` on the completed to-do (edit the file)
3. Commit all changed files including the plan with a concise message based on the to-do text
4. Do NOT run `git push`
5. Report: "To-do [N] marked done and committed. Run /mpi-execute-next for the next to-do."

## If user chooses Option 2 (keep talking)
- Do nothing. Stay in the conversation.
- Wait for the user to tell you what to do next.

## Pre-conditions
The plan file path is available if any of these are true:
- The user passed it as an argument when invoking the command
- The user pasted or mentioned a path in the current conversation
- A `.md` plan file is visible in the current context

Read the plan file immediately — do not ask if you can see the path.

## If no plan path is visible anywhere
Ask: **"Which plan should I use? Please drop or paste the plan file path."** Stop.

## If all to-dos are [x]
Report: "Plan complete."

## Critical rules

These rules exist to protect the human-in-the-loop contract. The brief prevents wasted implementation effort. The post-implementation gate prevents committing code the user hasn't confirmed. Breaking either rule defeats the purpose of the whole system.

1. **Brief gate is mandatory.** Never implement without presenting the brief and waiting for "go".
2. **Post-implementation gate is mandatory.** Never skip the Option 1 / Option 2 choice. Never show the next to-do's brief before the user replies to Gate 3.
3. **Gate 3 Verify must come from the plan.** Copy the `**Verify:**` line from the current to-do verbatim. Do not substitute it with generic text, do not omit it, do not replace it with a pointer to the next step.
4. **One to-do at a time.**
5. **Execution is always sequential.**
6. **Do not modify the plan except to mark [x] after Option 1 is chosen.**
7. **Do not run `git push`.**

## Related commands
- `/mpi-quick-plan` — create a new empty plan
- `/mpi-write-plan` — create a plan from a complex goal
