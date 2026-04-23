---
name: mpi-component-audit
description: >
  Run an ESLint audit on js/components/ and report violations in markdown table format.
  Groups violations by rule ID and file. Does NOT fix — reports only.
user-invocable: true
---

# Component Audit Skill

On-demand ESLint pass for component code. Groups violations by rule, outputs a markdown table,
and prints a summary heatmap showing violation counts per rule (sorted descending).

## When to invoke

Run `/mpi-component-audit` when you need:
- An overview of current linting violations in `js/components/`
- A breakdown of which rules are most violated (heatmap)
- A searchable reference of violations grouped by file and line number
- No fixes — inspection and reporting only

Also invoke at the end of any completed plan execution to verify no new violations were introduced.

## Instructions

### Step 1: Run ESLint

Execute the following command:

```bash
npm run lint:components --format=json 2>/dev/null || eslint js/components/ --format=json --max-warnings=9999 2>/dev/null
```

If both fail, fall back to:

```bash
npm run lint 2>/dev/null
```

Redirect stderr to suppress warnings. Capture the full JSON output.

### Step 2: Parse JSON Output

Process the JSON output to extract:
- `filePath`: relative path to the file
- `messages`: array of violation objects
- Each message contains: `ruleId`, `line`, `message`

Group all violations by `ruleId` (the ESLint rule name). Count violations per rule.

Use JavaScript or Python (via Bash) to parse — do NOT attempt manual parsing.

### Step 3: Build Summary Heatmap

Create a markdown table with two columns:
- **Rule** (the ruleId, formatted as `mpi/<id>` if it's a custom rule, or full name otherwise)
- **Violations** (count of violations for that rule)

Sort the table descending by violation count.

### Step 4: Build Violation Tables by Rule

For each rule (in heatmap order), create a section:

```markdown
### Rule: <ruleId>
| File | Line | Message |
|---|---|---|
| <relative-path-1> | <line-1> | <message-1> |
| <relative-path-2> | <line-2> | <message-2> |
...
```

Paths should be relative to the project root. Lines should be integers. Messages should be the
ESLint violation message text.

### Step 5: Output Full Report

```markdown
## Component Audit Report — <ISO-8601 timestamp>

### Summary Heatmap
| Rule | Violations |
|---|---|
| <rule-1> | <count-1> |
| <rule-2> | <count-2> |
...

<rules sections from Step 4>
```

### Step 6: Print to Console

Output the final markdown to stdout. Do NOT modify any files.

## Output format

- ISO-8601 timestamp (e.g., 2026-04-23T14:30:00Z)
- Markdown headings (## for report, ### for rules)
- Tables with proper alignment and pipes
- Relative file paths (js/components/Foo.js, not absolute)
- Rule names as shown by ESLint (mpi/no-raw-dom-query, etc.)
- Sorted by violation count (highest first)

## Important

**Do NOT modify any files.** This skill reports violations only. No fixes, no edits, no rewrites.
If the user asks for fixes, suggest a separate `/mpi-component-fix` or manual task.
