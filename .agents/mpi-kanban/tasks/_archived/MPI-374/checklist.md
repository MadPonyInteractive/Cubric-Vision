# MPI-374 Checklist — UI size must survive a restart

Picked up under **MPI-450 Gate A**. Promoted by 1.4: this release deleted the
Ctrl+wheel UI-zoom handler (MPI-432, macOS pinch collision), so Ctrl+plus /
Ctrl+minus is now the *only* UI-size control — and it forgets itself on every
launch. Without this, a large-UI user is worse off in 1.4 than in 1.3.1.

- [x] Key declared in `js/core/storageKeys.js` (`UI_ZOOM_FACTOR`), not inlined
- [x] Typed accessors on `Storage` in `js/core/storage.js`
- [x] `applyUiZoom()` persists the factor it just applied
- [x] `restoreUiZoom()` applies the stored factor, clamped to [ZOOM_MIN, ZOOM_MAX]
- [x] Restore runs at `js/init.js` module top level — before `init()` awaits anything, so no resize after first paint
- [x] Browser Mode (no `webFrame`): restore no-ops, nothing is persisted
- [x] Corrupt / out-of-range stored value falls back to 1.0 instead of wedging the UI
- [x] Unit test covers clamp + corrupt-value fallback and fails against the unfixed code
- [ ] User check in the desktop app: change UI size, restart, size is exactly as left
