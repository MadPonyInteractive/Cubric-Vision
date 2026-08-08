---
schema: mpi-kanban/project-profile/v1
mode: scalable-foundation
mode_rationale: user-confirmed at setup; strong repo evidence (17 .claude/rules, 10 docs/, schema versioning, husky CI, kanban archives)
mode_source: user
setup_date: 2026-05-23
last_refresh: 2026-08-04
last_refresh_notes: Dead card pointers (MPI-8, MPI-49) removed - neither exists on the board or in either archive. Platform-validation and install-gate claims corrected against the 1.3.0 release. Release commands completed.
knowledge_index: .agents/mpi-kanban/project-knowledge-index.md
---

# Project Profile

## Project Summary

Cubric Vision is a desktop Electron app that wraps ComfyUI as its generation engine for local open-source image and video creation. Users manage projects (history, models, LoRAs) through a 3-workspace UI (Landing → Gallery → Group History). Sibling Cubric apps cover audio + prompt-gen separately; this repo is image/video only.

## Architecture Summary

Architecture: Electron shell + Express server + vanilla-JS SPA — full map in `docs/PROJECT.md`.

## Conventions

See `CLAUDE.md` § "Critical Rules Snapshot" for the canonical list (BEM, ComponentFactory, no hardcoded colors, state proxy, project JSON writes, logging, kanban auth, claim files before editing, no destructive git on a shared tree, commit by pathspec — never `add -A`). Architecture rules live in `.claude/rules/*.md`.

## Important Commands

- `npm start` — launch Electron app
- `npm run server` — run Express server only (no Electron)
- `npm run test:desktop` — Playwright Electron tests (sets `CUBRIC_E2E_USER_DATA`)
- `npm run lint` / `npm run lint:components` — ESLint
- `npm run release:check` — mandatory release-health gate before bump builds, pre-release generation tests, tags, pushes, or publication
- `npm run release:notes` — generate the release notes; `npm run release:approve -- --yes` approves them non-interactively (the old `printf 'y\n' |` pipe is blocked by the Bash classifier and reads as a hang)
- `npm run build:portable:dry-run` — stage-and-verify without producing the artifact
- `npm run build:portable:win` — build full Windows portable artifact (single source `scripts/build-portable.mjs`; `:linux` / `:mac` target other platforms via `--platform`/`--arch`). Stages to `D:\tmp\cubric-portable` (C: is space-constrained; never stage inside the repo — the script refuses it). Windows portable is install-validated (fresh install + model download + generation). Windows launches from a root `CubricVision.exe` (MPI-387 — `start.vbs`/`start-with-terminal.bat` are DELETED; Smart App Control blocks `.vbs`/`.bat` outright on a clean Windows 11). Linux/macOS still use `start.sh`. All three platforms are now real-host validated: Linux live (MPI-198, 2026-07-31), macOS on the rented Mac (MPI-414), and the in-app update flow end to end — fetch, spawn, apply, `evictBusyFile`, relaunch (MPI-334 → MPI-422, 2026-08-03; recipe in `docs/releases/portable-distribution-contract.md` § In-app update prompt).
- `node scripts/compile-node-deps.mjs [--check]` — MANDATORY when adding or bumping a custom node with `installRequirements: true` (MPI-413). `--check` reports what the node declares that `dev_configs/python_deps.in` does not cover; bare regenerates `dev_configs/python_deps.txt`, the single curated set the local engine installs in one `--no-deps` pass. Commit both files; never hand-edit the `.txt`. Full step: `docs/playbooks/add-model/02-dependencies-r2.md`.
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
- ~~Portable distribution / install flow gated~~ — CLOSED 2026-08-01: 1.3.0 published on GitHub with 5 artifacts (3 full + 2 update bundles), docs site live, all social surfaces posted. The Windows update bundle was built and verified but deliberately not shipped — the 1.2.0-era updater cannot apply it.
- Sibling repos (Website, Docs) need new Stage design ported; design source at `c:\AI\Mpi\CubricStudio_Redesign\` (no git).

## Mode Notes

- 2026-05-23: scalable-foundation. New work follows full guardrails (rules, BEM, factory, events, state proxy). No prototype shortcuts.
