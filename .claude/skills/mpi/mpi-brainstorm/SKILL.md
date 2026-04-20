---
name: mpi-brainstorm
description: Collaboratively explore an idea and design a solution through dialogue — no spec doc needed. Use this whenever the user says "I have an idea", "let's think through this", "brainstorm with me", "help me figure out how to approach X", "what's the best way to do Y", or wants to explore options before committing to implementation.
---

# mpi-brainstorm

Help turn ideas into fully formed designs through natural collaborative dialogue.

Start by understanding the current project context only when needed — only docs/rules relevant to the topic or explicitly called out by the user. Do not exhaustively scan everything.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it. The entire value of brainstorming is catching design mistakes before they become code — rushing to implementation defeats the purpose.
</HARD-GATE>

## Checklist

1. **Explore context only if needed** — check files, docs, or rules only when the topic directly involves them. If nothing is obviously relevant, skip this step.
2. **Ask clarifying questions** — one at a time, understand purpose/constraints/success criteria
3. **Propose 2-3 approaches** — with trade-offs and your recommendation
4. **Present design in sections** — present one section at a time, scaled to its complexity. After each section ask a specific question (e.g. "Does this approach work for you?") and wait for a response before continuing.
5. **Ask: want a plan?** — "Do you want to write a plan for this?" → if yes, invoke mpi-write-plan → session ends

## Context Exploration Rule

Only explore when explicitly needed:
- The topic directly involves a subsystem documented in docs/PROJECT.md
- The user explicitly asks to look at something specific
- The brainstorm reveals a knowledge gap that requires a quick check

Do NOT auto-scan all of CLAUDE.md, rules, docs, or commits upfront. Keep context lean.

## Key Principles

- **One question at a time** — don't overwhelm
- **Multiple choice preferred** — easier to answer than open-ended
- **YAGNI ruthlessly** — remove unnecessary features
- **Explore alternatives** — always propose 2-3 approaches before settling
- **Incremental validation** — present one section of the design, get the user's approval, then continue

## End State

After the user approves the design:

1. Ask: **"Do you want to write a plan for this?"**
2. If user says **yes** → invoke `mpi-write-plan`, write the plan, **session ends there**
3. If user says **no** → session ends

**No auto-invocation.** The user is always in control.
