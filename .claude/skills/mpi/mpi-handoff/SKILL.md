---
name: mpi-handoff
description: >
  Generate a structured JSON handoff document so work can continue in a fresh session
  without losing context. Invoke when context is large or user wants to start fresh.
user-invocable: true
---

# mpi-handoff Skill

Produces a handoff document at `docs/handoffs/YYYY-MM-DD-HH-MM-<slug>.json` that a fresh
session can load to resume work immediately — no re-explanation needed.

## When to invoke

- User says "handoff", "new session", "start fresh", "context is big", or `/mpi-handoff`
- Context usage is high and work is mid-flight
- A plan phase just completed and a new phase starts next

## Instructions

### Step 1: Gather state from conversation

Extract all of the following from conversation context — do NOT run git commands:

- What was the user originally trying to accomplish?
- What tasks are complete vs pending?
- What is the very next action the fresh session should take?
- Any key decisions, constraints, or gotchas discovered during this session?
- Which plan file is active (if any)?
- Which files were modified or created this session?

### Step 2: Identify the active plan

If a plan file exists in `docs/plans/`, read its current state:
- Note the plan file path
- List completed `[x]` and pending `[ ]` to-dos
- Identify the next `[ ]` item

### Step 3: Write the handoff document

Create file at: `docs/handoffs/YYYY-MM-DD-HH-MM-<slug>.json`

Where `<slug>` is 2-3 words from the goal, hyphenated (e.g., `video-history-support`).

Use this exact JSON structure:

```json
{
  "schema": "mpi-handoff/v1",
  "generated_at": "<ISO-8601 timestamp>",
  "session": {
    "name": "<best description of session>",
    "branch": "<current git branch — from conversation or plan file, not git command>"
  },
  "goal": {
    "original": "<what the user set out to do — verbatim or close paraphrase>",
    "status": "in_progress | blocked | complete",
    "summary": "<1-3 sentence summary of where things stand>"
  },
  "plan": {
    "file": "<path to active plan file, or null>",
    "completed": ["<done item 1>", "<done item 2>"],
    "pending": ["<next item 1>", "<next item 2>"]
  },
  "next_action": {
    "description": "<exact instruction for fresh session — be precise>",
    "command": "<optional: skill or command to run first, e.g. /mpi-execute-next>"
  },
  "context": {
    "key_decisions": [
      "<decision 1 and why it was made>",
      "<decision 2 and why>"
    ],
    "constraints": [
      "<constraint or gotcha 1>",
      "<constraint or gotcha 2>"
    ],
    "files_modified": ["<path1>", "<path2>"],
    "files_to_read_first": ["<path1>", "<path2>"]
  },
  "rules_active": [
    "<rule file that must be read, e.g. .claude/rules/components.md>",
    "<rule file 2>"
  ],
  "resume_prompt": "<A single paragraph the user can paste into a new session to resume. Written in second person, present tense. Mentions the handoff file path.>"
}
```

### Step 4: Print the resume prompt

After writing the file, output to the user:

```
Handoff saved: docs/handoffs/<filename>.json

To resume in a new session, paste this:
---
Read docs/handoffs/<filename>.json and continue from where we left off.
The next action is: <next_action.description>
---
```

## Output format

- File: `docs/handoffs/YYYY-MM-DD-HH-MM-<slug>.json` (create `docs/handoffs/` if needed)
- Console: Short confirmation + resume prompt block (see Step 4)
- Do NOT dump the full JSON to console — just the resume prompt

## Important

- `resume_prompt` must be self-contained. Fresh session has zero memory.
- Include the handoff file path in `resume_prompt` so the agent can load it with `Read`.
- `files_to_read_first` = files the fresh agent must read before touching code.
- `rules_active` = rule files relevant to pending work (from CLAUDE.md Context Router).
- NO git commands. Work is mid-flight and uncommitted — git state is irrelevant.
