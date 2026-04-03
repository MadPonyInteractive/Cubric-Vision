# Handoff: MpiOverlay & Stash Pattern 🚀

**Status**: Ready for Phase 4 (Download Manager/Settings)
**Key Files**: `js/components/Primitives/MpiOverlay/MpiOverlay.js`, `js/managers/overlayManager.js`

---

## 🏗️ Architectural Breakthrough: The "Stash Pattern"
To solve the issue of background components (like `MpiRatioSelector`) breaking when an overlay is shown, we now use a non-destructive mounting system within `MpiOverlay.js`.

### How it works:
1.  **Stashing**: When `.show()` is called, the current children of `#tool-container` are moved into a hidden `<div class="mpi-overlay-stash">` instead of being cleared.
2.  **Persistence**: Because the nodes remain in the document, lifecycle observers (`MutationObserver`) and Portals (Popups) **do not unmount**.
3.  **Restoration**: When `.hide()` is called, the stashed nodes are moved back to their original position instantly.
4.  **Safety Release**: The **Safety Release** logic in `MpiOverlay` now handles unmounting during navigation. If the user navigates to a new tool while an overlay is open, the overlay automatically releases the `OverlayManager` queue.

---

## 📡 Global Events added: `ui:close-all-popups`
To prevent "ghost" popups from floating over blocking overlays:
- **`OverlayManager.js`** emits `ui:close-all-popups` whenever an overlay shows.
- **`MpiPopup.js`** and **`MpiRatioSelector.js`** now listen to this and close their floating UI automatically.

> [!TIP]
> Use this event in any future component that uses `document.body` portals to ensure a clean blocking experience.

---

## ⏭️ Next Steps: Phase 4
- **Download Manager**: Refactor `showProvisioningScreen` to use the `MpiOverlay` primitive.
- **Advanced Settings**: Refactor `showAdvancedSettingsScreen` to use the `MpiOverlay` primitive.
- This will unify all "Sub-Pages" under one consistent management system.
