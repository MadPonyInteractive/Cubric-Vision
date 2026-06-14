# MPI-82 Validation

## Phase 1 — local drag-drop + missing guard — ACCEPTED (USER, 2026-06-14)
- Drag-drop LoRA + upscale into configured folder zones (Settings + picker) → file
  copies, list refreshes, model selectable. ✓
- Same-name drop → confirm-replace dialog. ✓
- Remove a folder → referenced model flags red `(missing)`; LoRA blocks generation
  with toast; upscale warns + falls back to SIAX. ✓
- Subfolder LoRA on Windows generates (separator fix). ✓
- Relocated model (subfolder removed, same file at root) heals — not red, loads;
  ambiguous same-name across folders stays red (heal logic verified offline 7/7;
  user skipped the live ambiguous case). ✓
- Regressions fixed + reverified: stuck gallery overlay, PromptBox TDZ, duplicate
  drop zones. ✓

## Phase 2/3 — remote upload + live-Pod verification — PENDING
Gated on the MPI-81 Pod-image rebuild (new `/wrapper/models/upload` endpoint).
Card kept in `doing` / `validating`; remote validation to be done alongside MPI-64
(RunPod remote engine) progress. See plan.md Phase 2/3 + checklist.
