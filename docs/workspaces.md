# Workspaces

Three primary workspaces + one hidden dev area.

## Flow

```
Landing → Gallery → Group History
```

## Landing (`js/pages/landing.js`)
Handles project selection and creation. Entry point when no project is open.

## Gallery (`js/workspaces/gallery/gallery.js`)
Default view when a project opens. Shows all item groups in a radial grid.
- Contains MpiPromptBox (for model-tied commands: t2i, i2i, upscale, detail, etc.)
- Compare overlay for viewing two cards side by side.
- Select mode swaps PromptBox for MpiSelectionBar.

## Group History (`js/workspaces/groupHistory/groupHistory.js`)
Opened when user clicks a card from gallery. Shows single card's history timeline.
- Left: MpiHistoryTools (model-tied + universal command buttons)
- Centre: MpiCanvas (view/input/crop/mask)
- Right: history panel (history entries for the active card)
- Bottom: MpiPromptBox (for model-tied commands)
- Crop bar (when crop tool active)

Universal commands (interpolate, videoUpscale, autoMaskImg) run from the toolbar in Group History — they do not require a model and have their own workflows in `UNIVERSAL_WORKFLOWS`.

## Routing
- `js/router.js` defines `PAGE_LANDING`, `PAGE_GALLERY`, `PAGE_GROUP_HISTORY`.
- `js/shell/navigation.js` manages the history stack via `navigate()` / `back()`.
- Never use `window.location` — always go through the router.
