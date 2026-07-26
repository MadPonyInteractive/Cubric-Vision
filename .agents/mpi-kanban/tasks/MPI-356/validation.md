# MPI-356 Validation

## Step 2 - MpiTileSheet extraction (commit f76791ff)

Verified live against the running dev server: Model Library and App Library both
render through the shared primitive, install progress and availability chips
still patch correctly.

## Step 3 - commandRegistry short / canonical order / workspace capability

Automated, PASSED: `node --test tests/op-strip-availability.test.cjs` (4/4).
`npx eslint` on the three touched files: 0 errors, 1 pre-existing warning
(raw querySelector at MpiPromptBox.js:1624 - baseline, untouched).

What the test pins:

- Every strip-eligible op (non-stub, non-universal, media-typed) declares a
  `short`, and every `short` appears in `OP_ORDER` - a missing one would render
  a blank chip and sort to the end of the strip.
- `getAvailableCommands` returns canonical order, not registry or
  `supportedOps` order. Krea 2 -> `t2i > i2i > poseReference > krea2Edit >
  upscale > detail`; WAN's `['i2v_ms','t2v_ms']` comes back `t2v_ms > i2v_ms`.
- Absent vs disabled: `canMask:false` (Gallery) omits `detail` entirely;
  `canMask:true` with no mask returns it `available:false`; painting a mask
  flips it true; omitting `canMask` keeps mask ops (no silent break for a
  caller that never opted in).
- The new sort does NOT change which op `_pickFallbackOp` lands on for 0-3
  staged images. That was the one real risk in sorting inside the registry:
  the fallback sorts candidates by media capacity and `Array#sort` is stable,
  so a reordered input could have silently changed the landing op.

Wiring (one line each, no new plumbing): the PromptBox derives `canMask` from
the `workspaceKey` prop it already receives at both mount sites, so a gallery
box cannot drift into claiming a canvas; `_buildGalleryItems` passes
`canMask:false` because that ring IS the gallery.

NOT yet checked in the app: hold-Tab in the Gallery should no longer show a
dimmed **Detail**. Deferred to the step-4 pass rather than reloading the user's
live instance for a one-line pass-through.

## Step 4 - op strip in the prompt box

USER-VERIFIED live 2026-07-26 (screenshot: Krea 2 NSFW gallery, strip reading
`t2i i2i depth edit upscale` with `i2i` selected, `detail` correctly ABSENT).
`npx eslint` on the touched files: 0 errors, 1 pre-existing warning.

Verified in the app: strip renders, selection tracks, workspace gating holds
(no mask ops in the Gallery), and the four states read clearly.

Three corrections the user called on first look - all applied and re-verified:

1. The block reason had REPLACED the operation's description on hover. It now
   APPENDS: `Image to Image - reshape an input image toward your prompt · needs
   1 image`. What the op does is the useful half; "needs 1 image" alone tells
   the user nothing about what they would be picking.
2. The strip was a grid row INSIDE the bar. It must FLOAT above it on the
   media-chip layer (absolute, `bottom:100%`, right-aligned) so the bar keeps
   its compact height - otherwise it covers the gallery grid and, worse, the
   history canvas. It carries its own `--surface-bar` background because it now
   sits over artwork, and `z-index:2` so chips can never swallow its clicks.
3. Available ops were `--ink-3` grey. Now `--ink-1` near-white, scoped to the
   strip so other radio groups keep their muted look. The primitive's hover
   drops to `--ink-2`, which DARKENS a near-white chip, so that is overridden
   too - the background tint carries hover feedback.

Also user-requested while here: `.mpi-prompt-box-media-strip` got the
bottom-to-top `--surface-bar` -> transparent gradient the original mockup always
had (chips no longer clash with gallery art behind them).

### Primitive fix that step 4 forced (MpiRadioGroup)

The plan asked for a hover reason on dim chips, and that CANNOT work as
specified: Chrome dispatches no mouse events at all on a `disabled` form
control, so the repo-wide `[data-info]` status-bar hover (statusBar.js:262)
died on exactly the options that most need to explain themselves.

Option-level disabled now renders `aria-disabled="true"` instead of the
`disabled` attribute; the click handler refuses it and the CSS dims both
spellings. Swept every consumer: NO component passes option-level `disabled`
today, so nothing else changed behaviour, and the two places that read
`btn.disabled` (MpiOptionSelector.js:233, PromptBoxControls.js:408) set/read
the DOM property imperatively and still work.

## Steps 5 + 6 - popup surgery, model button, MpiModelPicker

Automated, PASSED: `node --test tests/op-strip-availability.test.cjs` (4/4);
`npx eslint` on all six touched JS files - 0 errors, 1 pre-existing warning.

