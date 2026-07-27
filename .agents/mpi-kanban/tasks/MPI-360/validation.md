# MPI-360 — validation

Shipped in `e5a0bf1c`. User accepted 2026-07-28: "this will do for now … more than enough",
with refinement deferred (see Deferred below).

## What was verified, and how

**Automated** — 3 new tests in `tests/op-strip-availability.test.cjs` (8/8 pass). They pin the
three contracts the dialog depends on:

- an op with no authored `help` falls back to its `info` one-liner, with the `"Label — "`
  prefix stripped — the popup can never open empty;
- `help.byModel` **merges** over the base rather than replacing it (`t2i` on `sdxl` swaps
  `body` + `examples`, keeps `title`; a model with no override gets the base);
- `inpaint`'s guide still carries the empty-prompt example and a `bad:true` entry — the
  prompt IS that op's router, so this text is part of the feature, not decoration.

`npm run release:check` passes. ESLint on the touched files: 0 errors (one pre-existing
`no-raw-dom-query` warning at MpiPromptBox.js:1715, untouched by this change).

**Live, in the running app** (detached PromptBox mount at 127.0.0.1:3000, torn down after):

| Check | Result |
|---|---|
| `?` renders above the strip, hard right, as a focusable `<button>` | pass |
| Op strip is still the popup's LAST child (MPI-356 contract intact) | pass |
| Guide opens with the right content for `inpaint` | pass |
| Content follows the active op — `kleinEdit` / `t2i` / `upscale` | pass |
| Per-model override live — `sdxl-realistic` `t2i` shows the tag-soup variant | pass |
| Escape closes the guide | pass |
| X closes the guide, settings popup survives underneath | pass |
| Bad example renders struck-through in `--accent-heat` | pass |
| Broken media path removes its own node (no broken-image glyph) | pass |

## Two bugs the surface exposed, both root-fixed

1. `Overlays.request` fires `ui:close-all-popups` with `reason: 'overlay-open'` **before**
   showing an overlay. The settings popup obeyed it unconditionally, so it dismissed itself
   the instant its own child guide appeared — and was gone once the guide closed. Now
   ignores that specific reason (the exemption MpiSlideOver already takes). Every other
   dismiss path is unchanged: outside-click, Escape, cog-toggle, unqualified close-all.
2. The guide portals to `document.body`, so clicks inside it — including the backdrop that
   dismisses it — read as "outside" to the popup's own handler. That handler now skips
   `.mpi-modal-wrapper` / `.mpi-modal-backdrop`.

## Not verified

The user has not driven it in their own session; every live check above was run by the
agent against the running instance.

## Deferred by the user (→ follow-up card)

- Per-model specificity beyond the single `sdxl` `t2i` override.
- Imagery: no `assets/help/` media ships. The rendering path is built and proven (GIF via
  `<img>`, mp4/webm/mov via a muted looping `<video>`); it just has no files yet.

## Departure from the card's acceptance list

Acceptance asked the remove/inpaint entry to "name the exact words that route to removal".
No trigger-word router exists in the tree — Klein routes inpaint *and* remove through one
branch (`Input_wf_type: 5`) and the shipped contract is `promptRequired: false`, i.e. an
EMPTY prompt erases. The guide teaches that instead of a word list that does not exist. A
comment in `commandRegistry.js` marks where the list goes in `byModel` if Klein ever ships
`MpiTextContains` routing.
