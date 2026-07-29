# Operation & Model Selection (MPI-356)

How the user picks **what to run** (the operation) and **what runs it** (the model).
Dispatch itself is [generation-lifecycle.md](generation-lifecycle.md); the per-component
fine print is [component-contracts.md](component-contracts.md); mounts/events/state maps
are `.claude/rules/component-{mounts,events-*,state}.md`.

## The shape

| Surface | Owner | Chooses |
|---|---|---|
| Op strip (chips above the prompt bar) | `MpiPromptBox` | the operation |
| Op strip (second mount, inside the parameters popup) | `MpiPromptBox` | the operation |
| Model button (bar) → `MpiModelPicker` overlay | the Block (Gallery / Group History) | the model |

The radial is **not** a model/op surface any more. MPI-356 moved ops to the strip, and
MPI-378 removed the workspace ring entirely — Tab is the workspace flipper now
(`docs/shell.md` § navigation.js). The model button is the only way into the picker, and
the only emitter of `ui:open-model-picker`. Do not re-add a Models shortcut to Tab.

## Two mounts, one choice list

The strip is mounted TWICE (bar + settings popup) from ONE list of choices. They cannot
disagree: `_refreshOpStrip` rebuilds both mounts, and both emit the same
`workspace:set-operation`, which the owning Block validates. Never render a third op
control — feed this one.

The popup's strip is its **LAST child**, not a header. The popup is bottom-anchored to the
cogwheel and grows upward, so an op change resizes it from the top; at the bottom it holds
still under the cursor. (Measured: `i2i → depth` shrinks the popup 66px with popup-bottom
delta 0px and clicked-chip delta 0px.)

**The capture-phase dismiss guard is not a nicety.** The strip destroys and remounts itself
while handling its own click, so by the time the document-level outside-click dismiss runs,
`e.target` is detached and `popupNode.contains(e.target)` is `false` — the popup closed on
every in-popup op change. A capture-phase listener on `popupNode` records the event object
first; the dismiss skips that exact event. Outside-click / Escape / cog-toggle still dismiss.

## Which ops appear, and which are dim

`getAvailableCommands(mediaType, model, ctx)` (`js/data/commandRegistry.js`) is the single
source. It returns **canonical `OP_ORDER`**, not registry or `supportedOps` order.

- **Absent** — the workspace can't host it. Mask ops (`detail`, `inpaint`) need `canMask`,
  which `MpiPromptBox` derives from its own `workspaceKey` prop: only the History workspace
  has the mask tool, so those chips never render in the Gallery. A Klein inpaint reachable
  straight from the Gallery would need a mask surface there — its own card.
- **Dim** (`available: false`) — the model can run it, the box can't right now. The strip
  renders it `aria-disabled` and appends a short clause to the op's own description
  (`needs 1 image`, `paint a mask first`, `takes at most 2 images`) — never replacing it.
  What the op does is the useful half.
- **Single-op models** render ONE always-selected chip (verified on Qwen Image Edit:
  `[edit, selected, dim]`).
- `_context.filterNoInputOps` (History video-continuation mounts only) HIDES text-only ops
  entirely. Any new op logic must check it — see MPI-281.

## The "?" prompting guide (MPI-360)

Every op prompts differently and the strip alone cannot say so, so the parameters popup
carries a `?` directly **above** the strip, hard right. It opens `MpiOpHelpDialog` — a
read-only MpiModal with the op's purpose, one good example and the common mistake.

**One source per op.** The long form lives in the op's own `help` block in
`commandRegistry.js`, beside the `info` one-liner that stays the hover form. There is no
second help registry. `getOpHelp(opKey, model)` is the only lookup; the component never
resolves anything itself. An op with no `help` still opens something useful — the resolver
synthesises `{ title: label, body: [info] }` rather than render an empty popup.

