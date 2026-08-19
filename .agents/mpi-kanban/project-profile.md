---
schema: mpi-kanban/project-profile/v1
mode: scalable-foundation
mode_rationale: user-confirmed at setup and re-confirmed 2026-08-09; strong repo evidence (21 .claude/rules, docs/ tree with a routing map, schema versioning, CI on push, 0 board violations)
mode_source: user
pack_version: 1.2.0
push_policy: auto
setup_date: 2026-05-23
last_refresh: 2026-08-19
last_refresh_notes: 'Refresh on Mpi-Kanban 1.2.0. Board validated CLEAN - 0 errors across 167 cards (62/4/101), next_id correct, every maturity column-coherent, all event lines valid. GPU LEASE TURNED ON: `gpu_command_patterns` added to `.agents/mpi-kanban.local.md`, so `guard-gpu` now binds four commands that actually execute a generation (pre_release_test.py, smoke-workflows.mjs except --plan/--self-check, direct POSTs to 8188/48188 /prompt, /connector/generate). Probes, `npm start`, `app:isolated` and `/proxy/prompt` deliberately unmatched. Verified 12/12 both directions, and the guard fired live mid-refresh. The lease is MACHINE-GLOBAL (~/.mpi-kanban/gpu/<index>.lock, kernel flock, no TTL) but enforcement is PER-REPO - a sibling repo with no patterns still walks onto the card. Handoff desync repaired: 10 record files still said `open` after the index recorded them superseded, and MPI-325''s entry said `open` while its file carried the closure note - each fixed toward whichever side held the evidence, then `active_handoffs` pruned 19 -> 3. Three dead memory pointers repointed (all broken by the MPI-574 memory reorg four days after the last refresh). NOT a finding, checked and dismissed: 3 `active` session records looked orphaned but were Fabio''s two live agents plus this one, and `active_sessions: []` is normal - the pack never populates it, `guard-claim` reads the session directory. Card sprawl is NOT a finding either: 11 umbrellas already exist, each with a plan.md naming its members, covering 39 of 62 todo cards. Verified clean: behaviour.md byte-identical to the 1.2.0 template, 19 listed rules == 19 carrying a briefing, snapshot anchor resolves, 3 archetypes match 3 bundles, every profile command resolves in package.json, no pre-1.0 skills pack, no 1.0 migration leftovers.'
prior_refresh_notes: 'Refresh on 1.1.1 (2026-08-13). Board validation was FAILING on MPI-550 (status `active` in `done`, plus four `links` naming files that were never created) - both repaired. State index pruned - `active_handoffs` held 9 records where only 1 was live, `pending_file_states` held 10 already-complete paths. Seven dead memory pointers repointed. Consolidation sweep created MPI-552 and MPI-553; MPI-552 was later merged into MPI-560 and archived (2026-08-16), so only MPI-553 survives. Before that, the 1.0 migration (MPI-492): the pre-1.0 skills pack is gone and the plugin hooks now enforce what CLAUDE.md hand-documented; the `.claude/skills/mpi-end/` wrapper was split, its release half moving to `.agents/mpi-kanban/close-out.md`; duplicate `guard-destructive-git.py` retired; `behaviour.md` and three worker archetypes added; push_policy recorded as auto, 2026-08-09.'
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
- `node scripts/convert-images.cjs --prefix=<name> --out=<name>` — batch PNG/JPG → WebP for sibling website carousels (defaults: brand-assets marketing-media → website vision-media, quality 85).

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
