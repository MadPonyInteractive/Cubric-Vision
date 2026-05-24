---
schema: mpi-kanban/project-profile/v1
mode: scalable-foundation
mode_rationale: user-confirmed at setup; strong repo evidence (12 .claude/rules, 12 docs/, schema versioning, husky CI, kanban archives)
mode_source: user
setup_date: 2026-05-23
last_refresh: 2026-05-24
last_refresh_notes: audit pass — collapsed § Conventions to single pointer (CLAUDE.md is canonical); cleared rule duplication
knowledge_index: .agents/mpi-kanban/project-knowledge-index.md
---

# Project Profile

## Project Summary

Cubric Vision is a desktop Electron app that wraps ComfyUI as its generation engine for local open-source image and video creation. Users manage projects (history, models, LoRAs) through a 3-workspace UI (Landing → Gallery → Group History). Sibling Cubric apps cover audio + prompt-gen separately; this repo is image/video only.

## Architecture Summary

- Electron main: `main.js`, `server.js` (Express on 127.0.0.1:3000)
- Frontend SPA: `js/` (components, pages, services, state, shell, router, events)
- Backend routes: `routes/` (comfy, projects, downloadManager, engine, videoConcat, ...)
- Node services: `services/` (ffmpeg binary/thumb/probe, videoConcat)
- ComfyUI engine: `engine/ComfyUI_windows_portable/` (portable, shared via `.engine-config.json` across worktrees)
- Workflows: `comfy_workflows/*.json` (read-only — author in graph editor)
- Projects data: `<Documents>/Cubric Studio/Projects/` (self-contained, portable)

Detail: see `docs/PROJECT.md`.

## Conventions

See `CLAUDE.md` § "Critical Rules Snapshot" for the canonical list (BEM, ComponentFactory, no hardcoded colors, state proxy, project JSON writes, logging, kanban auth, no git commits without ask). Architecture rules live in `.claude/rules/*.md`.

## Important Commands

- `npm start` — launch Electron app
- `npm run server` — run Express server only (no Electron)
- `npm run test:desktop` — Playwright Electron tests (sets `CUBRIC_E2E_USER_DATA`)
- `npm run lint` / `npm run lint:components` — ESLint
- `Start.bat` — Windows quick launch
- Read `logs/app.log` tail (offset, never full) for runtime debugging

## Read First

- `CLAUDE.md` — master routing
- `AGENTS.md` — Codex pointer
- `docs/PROJECT.md` — subsystem orientation hub
- `.claude/rules/dos_and_donts.md` — universal CSS/icon/utility rules
- This profile + `.agents/mpi-kanban/project-knowledge-index.md`

## Open Gaps

- Stage redesign phases 0–10.2 merged (commit `e9b5eb6`); follow-up phases (>10.2) not yet planned.
- Portable distribution / install flow gated — website/docs/social prep proceeds but install claims wait.
- Sibling repos (Website, Docs) need new Stage design ported; design source at `c:\AI\Mpi\CubricStudio_Redesign\` (no git).

## Mode Notes

- 2026-05-23: scalable-foundation. New work follows full guardrails (rules, BEM, factory, events, state proxy). No prototype shortcuts.
