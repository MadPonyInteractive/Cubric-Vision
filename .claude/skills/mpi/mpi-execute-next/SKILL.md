---
name: mpi-execute-next
description: Execute the next incomplete to-do from an mpi plan file. Use this whenever the user says "next", "do the next task", "continue the plan", "execute next", or drops/pastes a plan file path and wants to run a to-do. Always gates with a brief before writing code and a verify gate after.
---

# mpi-execute-next Skill

## Purpose
Executes one to-do at a time from the plan in context, with two mandatory gates: brief approval before code, and verify choice after code.

The brief gate exists so the user can catch wrong assumptions before any code is written. The post-implementation gate exists so the user can verify behavior before deciding what to do next. These gates are the entire point of the human-in-the-loop pattern — never skip them.

## Anti-Drift Reminders (READ EVERY INVOCATION)

Three failure modes happen often. Read these every time before acting:

1. **MARK THE BOX.** After Option 1 ("verified"), you MUST edit the plan file and change `[ ]` to `[x]` on the completed to-do. Not optional. Not "later". Do it before sending the next message to the user.
2. **LAST `[x]` TRIGGERS PLAN COMPLETE.** After marking the final to-do `[x]`, you MUST output the "Plan complete" report. Do not stop silently. Do not wait for "next".
3. **GATE 3 VERIFY IS NEVER SKIPPED.** Every implementation ends with the Gate 3 verify block (Files changed / Key changes / Verify / Option 1 / Option 2). No exceptions, even on tiny changes. No proceeding to next to-do without it.

If you finish implementing and feel tempted to just continue → STOP. Output Gate 3.
If you finish marking `[x]` and feel done → check: was that the last to-do? If yes, output Plan complete.

## Gate 1 — Brief (before code)

1. Read the plan file. Find the first `[ ]` incomplete to-do.
2. Read `brief-template.md` for exact brief format.
3. Output brief to user: to-do text, files touched, approach, risk, verify after.
4. End message with: *"Reply 'go' (or 'ok', 'yes', 'proceed') to start implementation."*

**STOP HERE. Do not write code. Do not edit files. Wait for user reply.**

"go" only approves starting implementation. Does NOT approve moving to next to-do.

## Phase 2 — Implementation (only after user replies "go")

Implement to-do exactly as described. While implementing, **add `console.log(...)` calls** where helpful to make verification testable without UI.

## Gate 3 — Post-implementation (MANDATORY — never skip)

After implementation complete, output this verbatim (fill brackets):

---
To-do implementation complete.

**Files changed:** [list files]
**Key changes:** [what was done]

**Verify:**
[Copy the full Verify instruction verbatim from the current to-do in the plan. Do not paraphrase. If you added console.log calls, append: "Also look in browser dev tools console for: [exact log message]"]

**Option 1 — Verified** — say "1" or "verified"
**Option 2 — Keep talking** — say "2" or "keep talking"
---

**STOP HERE. Do not write more text. Do not show next to-do. Do not show next brief. Do not mark the plan. Only valid next action: wait for user Option 1 or Option 2.**

## If user chooses Option 1 (verified)

Do these in order — all of them, no skipping:

1. Remove all console.log calls added during verification (edit the files).
2. **MARK THE BOX:** Open plan file. Change `[ ]` to `[x]` on the completed to-do. **Mandatory. Easy to forget. Do it now, before doing anything else.**
3. Count remaining `[ ]` in plan.

**Branch on count:**

### If `[ ]` count > 0 (more to-dos remain):
Output:
```
To-do [N] done.

What next?
  → "next" — brief for to-do [N+1]
  → "end"  — close this session
```
Wait for user. If "next" → Gate 1 for next to-do. If "end" → Session end below.

### If `[ ]` count == 0 (this was last to-do):

**MANDATORY** — output Plan complete report. Do not stop silently. Do not skip this:

```
Plan complete. All to-dos done.

Suggested next steps:
  1. Run /mpi-component-audit to check for ESLint violations
  2. Commit and push when ready
```

## If user chooses Option 2 (keep talking)
- Do nothing. Stay in conversation.
- Wait for user instruction.
- Append once: *"Context getting large? Run `/mpi-handoff` before starting a new session."*

## Session end (user says "end" mid-plan)
Output:
```
Session closed. [N] of [total] to-dos done.
Resume next session with: /mpi-execute-next <plan-path>
Context getting large? Run /mpi-handoff first.
```

## Pre-conditions
Plan file path is available if any of these are true:
- User passed it as argument
- User pasted or mentioned path in current conversation
- A `.md` plan file is visible in current context

Read plan file immediately — do not ask if path is visible.

## If no plan path is visible anywhere
Ask: **"Which plan should I use? Please drop or paste the plan file path."** Stop.

## If all to-dos are [x]
Output Plan complete report (see above). Do not re-execute.

## Critical rules

These protect the human-in-the-loop contract. Breaking either gate defeats the system.

1. **Brief gate is mandatory.** Never implement without brief + "go" reply.
2. **Gate 3 verify is mandatory.** Never skip Option 1 / Option 2 block. Never show next to-do's brief before user replies to Gate 3.
3. **Gate 3 Verify line must come from plan.** Copy `**Verify:**` verbatim. No paraphrase.
4. **Mark `[x]` after Option 1.** Always. Before the next message.
5. **Last `[x]` always triggers Plan complete report.** Always. No silent stop.
6. **One to-do at a time.**
7. **Execution is always sequential.**
8. **Do not modify plan except to mark `[x]` after Option 1.**
9. **No git commits.** User's responsibility at end of plan.
10. **No git push.**

## Self-check before sending each message

Before sending any message to user, verify:
- Just finished implementation? → message must be Gate 3 verify block.
- Just marked `[x]`? → check if last to-do; if yes, message must be Plan complete report.
- About to start implementation? → only if last user reply was "go" (or affirmative to brief).

## Related commands
- `/mpi-quick-plan` — create new empty plan
- `/mpi-write-plan` — create plan from complex goal
- `/mpi-component-audit` — ESLint check before committing
- `/mpi-handoff` — generate handoff doc when context is large
