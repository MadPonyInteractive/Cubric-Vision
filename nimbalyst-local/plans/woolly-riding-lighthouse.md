# Plan: Install notebooklm-py Skill for Claude Code

## Context

Fabio wants to integrate notebooklm-py with Claude Code so that Claude can ask NotebookLM questions and use the results directly in conversation. The package ships with a Claude Code skill that provides a `/notebooklm` slash command.

## Steps

1. **Install the package**
   ```bash
   pip install notebooklm-py
   ```

2. **Install the Claude Code skill** (this copies skill files to `~/.claude/skills/notebooklm`)
   ```bash
   notebooklm skill install
   ```

3. **Authenticate** — run `notebooklm login` and follow browser OAuth flow (Google account)

4. **Restart Claude Code** to pick up the new skill

5. **Verify** — type `/notebooklm` in Claude Code to confirm it's registered

## What you can then do in Claude Code

- `/notebooklm create "Marketing Research"` — create a notebook
- `/notebooklm source add <url>` — add sources (URLs, PDFs, YouTube)
- `/notebooklm ask "What are the main themes?"` — chat with sources
- `/notebooklm generate audio --wait` — generate audio overview

## Token cost note

Claude Code tokens are consumed only when you interact with Claude. The actual NotebookLM API calls use Google's infrastructure. No extra Anthropic tokens are burned beyond your normal conversation context.