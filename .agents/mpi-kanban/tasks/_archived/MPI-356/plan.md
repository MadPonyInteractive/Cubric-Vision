# Operation + Model selection UX rework

## Context

Op and model selection are currently spread across three surfaces with no clear
owner, and the radial menu is structurally unable to do the job asked of it.

- The radial computes item angles as `-90 + (360/N)*i` where `N` is the
  *filtered* item count ([MpiRadialMenu.js:179](js/components/Primitives/MpiRadialMenu/MpiRadialMenu.js#L179)).
  Items come from `model.supportedOps` ([navigation.js:68-84](js/shell/navigation.js#L68-L84)),
  so switching model changes `N` and rotates every item. Blind hold-Tab gesture
  (the only reason this menu exists) is impossible.
- 28 op ids exist, many of which are the same user-facing verb per model
  (`edit`/`krea2Edit`/`qwenEdit`, `upscale`/`pid`/`imageUpscale`,
  `t2v`/`t2v_ms`). A flat ring can't hold them.
- Op availability is gated on `(model x media counts)` only. Workspace
  capability is missing, so mask ops (`detail`/`change`/`remove`) render
  permanently dimmed in the Gallery, where no mask tool exists.
- Gesturing toward a dimmed sector silently selects the *nearest enabled*
  item ([MpiRadialMenu.js:285](js/components/Primitives/MpiRadialMenu/MpiRadialMenu.js#L285))
  — a blind gesture can fire the wrong op.
- Model and op both live in the settings popup as text dropdowns
  ([MpiPromptBox.js:1128-1212](js/components/Organisms/MpiPromptBox/MpiPromptBox.js#L1128-L1212)),
  making that popup a grab-bag and hiding the two most-changed values behind a click.

**Outcome:** ops move to an always-visible strip over the prompt box, model
moves to a card overlay, the settings popup becomes parameters-only, and the
radial stops owning ops entirely.

---

## Design

### Surfaces after the change

| Surface | Owns |
|---|---|
| Op strip (over prompt box, right) | Ops that `Run` dispatches with prompt + chips |
| History left rail (`MpiHistoryTools`) | Ops that ignore the prompt box (crop, resize, upscale, remove-bg, mask brush) |
| Model button (prompt box) | Opens model overlay |
| Model overlay (new) | Pick installed model; per-card button -> `MpiModelSettings` |
| Cogwheel popup | Parameters only (quality, style, stylization, denoise, ratio, batch, krea2Turbo, enhancePrompt) |
| Radial (hold Tab) | Models today; + Apps when the app library opens |

The rail/strip split is the load-bearing rule: **rail ops don't consume the
prompt box; strip ops do.** Detail/Change/Remove consume the rail's mask output
but live in the strip.

### Op strip

Built from `MpiRadioGroup` ([MpiRadioGroup.js](js/components/Primitives/MpiRadioGroup/MpiRadioGroup.js))
— already supports row layout, per-option `disabled`, per-option `info`,
`iconOnly`, and emits `select { value, option }`. No new component.

Short labels, added as a `short` field on each command def in
[commandRegistry.js](js/data/commandRegistry.js):

- Image: `t2i` `i2i` `depth` `edit` `upscale` `detail` `change` `remove`
- Video: `t2v` `i2v` `extend` `interp` `upscale`

Full label surfaces on hover via the existing `info` field.

**Two kinds of unavailable — they must render differently:**

- **Absent** — the model can't do it, or the workspace can't (mask ops in
  Gallery). Not rendered at all.
- **Disabled** — the model can do it, current chips don't fit. Rendered dim
  with a reason on hover ("needs 1 image").

Four visual states, not three: `unselected`, `selected`, `disabled`, and
`selected + disabled` (dim fill, selection outline kept). The last one is the
MPI-337 no-force-down case and must be representable.

Strip options sorted by a canonical verb order, not `supportedOps` array order,
so a given op sits in roughly the same place across models.

### Workspace gating (new third dimension)

`getAvailableCommands(mediaType, model, ctx)`
([commandRegistry.js:592-630](js/data/commandRegistry.js#L592-L630)) gains a
workspace capability input. Ops with `requiresMask: true` are **absent** where
no mask tool exists (Gallery), **present** where one does (Group History).

This also removes the permanently-dead Detail entry from the Gallery radial today.

### Op memory on chip change

No new state. `state.s_selectedOpByModel` ([state.js:58](js/state.js#L58))
already records the last **explicit user pick** per model and is guarded from
programmatic writes.

Change `_pickFallbackOp()`
([MpiPromptBox.js:1164-1182](js/components/Organisms/MpiPromptBox/MpiPromptBox.js#L1164-L1182))
to prefer the remembered op when it fits the new chip count, falling back to
first-fit only when it doesn't.

Resulting behavior: Edit + 2 images -> clear -> only `t2i` viable, auto-selected
-> re-add 2 images -> force-up restores remembered `krea2Edit`. Both of the
user's contradictory complaints satisfied with ~3 lines.

**Must verify during build:** the empty-box auto-select to `t2i` goes through
the programmatic path so it does not overwrite the memory via `setSelectedOp()`
([modelHelpers.js](js/utils/modelHelpers.js)).

### Shared tile component (`MpiTileSheet`) — do this FIRST

The tile grid is already duplicated **before** this card adds a third copy:

- `.mpi-tile*` = **207 lines of CSS** living in `MpiModelManager.css`.
- `MpiAppLibrary.js` re-implements `_buildTile()` in JS but **borrows those CSS
  classes from the Model Library** — that is why `MpiAppLibrary.css` is only 117
  lines. A cross-component style dependency with no declared owner.
- Both `__sheet` grid rules are byte-identical
  (`repeat(auto-fill, minmax(220px, 1fr))`, `gap: var(--s-4)`, `align-items: start`).

Extract `js/components/Primitives/MpiTileSheet/`. **Primitive, not Compound** —
both libraries are Compounds and Compounds may not import Compounds.

It owns: the `.mpi-tile*` CSS, the sheet grid, thumb rendering (image still /
hover-play muted video / placeholder-on-error), name + meta line + media badge,
featured star, heat dot, waiting mascot, and `select` emission.

Consumers keep ALL their own state logic and pass the state row in as HTML, so
`_tileState()` and `_badgeHtml()` move nowhere and the blast radius stays small.

```
items: [{ id, name, media:'image'|'video', preview?, meta?, showMediaBadge?,
          featured?, dot?, waiting?, state?  /* HTML */, selected? }]
el.setItems(items) · el.patchState(id, html) · el.setWaiting(id, bool)
el.setSelected(id|null) · emits 'select' { id, item }
```

| Consumer | `state` HTML is | `select` does |
|---|---|---|
| Model Library | install chip / progress bar | open detail drawer |
| App Library | Ready / Get models | open app detail |
| Model picker | the LoRA & Upscale button | set model, close overlay |

**Not in scope:** `.mpi-detail*` (240 more lines, also shared, also unowned).
The picker has no drawer, so extracting it buys this card nothing. Leaving it
as-is is status quo, not a new regression. Its own card later.

### Model picker overlay

Built on `MpiTileSheet`, deliberately **identical** to the Model Library tile —
a different card UI across three surfaces would create exactly the
inconsistency this card is removing. The only differences:

- **Installed models only.**
- Clicking a tile **selects the model and closes**, instead of opening the
  right-hand detail drawer.
- The state row carries a **LoRA & Upscale** button calling the existing
  `MpiModelSettings.open({ modelId })`. Hover accent is `--accent-heat`.
- Current model highlighted.

Everything else already exists and must not be rebuilt: video models render
their `model.video` as a hover-play `<video>`; image tiles are 4:5 and video
tiles 16:9 via `mpi-tile--image` / `mpi-tile--video`; the tier badge is already
the `mpi-tile__meta` line (`${dropdownMeta} · ${TIER_WORD[tier]}`), so
multi-tier families (LTX 2.3, Boogu) correctly show one card per installed tier.

Note: picking a video model switches media mode and swaps the strip wholesale —
the Image / Video section heads carry that.

### Settings popup surgery

Remove the model dropdown ([MpiPromptBox.js:1128-1146](js/components/Organisms/MpiPromptBox/MpiPromptBox.js#L1128-L1146))
and the op dropdown ([MpiPromptBox.js:1185-1212](js/components/Organisms/MpiPromptBox/MpiPromptBox.js#L1185-L1212)).
Popup becomes parameters-only, triggered by a cogwheel.

Split rule for anything model-scoped: **picks a file -> model card** (LoRA,
upscale model). **Turns a knob -> cogwheel popup** (krea2Turbo, quality, style,
denoise, ratio, batch, enhancePrompt).

The existing composite button bottom-right ("KREA 2 NSFW - IMAGE TO IMAGE")
becomes the model button; its op half drops since the strip now shows it.

### Radial

Gallery context item list becomes a single item: **Models**.
`_resolveActiveIndex` already special-cases `N === 1` by bypassing the dead-zone
([MpiRadialMenu.js:274](js/components/Primitives/MpiRadialMenu/MpiRadialMenu.js#L274))
— hold Tab, release anywhere, model overlay opens. No component changes, just
the item list in `_buildGalleryItems`. Adding Apps later = push a second item.

Independent fix while in there: gesturing at a disabled sector must select
**nothing**, not the nearest enabled item ([MpiRadialMenu.js:285](js/components/Primitives/MpiRadialMenu/MpiRadialMenu.js#L285)).

---

## Files

**Modified**
- [js/data/commandRegistry.js](js/data/commandRegistry.js) — add `short` per command; add workspace capability to `getAvailableCommands()`; canonical verb order
- [js/components/Organisms/MpiPromptBox/MpiPromptBox.js](js/components/Organisms/MpiPromptBox/MpiPromptBox.js) — mount strip, remove both dropdowns, cogwheel trigger, model button, `_pickFallbackOp` memory preference
- [js/shell/navigation.js](js/shell/navigation.js) — `_buildGalleryItems` -> single Models item; drop `refreshRadial({ modelId })` op plumbing
- [js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js](js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js) — `_opOptions()` feeds the strip instead of the radial; drop `refreshGroupHistoryRadial`
- [js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js](js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js) — `workspace:set-operation` handler now driven by the strip
- [js/components/Primitives/MpiRadialMenu/MpiRadialMenu.js](js/components/Primitives/MpiRadialMenu/MpiRadialMenu.js) — disabled sector selects nothing
- [js/shell/preloadStyles.js](js/shell/preloadStyles.js) + [js/components/types.js](js/components/types.js) — register the new overlay's CSS + props

**New**
- `js/components/Compounds/MpiModelPicker/` — model card overlay (`MpiOverlay` + card grid)

**Reused as-is**
- `MpiRadioGroup` (the strip), `MpiModelSettings` (LoRA/upscale from the card),
  `MpiOverlay`, `state.s_selectedOpByModel`, `MpiHistoryTools` (rail unchanged)

---

## Build order

1. ~~Mockup~~ — done. Strip approved as drawn (right-aligned above the box).
   Chips stay exactly where they are today; the mockup wrongly put them over the
   negative/positive toggle. The mockup's bespoke model overlay is **discarded**
   in favour of the Model Library tile.
2. ~~`MpiTileSheet` extraction + rewire `MpiModelManager` and `MpiAppLibrary`~~ —
   done, commit `f76791ff`, both libraries verified live.
3. ~~`commandRegistry` — `short` field, canonical order, workspace capability arg~~
   — done. `canMask` gate rides the PromptBox's existing `workspaceKey` prop, so
   no Block plumbing was needed. Sort lives INSIDE `getAvailableCommands` (one
   order for every surface); `tests/op-strip-availability.test.cjs` pins that it
   didn't move `_pickFallbackOp`'s landing op.
4. ~~Strip in the prompt box (`MpiRadioGroup`), wired to `workspace:set-operation`~~
   — done, user-verified live. Strip FLOATS above the bar (absolute, `bottom:100%`,
   right-aligned) on the media-chip layer, NOT as a grid row: the bar must keep its
   compact height or it covers the gallery grid and the history canvas.
5. ~~Popup surgery + cogwheel + model button~~ — done. `_refreshOpDropdown` was
   DELETED, not renamed (its body was one line once the dropdown went); all ten
   call sites now drive `_refreshOpStrip` directly. The popup is parameters-only:
   the LoRA/upscale gear left with the dropdowns, so the PromptBox no longer
   emits `settings` and both Blocks' `pb.on('settings')` listeners went with it.
6. ~~`MpiModelPicker` overlay on `MpiTileSheet`~~ — done. Opened by
   `ui:open-model-picker`; each Block owns an instance, passes its OWN
   (workspace-filtered) model list and applies the pick — the picker holds no
   model logic. LoRA & Upscale is a `<span role="button">` (a button may not nest
   in the tile button) intercepted in the CAPTURE phase, re-emitted as `settings`
   because a Compound may not import `MpiModelSettings`.
7. ~~Radial -> single Models item + disabled-sector fix~~ — done. USER OVERRODE
   the plan: Tab must NOT draw a ring yet, so `MpiRadialMenu._onTabDown`
   short-circuits to `_selectItem` whenever the context holds exactly ONE enabled
   item — self-erasing the moment Apps adds a second. Both workspace contexts now
   share one static `RADIAL_ITEMS` (Models -> `ui:open-model-picker`), so ALL op
   plumbing to the ring died with it: `refreshRadial`, `refreshGroupHistoryRadial`,
   `clearGroupHistoryRadial`, `_mapOpsToRadialItems`, `OP_ICONS`, the
   `radial:will-open` bridge and 9 gallery call sites. Disabled-sector fix:
   `_resolveActiveIndex` now aims at the nearest sector INCLUDING disabled ones
   and returns -1 if it's dimmed (it used to fall through to the nearest enabled
   neighbour).
8. ~~`_pickFallbackOp` memory preference~~ — done. `getSelectedOp(model.id)` wins
   over first-fit whenever the remembered op is in the fitting pool and available.
9. ~~Single-op models render ONE chip~~ — done (user decision). `_refreshOpStrip`
   now only bails on an EMPTY choice list.

Use `/mpi-handoff` between steps if context gets large.

---

## Verification

- `npm start`, Electron. Browser at :3000 is dev-only and some features are broken.
- **Strip states:** on Krea 2, empty box -> only `t2i` live, `i2i`/`edit`/`upscale`/`depth` dim with reasons. Add 1 image -> those light up, `t2i` dims. Add a 2nd -> `edit` stays live (2 slots), `i2i`/`upscale` dim.
- **Absent vs disabled:** Gallery strip shows no `detail`/`change`/`remove` at all. Group History with the mask tool shows them, dim until a mask exists.
- **Op memory:** Krea 2, pick Edit, add 2 images, clear all -> lands on `t2i`. Re-add 2 images -> returns to Edit, not `i2i`.
- **Selected + disabled:** on Edit with 2 images, remove both. Edit stays selected and dim. Run toasts the missing input, dispatches nothing.
- **Model overlay:** hold Tab, release -> overlay opens. Pick a video model -> strip swaps to video ops. Card button opens `MpiModelSettings` with the right `modelId`.
- **Popup:** cogwheel shows parameters only; no model or op dropdown remains.
- **Teardown:** navigate Gallery <-> History repeatedly, confirm no duplicate listeners (every `Events.on` in the new overlay collected in `_unsubs` and released in `destroy()`).
- `npm run test:desktop` (port 3000 must be free first).
- `/mpi-component-audit` on the touched components.

---

## Open assumptions (flag if wrong)

- `v2v` maps to no single existing op — using `extend` / `interp` / `upscale` for the video strip.
- Strip sits horizontally above the prompt box, right-aligned. Settled at the mockup step.
- Uninstalled models are absent from the model overlay, reachable via the Model Library link.
- Apps stay out of the radial until the app library is un-gated (MPI-332).
