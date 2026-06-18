---
schema: mpi-kanban/project-profile/v1
mode: scalable-foundation
mode_rationale: user-confirmed at setup; strong repo evidence (17 .claude/rules, 10 docs/, schema versioning, husky CI, kanban archives)
mode_source: user
setup_date: 2026-05-23
last_refresh: 2026-06-18
last_refresh_notes: knowledge-index re-synced — all 88 memory files wired into topics, 8 topics added (RunPod, Pod image/mpi-ci, Build/release, macOS, Release ops, Cross-project, Conventions, derived dev_mode); all doc "Read first" pointers verified present; promotion audit found durable architecture facts already live in docs (project-integrity/versioning/comfy) so memory stays as war-story companions, no promotion. Prior (2026-06-05): validated board/state, archived orphan MPI-1/MPI-5.
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
- `npm run release:check` — mandatory release-health gate before bump builds, pre-release generation tests, tags, pushes, or publication
- `npm run build:portable:win` — build full Windows portable artifact (single source `scripts/build-portable.mjs`; `:linux` / `:mac` target other platforms via `--platform`/`--arch`). Stages to `D:\tmp\cubric-portable` (C: is space-constrained; never stage inside the repo — the script refuses it). Windows portable is install-validated (fresh install + model download + generation). Default launchers are no-terminal (`start.vbs` / `start.sh`); `*-with-terminal` variants exist for diagnostics. Linux/macOS staging and the update path are not real-host validated (update flow tracked in MPI-49). Tracked in MPI-8.
- Read `logs/app.log` tail (offset, never full) for runtime debugging
- `node scripts/convert-images.cjs --prefix=<name> --out=<name>` — batch PNG/JPG → WebP for sibling website carousels (defaults: brand-assets marketing-media → website vision-media, quality 85). See [[tool-website-image-converter]] memory.

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