**Per-model overrides are merged, not swapped.** `help.byModel` is keyed by model **id**
first, then model **type**, and shallow-merged over the base, so an entry supplies only the
keys that differ. It exists because prompting genuinely diverges — `t2i` on `sdxl` wants
comma-separated tags where Krea2/Klein want a sentence. It is NOT a per-model help matrix:
add an entry only where the advice actually changes.

**Media is optional and self-healing.** `help.media` holds app-root-relative statics
(`assets/help/<op>.gif`). Extension picks the element — mp4/webm/mov render as a muted
looping `<video>`, everything else including GIF as an `<img>`, no library involved. A path
that fails to load removes its own node, so a typo degrades to text-only instead of a
broken glyph.

**Two traps this surface created**, both fixed in `MpiPromptBox`:

- `Overlays.request` fires `ui:close-all-popups` with `reason: 'overlay-open'` **before**
  showing an overlay. The settings popup obeyed it unconditionally, so it dismissed itself
  the instant its own child guide appeared — and was gone once the guide closed. It now
  ignores that specific reason, the same exemption MpiSlideOver takes. Outside-click,
  Escape, cog-toggle and an unqualified close-all still dismiss it.
- The guide portals to `document.body`, so every click inside it — including the backdrop
  that dismisses it — reads as "outside" to the popup's own outside-click handler. That
  handler now skips `.mpi-modal-wrapper` / `.mpi-modal-backdrop`, beside the existing
  `.mpi-dropdown__list` / `.mpi-popup` skips.

The dialog is created lazily on first `?` click and destroyed with the PromptBox.

## The op memory, and who may write it

`state.s_selectedOpByModel` (`{[modelId]: opKey}`) records **user picks only**, session-only,
reset per project. Every internal re-pick MUST pass `setOperation(key, { programmatic: true })`
or it poisons the memory — full contract in
[component-contracts.md](component-contracts.md) § "PromptBox — op is remembered per model".

`_pickFallbackOp` prefers `getSelectedOp(model.id)` whenever it still fits the staged chips,
falling back to the smallest-fitting available op. Without that, `Edit + 2 images → clear →
re-add 2 images` landed on `i2i` instead of going back to Edit.

## Media transitions

**MPI-337 — no force-DOWN.** Removing media never switches the op to a text op. The op stays
selected, renders disabled if it lost a required input, and Run toasts the missing input.

**The ONE exception (MPI-356).** The LAST chip leaving lands the box on the model's text-only
op — an empty box with a media op selected can do nothing at all. Written narrowly in
`_emitMediaChange`: only the transition TO zero media (`hadMedia` captured before the counts
are recomputed), only when the model has a text-only non-mask op, never under
`filterNoInputOps`, and dispatched `{ programmatic: true }` so the user's real pick is still
what `_pickFallbackOp` restores when media comes back.

Going the other way (media added while a text op is selected) picks via `_pickFallbackOp`,
which fits the op to the media COUNT — 2 images must land on an op with capacity ≥ 2, never
the cap-1 `i2i`, which would evict chip 1 on the next inject (MPI-295).

## Bar order

`neg · prompt · enhance · model · cog · engine · run`. Grid columns are all `auto` except the
prompt's `1fr`, so **DOM order alone sets the position** — moving a control is a template edit,
no CSS. Props per slot: `.claude/rules/component-mounts.md`.

## Testing

`node --test tests/op-strip-availability.test.cjs` — `commandRegistry.js` has zero imports, so
a `.cjs` test can `await import` it directly. It pins: every strip-eligible op has a `short`
that appears in `OP_ORDER`; canonical ordering; absent-vs-dim mask gating; `inpaint`'s contract
(mask-gated, prompt-OPTIONAL); that the canonical sort does not change which op
`_pickFallbackOp` lands on; and the three `getOpHelp` contracts (info fallback, per-model
merge, and that `inpaint`'s guide keeps teaching the empty-prompt erase — the prompt IS that
op's router). `npm run release:check` is the gate for any op-registry edit.
