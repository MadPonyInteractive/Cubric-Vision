# MPI-264 — Validation

## Auto-verified (Playwright, live app on :3000)
- Hover a rail button → `MpiPopup` mounts on the RIGHT with the tool name, caret present.
- Button icon NOT wiped on hover (fixed: mount into throwaway div, not the anchor).
- Tooltip gone on mouseout; no orphan `.mpi-popup` after component destroy mid-hover.
- Compact skin applied: font `--t-sm` (13px), padding `0.3rem 0.55rem` (was 1rem).
- `transition-property: opacity, transform` — no big→small shrink animation.
- Rail icons 18px (was 16); rail column 72px (was 64); "TRANSFORM" label no longer clips.

## User-verified
User confirmed live ("perfect", "awesome 🤘") across the tooltip, compact skin,
transition fix, font size, and the rail icon/width polish.

## Scope note
Original card = hover tooltip only. Session also landed two user-requested polish
tweaks in the same surface: rail icons 16→18px and rail column 64→72px
(MpiGroupHistoryBlock.css) so the "TRANSFORM" label stops touching the edge.
