---
name: mpi-brief-rule
description: >
  Extract and return the Sub-Agent Briefing section from any MpiAiSuite rule file.
  Used by the main agent to inject rule briefings into sub-agent prompts at dispatch time.
user-invocable: true
---

# mpi-brief-rule Skill

Extract and return the Sub-Agent Briefing section from any MpiAiSuite rule file.

## Specification

**Purpose:** Provide a D4 (Agent → Sub-Agent) dispatch mechanism to inject rule briefings into sub-agent prompts without manual copy-paste.

**Invocation:**
```
/mpi-brief-rule <rule_name>
```

Where `<rule_name>` is one of the rules documented in `CLAUDE.md` Sub-Agent Rule Injection Map (see below).

## Supported Rules

Rules with `## Sub-Agent Briefing` sections:

- `components` → `.claude/rules/components.md`
- `dos_and_donts` → `.claude/rules/dos_and_donts.md`
- `events` → `.claude/rules/events.md`
- `state` → `.claude/rules/state.md`
- `comfy_injection` → `.claude/rules/comfy_injection.md`
- `comfy_engine` → `.claude/rules/comfy_engine.md`
- `workspaces` → `.claude/rules/workspaces.md`
- `component-mounts` → `.claude/rules/component-mounts.md`
- `component-events` → `.claude/rules/component-events.md`
- `component-state` → `.claude/rules/component-state.md`
- `component-comfy` → `.claude/rules/component-comfy.md`
- `downloads` → `.claude/rules/downloads.md`

## Implementation

### Process

1. Accept `rule_name` argument (required)
2. Resolve to file path: `.claude/rules/<rule_name>.md`
3. Read the file using the `Read` tool
4. Extract text between `## Sub-Agent Briefing` header and the next `##` heading
5. Return the extracted text verbatim (as markdown block)
6. If no briefing section exists or file not found, return clear error

### Error Handling

**File Not Found:**
```
Error: Rule file not found: .claude/rules/<name>.md
Available rules: components, dos_and_donts, events, state, ...
```

**No Briefing Section:**
```
Error: No "## Sub-Agent Briefing" section in .claude/rules/<name>.md
This rule does not support sub-agent dispatch.
```

**Invalid Rule Name:**
```
Error: Invalid rule name: "<name>"
Valid rules: components, dos_and_donts, events, state, comfy_injection, comfy_engine, workspaces, component-mounts, component-events, component-state, component-comfy, downloads
```

## Usage Example

**Query:**
```
/mpi-brief-rule components
```

**Response:** (extracted verbatim from components.md)
```markdown
## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves creating or modifying components.

- **All components MUST use `ComponentFactory.create()`** — never build a component by hand.
- ...
```

## Notes

- This skill is read-only and non-destructive.
- The briefing text is copied verbatim with no modifications.
- Briefing sections may contain markdown formatting; return as-is.
- Used by main agents to brief sub-agents without manual context passing.
- This skill is invoked BY the main agent when dispatching sub-agents — not by user directly, though user-invocable for testing.
