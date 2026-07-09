# MPI-113 — Validation

User-verified in-app (2026-06-18). Both gaps closed.

## 1. Inline Stop in history mode — FIXED
History prompt box enables Stop while one of its jobs runs (extend / any pb-dispatched op). `_syncPbGenerating()` mirrors `activeGenerations.listFor('groupHistory', _group.id)` running state into `_pb.el.setGenerating()`, wired into generation:started/complete/error/cancelled + post-mount.

## 2. Draft persistence (text + chips) — FIXED, localized
Prompt text (positive+negative) and durable input-media chips survive gallery↔history nav.

Scope evolved across review (user-driven):
- v1: per-mediaType → rejected (bled across workspaces of same type).
- v2: per-workspace (`gallery`/`history`) → rejected (history bled card→card).
- **final: tagged single slot.** Each slot stamped with card id; restore only on `(saved.id ?? null) === workspaceId` match. Gallery id=null (always matches, persistent). History reuses one slot for all cards → only last-touched card round-trips; any other card opens clean. No per-card map, no growth, no cleanup hooks.

Settings NOT included (user confirmed scope = text+chips only; settings stay per-model project state, shared by design).

## Out of scope (confirmed)
MPI-112 extend reuse-data fix — already shipped before this card.

## Files
- `js/state.js` — `promptDraft`/`promptMedia` tagged-slot session keys.
- `js/components/Organisms/MpiPromptBox/MpiPromptBox.js` — save/restore + `workspaceKey`/`workspaceId` props.
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` — `_syncPbGenerating`, workspaceId=group.id, post-mount re-sync.
- `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` — workspaceKey=gallery, post-mount count re-sync.
- `docs/releases/UNRELEASED.md` — whatIsNew (draft persistence) + fixes (inline Stop).

node logic-checks: per-workspace isolation, tag-match no-bleed, last-touched round-trip, blob exclusion — all pass. eslint clean.
