---
schema: mpi-kanban/project-profile/v1
mode: scalable-foundation
mode_rationale: user-confirmed at setup and re-confirmed 2026-08-09; strong repo evidence (21 .claude/rules, docs/ tree with a routing map, schema versioning, CI on push, 0 board violations)
mode_source: user
pack_version: 1.1.1
push_policy: auto
setup_date: 2026-05-23
last_refresh: 2026-08-13
last_refresh_notes: Refresh on Mpi-Kanban 1.1.1. Board validation was FAILING on MPI-550 (status `active` in `done`, plus four `links` naming files that were never created) - both repaired, validator now passes. State index pruned - `active_handoffs` held 9 records where only 1 was live, and `pending_file_states` held 10 paths whose claim records were all `complete`/`verified`; three handoff files carried a status their card had outgrown. Seven dead memory pointers in the knowledge index repointed. Consolidation sweep on 62 `todo` cards created two umbrellas - MPI-552 (the LTX v2v Flow trio, all three blocked on MPI-531) and MPI-553 (upscalers leave the model picker, strict 506 -> 507 -> 515 ordering). Verified clean and left alone: `.agents/mpi-kanban.local.md` (19 listed rules == 19 rules carrying a briefing section), `behaviour.md` (byte-identical to the 1.1.1 template), the three worker archetypes, and the project's own `guard-shell-backticks.py`, which is still NOT a duplicate - 1.1.1's `guard-shell.py` has only heredoc and continuation rules.
prior_refresh_notes: Mpi-Kanban 1.0 migration (MPI-492). The pre-1.0 skills pack is gone and the plugin's six hooks now enforce what CLAUDE.md hand-documented - the pre-authorization, claim, next_id and destructive-git bullets were deleted and named to their hooks. The `.claude/skills/mpi-end/` wrapper was split: its pack half now ships in `mpi-end-session`, its release-awareness half moved to `.agents/mpi-kanban/close-out.md`. Duplicate `guard-destructive-git.py` retired. Added `.claude/rules/behaviour.md` and three worker archetypes. push_policy recorded as auto per the user, 2026-08-09.
knowledge_index: .agents/mpi-kanban/project-knowledge-index.md
---

# Project Profile

## Project Summary

Cubric Vision is a desktop Electron app that wraps ComfyUI as its generation engine for local open-source image and video creation. Users manage projects (history, models, LoRAs) through a 3-workspace UI (Landing → Gallery → Group History). Vision generates image, video AND audio — LTX 2.3 emits video+audio jointly and takes reference audio in, and further audio work folds in as Flows rather than a separate app (MPI-573, 2026-08-17). Prompt-gen is the one capability that lives in a sibling app (Cubric Prompt). Out of scope here is STANDALONE audio tooling, not audio itself.

## Architecture Summary

Architecture: Electron shell + Express server + vanilla-JS SPA — full map in `docs/PROJECT.md`.

## Conventions

See `CLAUDE.md` § "Critical Rules Snapshot" for the canonical list (BEM, ComponentFactory, no hardcoded colors, state proxy, project JSON writes, logging, kanban auth, claim files before editing, no destructive git on a shared tree, commit by pathspec — never `add -A`). Architecture rules live in `.claude/rules/*.md`.

## Important Commands

- `npm start` — launch Electron app
- `npm run server` — run Express server only (no Electron)
- `npm run test:desktop` — Playwright Electron tests (sets `CUBRIC_E2E_USER_DATA`)
- `npm run lint` / `npm run lint:components` — ESLint
- `npm run release:deps` — dependency audit leg of the release gate
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
- Sibling repos (Website, Docs) need new Stage design ported; design source at `c:\AI\Mpi\CubricStudio_Redesign\` (no git).

## Mode Notes

- 2026-05-23: scalable-foundation. New work follows full guardrails (rules, BEM, factory, events, state proxy). No prototype shortcuts.
- 2026-08-09: re-confirmed by the user at refresh — "this is a huge project". Unchanged.