LIVE-VERIFIED in a chromium session against the user's running dev server
(the user cleared app use for this session; playwright-core + the repo's
chromium drove http://127.0.0.1:3000). Model switches made during the run were
restored to `SDXL NSFW` at the end. Zero console/page errors across all runs.

What the run proved, in the GALLERY:

- `#settings-op-dropdown-slot` and `#settings-model-slot` are gone from the DOM;
  `#settings-cog-slot` exists.
- The model button reads `SDXL NSFW` with NO op half (`.mpi-prompt-box__badge-op`
  absent).
- The cogwheel popup opens with ONE row (`settings-op-slot`), no `.mpi-dropdown`
  anywhere inside it - ratio + batch only.
- Strip still refreshes off the surviving `_refreshOpStrip`: `t2i* i2i(dim)
  depth(dim) upscale(dim)` on an empty box, `detail` correctly ABSENT.
- Model button opens the picker: 7 installed, one IMAGE head, Library-identical
  tiles, current model outlined, LoRA & Upscale on every tile.
- Clicking LoRA & Upscale opens Model Settings and leaves the picker OPEN - the
  capture-phase interception works; the tile did not also select.
- Clicking a tile closes the picker, switches the model, and swaps the strip
  (`SDXL NSFW` -> `ILL Anime`, strip re-derived). Switching back restored it.

Also verified in HISTORY (a stray click opened a group card mid-run): the same
model button opens the picker there, the switch applies, and the strip correctly
DOES carry `detail` - that workspace owns the mask tool. Absent-vs-disabled holds
on both sides of the gate.

### Bug the live run caught (would have shipped)

The picker's full-bleed content painted over `MpiOverlay`'s own X: the button was
visible but **unclickable** (`.mpi-model-picker__head` swallowed the pointer;
computed `z-index: auto`). Escape still worked, so a static read would have
missed it. Fixed with the same lift the Library needed
(`.mpi-overlay--body:has(.mpi-model-picker) .mpi-overlay__close { z-index: 35 }`)
and re-verified: the X now closes the overlay.

### Open question carried forward - CLOSED

Single-op models rendered NO strip. User decided they must render ONE
always-selected chip; shipped and verified below.

---

## Steps 7 + 8 + strip tweak (2026-07-26)

Live-verified in headless chromium against the user's running dev server
(same harness as steps 5-6; model switches restored to `SDXL NSFW` and every
staged chip cleared at the end of each run). Zero page exceptions.

**Single-op chip.** On `Qwen Image Edit` (one supported op) the strip renders
exactly one chip: `[{"l":"edit","sel":true,"dis":true}]` - selected AND dim,
because no image is staged. That is the MPI-337 selected+disabled state, so the
chip is a status readout as much as a picker. Multi-op models are unchanged
(`t2i* i2i i2i depth upscale` on Krea 2 / SDXL NSFW).

**Tab -> picker, no ring.** Holding Tab shows NO ring
(`.mpi-radial--visible` absent throughout the hold) and the model picker is open
on release, with the 7 installed models and the current one outlined. Escape
closes it; a second hold re-opens it (the hold flag is not left stuck). The
short-circuit lives in `_onTabDown`: exactly one ENABLED item in the context ->
`_selectItem` immediately, no `_show()`. Adding Apps later restores the ring
with no code change.

**Op memory (step 8).** Krea 2, drag one gallery card in -> strip lands on `i2i`
(smallest fitting). Click `edit` (a real user pick, so `setSelectedOp` records
it). Remove the chip -> `edit` stays selected + dim (no force-down, MPI-337 still
holds). Bounce the model away and back so the empty box falls to `t2i`. Drag the
same card in again -> the strip lands on **`edit`**, not `i2i`. The negative
control is the earlier run of the identical script where the explicit `edit`
click silently failed (bad selector): with no memory recorded, the re-add landed
on `i2i`.

**Registry test + lint.** `node --test tests/op-strip-availability.test.cjs` 4/4.
ESLint on the five touched files: 0 errors, 1 pre-existing warning
(`MpiPromptBox.js` raw querySelector).

**Ops left the radial entirely.** `refreshRadial`, `refreshGroupHistoryRadial`,
`clearGroupHistoryRadial`, `_mapOpsToRadialItems`, `OP_ICONS`, `_radialModelId`,
the `radial:will-open` shell bridge and the 9 gallery + 4 history call sites are
all deleted - both workspace contexts now share one static `RADIAL_ITEMS`.
The Ctrl+Tab dev radial (3 items) still draws a ring, unaffected.

**Not covered by the browser run:** the disabled-sector fix in
`_resolveActiveIndex` is logic-verified only - with a single-item context the
resolver is never reached, and the dev radial has no disabled items. It bites
the moment the ring returns with Apps.

**Rules + docs swept (user-approved):** `component-mounts.md` (model dropdown ->
model button + cogwheel + op strip + MpiModelPicker rows on both Blocks; the
MpiModelSettings trigger is now the picker, not the PromptBox; MpiTileSheet noted
as the tile owner), `component-events-primitives.md` (single-enabled-item
short-circuit, nearest-including-disabled resolver, ops-left-the-radial),
`component-events-blocks.md` (`radial:will-open` -> `ui:open-model-picker`),
`component-state.md` (`refreshRadial` mention), `docs/events.md`
(`radial:will-open` row deleted), `docs/shell.md` (`refreshRadial`/`OP_ICONS`).
