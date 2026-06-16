# MPI-99 Brief — Uninstall confirm dialog dead after an install

**Origin:** live-found 2026-06-16 during MPI-97 parallel-install verify on a no-GPU Pod.

## Symptom

After installing model(s), pressing **UNINSTALL** on an installed model card opens **NO confirmation dialog**. Nothing happens. The user confirmed: no dialog appears (not "dialog opens but OK is dead").

## Evidence it is renderer-side (not backend / wrapper)

- `app.log` shows **no `remote uninstall …` line** for the click → the backend `/comfy/models/uninstall` route was **never reached**.
- DevTools console is **clean** — only the standard Electron security warnings, no JS error.
- `/comfy/models/check` returns **HTTP 200** at the same moment → wrapper reachable, Pod ready, no 502.
- The MPI-97/MPI-95 backend uninstall/install work is independently **verified** this same session (4 models installed concurrently, earlier uninstalls hit the route and logged correctly).

So the failure is in the renderer **before any fetch**: the Uninstall button click does not open the dialog.

## Suspected cause

The Uninstall button handler (`MpiModelManager.js`, the `card.on('uninstall', …)` branch) sets `_pendingUninstall` and calls `_uninstallDialog.el.show()`. `_uninstallDialog` is a **singleton** created once in setup; `MpiOkCancel.el.show()` self-portals to `document.body` via the modal primitive + Overlays registry.

During the 4-model install, `download:progress` / `models:checked` fire `renderList()` repeatedly. The hypothesis (user's, and it fits): an install-driven re-render leaves the Overlays/popup state stale — likely interacting with the `ui:close-all-popups` / MpiSlideOver opt-out machinery ([[project_slideover_close_popup_optout]]) — so a subsequent `_uninstallDialog.el.show()` is suppressed/no-ops. Repro hypothesis: **install something, then uninstall right after.**

## Fix direction (app-side, no image)

- Confirm the failing link: is it the `card.on('uninstall')` binding (lost on re-render), or `_uninstallDialog.el.show()` no-opping (stale Overlays/popup state)? A one-line DevTools probe distinguishes them.
- If Overlays state: re-arm/refresh the dialog's overlay registration so `.show()` works after install-driven re-renders, or stop install progress from stomping popup state.
- If binding: ensure the uninstall handler survives `_destroyAllCards()` + `renderList()`.

## Repro to confirm

Connect (remote or local) → install one or more models → immediately press UNINSTALL on an installed card → expect NO dialog (bug). Fixed = the confirm dialog opens every time, including right after an install.
