# Component Map — Design Spec
**Date:** 2026-04-11

## Problem

Agents working in MpiAiSuite lack a fast lookup for component wiring:
- Who mounts a component and with what props?
- What events does it emit or listen to?
- Which state keys does it touch?
- What does it inject into ComfyUI workflows?

Without this, agents either over-explore (reading 40+ files) or make incorrect assumptions.

## Solution

4 terse machine-readable rule files in `.claude/rules/`, each covering one concern. A `/update-component-map` slash command regenerates them on demand by dispatching Claude to re-explore the codebase.

## Files

| File | Concern |
|------|---------|
| `.claude/rules/component-mounts.md` | Who mounts what, where, with what props |
| `.claude/rules/component-events.md` | Emitted and listened events per component |
| `.claude/rules/component-state.md` | State key read/write mapping |
| `.claude/rules/component-comfy.md` | ComfyUI injection points and execution flow |
| `.claude/commands/update-component-map.md` | Slash command for regeneration |

## Format Rules

- No prose — tables and structured lists only
- Each file starts with `## Sub-Agent Briefing`
- Idempotent — safe to run `/update-component-map` multiple times

## Maintenance

Run `/update-component-map` when:
- A new component is added
- A component's events, props, state connections, or ComfyUI injection change
- A new workspace is added

The CLAUDE.md documentation drift rule now includes component wiring as a drift trigger.

## Routing

CLAUDE.md Context Router has 4 new entries directing agents to the correct file for each concern. Agents are also directed to these files in the Sub-Agent Rule Injection Map.
