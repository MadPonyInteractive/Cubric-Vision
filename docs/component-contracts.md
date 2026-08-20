# Per-Component Behavioral Contracts

Hard-won behavioral contracts of individual components — the non-obvious API/CSS facts that
cost hours when violated. Architecture rules (factory, BEM, teardown) live in
`.claude/rules/components.md`; this file is the per-component fine print.
Verify a named file/function/flag still exists before relying on an entry.

## PromptBox — op is remembered per model; seed from it, don't re-derive (MPI-247)

The user's chosen operation persists per model in `state.s_selectedOpByModel` (`{[modelId]: opKey}`), **session-only** (not localStorage — a fresh app start defaults to the model's natural op). Helpers: `getSelectedOp(modelId)` / `setSelectedOp(modelId, op)` in `js/utils/modelHelpers.js`. Both `MpiGalleryBlock` and `MpiGroupHistoryBlock` **seed `activeOperation` from `getSelectedOp` at mount** and write it on user picks.

**Scope boundary:** the memory is per working-session-**on-a-project**, not app-global. `openProject` (`projectService.js`, right after `state.currentProject = reconciled`) resets `state.s_selectedOpByModel = {}`, so opening a different project does NOT carry a prior project's last op into a fresh Gallery mount with an empty prompt (symptom: land on a just-opened project and the op reads i2i instead of the model's natural t2i/t2v). Within a project the memory rebuilds as the user picks ops.

The trap this fixes: the op was NEVER persisted, so every block remount (Gallery↔History nav) re-derived it from a hardcoded default (`t2i`/`t2v` / first-available), and PromptBox re-picked it on model switch and media-state change → the user's Upscale/Pose-Reference/etc. silently snapped back to i2i. **`PromptBox.setOperation(key, { programmatic })`** carries a `programmatic` flag, set `true` on every INTERNAL re-pick (`setModel`, `setModelList`, the `_emitMediaChange` media auto-switch); consumers persist ONLY user picks (`!programmatic`), so a re-pick can't poison the memory. Reuse Prompt re-asserts the reused op LAST, after `clearMedia`/`injectMedia` fire `_emitMediaChange` (which transiently auto-switches when media state mismatches the op's input slots). **Rule: when a block remounts, seed the op from `getSelectedOp` before any default; and any programmatic `setOperation` MUST pass `{ programmatic: true }` or it will be mistaken for a user choice.**

## PromptBox — the frame-role pill reports the ASSIGNED role (MPI-466)

Image chips carry a role pill along the bottom, but only when the active op declares
an `endFrame` slot the model can actually serve. That gate is the slot list, not a
model list: `i2v_ms` (LTX, Wan 2.2, MiniMax H3) declares one; single-stage `i2v` no
longer does, because its only consumer — Wan 2.2 5B — has no `Input_End_Frame` node
and injection would silently skip the title, giving the user a control that does
nothing.

- **One image** → the pill is a `<button>`: the role is a genuine choice. Clicking it
  sets `role: 'endFrame'` or **clears the tag** (never sets `'startFrame'`), so the
  positional fill keeps owning the default. Its `pointerdown` is stopped, or the pill
  starts a chip-reorder drag.
- **Two images** → a read-only `<span>`; start/end are both taken and strip order
  decides. Reorder is how you swap them.

It renders from `_withAssignedRoles()` output, not raw `item.role`, so it always shows
where the asset really goes rather than a stale tag. `startFrame`/`endFrame` are
SEMANTIC roles and stay sticky — `stripOrdinalMediaRoles` only clears ordinal ones.

Companion gate: `commandExecutor.js`'s stranded-slot bail is per-MEDIA-TYPE, not
per-slot. An end-frame-only run leaves required `startFrame` empty **by design**, so
the bail fires only when NO slot of that media type got filled — otherwise a legal
route reads as "Could not load the input image".

## PromptBox — the prompt button CYCLES three fields, it does not toggle two (MPI-474)

One button, three stops: **positive → negative → negative audio → positive**. The
third exists because LTX drives two independent negatives — `LTX2_NAG` patches video
cross-attention from `nag_cond_video` and audio cross-attention from `nag_cond_audio`,
from two separate conditionings — so a boolean could not express what the graph takes.

- **Gate:** the audio stop is offered only when the active model declares
  `capabilities.audio`. That is the same signal that surfaces the audio input slot and
  the `audioMode`/`useAudio` controls, so the three never disagree. Without it the
  button cycles two ways exactly as before.
- **`_applyMode(next)` is the ONLY place a mode changes.** It moves the textarea value,
  the placeholder, the button's icon, its `is-active` flag and the `mode-change` emit
  together. Those five used to be duplicated across the click handler, `injectPrompts`
  and the toggle teardown, and they had already drifted.
- **`MpiButton` cannot do this alone.** `toggleable`/`iconActive` are strictly boolean
  (a CSS swap on `is-active`), so the mount is NOT `toggleable`; the cycle drives
  `el.setActive()` + `el.setIcon()` by hand. `setIcon` was added for this and mirrors
  `setLabel`.
- **Stranded-edit guard, twice.** Losing `capabilities.audio` while the audio field is
  active snaps back to `negative` — and that check sits BEFORE `_refreshNegToggle`'s
  `show === !!_negBtn` early return, which would otherwise skip it because the button
  itself neither appeared nor disappeared.
- **`Input_Negative_Audio` is always injected, including empty.** The graph gates NAG on
  the string being non-empty, so a cleared box must reach the node to switch it back off.
  `getRunPayload` blanks the value for a model that cannot take it, so a stale draft
  never rides along.
- **Reuse round-trips all three.** Saved as `meta.negativeAudioPrompt`, read back by
  `promptReuse.js`. Items generated before this shipped have no such field and fall
  through to `''`.

## MpiProgressBar ships a 160px floor that beats any parent `max-width`

`.mpi-progress { min-width: 160px }` (`js/components/Primitives/MpiProgressBar/MpiProgressBar.css`). A `max-width` on the mount wrapper can never win against it — two bars side by side silently overflow their container and draw ON TOP of each other, which reads as a layout bug in the consumer, not in the primitive. Sizing bars below 160px means overriding `min-width` **scoped to your consumer** (see `.mpi-gallery-grid__zone--center .mpi-progress`), never on the primitive — other consumers rely on the floor.

## MpiRadioGroup emits 'select' not 'change'

`MpiRadioGroup` emits `'select'` on user pick, not `'change'`. Listening for `'change'` results in silent no-op. Always use `.on('select', ...)`. Smoke-test that values round-trip to project.json before considering wiring correct.

## MpiRadioGroup — a disabled option is `aria-disabled`, never `disabled` (MPI-356)

`{ disabled: true }` renders `aria-disabled="true"`; the handler refuses the click. It does NOT set the `disabled` attribute, because **Chrome dispatches no mouse events at all on a disabled form control** — the repo-wide `[data-info]` status-bar hover would die on exactly the options that most need to explain themselves (the PromptBox op strip's "needs 1 image", "paint a mask first"). Setting `btn.disabled` imperatively still works; both are honoured on the click path.

Consequences when you touch a group with disabled options:
- **Test/automation:** assert on `getAttribute('aria-disabled') === 'true'`, not `.disabled` — the latter is `false` on a dimmed chip.
- **Styling:** dim via `[aria-disabled="true"]`, and exclude it from hover rules (`:not([aria-disabled="true"])`) or a dimmed chip lights up under the cursor.
- **Playwright:** `:text-is("edit")` and `hasText: /^edit$/` do NOT match the strip's buttons. Read the group with `$$eval` and click by index (`locator(...).nth(i)`).

## MpiTileSheet — state-dumb tiles; the consumer owns the bottom row (MPI-356)

`MpiTileSheet` (Primitive) renders one grid of tiles for three surfaces: Model Library, Flow Library, and `MpiModelPicker`. It is a **Primitive, not a Compound**, because both libraries are Compounds and the hierarchy forbids Compounds importing Compounds.

It is deliberately **state-dumb**: install progress, availability chips, and the picker's LoRA & Upscale button are none of its business. The consumer hands the fixed-height bottom row over as an HTML string (`item.state`) and patches it in place with `el.patchState(id, html)` — never by rebuilding the sheet. Other instance methods: `setItems`, `setWaiting(id, bool)`, `setSelected(id|null)`, `getTile(id)`. Emits `'select' { id, item }`, echoing back the consumer's own `item.source` payload.

The trap it retired: the tile markup existed twice (`MpiModelManager._buildTile` + `MpiFlowLibrary._buildTile`) against ONE copy of the CSS that only the Model Library owned — the Flow Library borrowed the selectors across a component boundary and silently lost `--lib-card`. Add a new tile surface by feeding this sheet, never by copying tile markup.

## MpiModelSettings — body-mounted, and its open() must not feed its own listener (MPI-356)

Two contracts, both paid for with a live hang:

- **`mountTarget: 'body'` is load-bearing.** Its only opener is `MpiModelPicker`, which is body-mounted. A `tool-container` mount lands inside `#tool-container`'s own stacking context, so a *higher* Overlays z-index still paints UNDERNEATH the picker — the LoRA & Upscale click reads as a dead no-op until the picker is closed. **Rule: an overlay opened FROM another overlay must mount at least as high as its opener.**
- **A portalled popup inside it must append to `body` on first OPEN, never at mount.** `MpiOverlay._doShow` stashes (detaches, `display:none`) every `document.body` child when a body-mount overlay shows — so a `MpiDropdown` list / `MpiTreePicker` box portalled at MOUNT time, i.e. by anything `open()` builds before `overlay.el.show()`, is swept into that stash. The trigger still toggles `is-open` (chevron flips) but the popup paints nowhere: the LoRA tree and the upscale selector were both dead from 1.3.0 until `positionList`/`positionBox` were made to append lazily. **NOT a z-index problem** — the popups are `11000`, the overlay ~`10010`; chasing paint order costs the whole first pass. Same root cause as the toast exemption below (§ MpiToast) — a body-level portal and a body-mount overlay always contend, so either exempt it from the stash (toasts) or create it after the stash pass (popups).
- **`open()` rescans assets, and it subscribes to asset changes.** Those two facts nearly killed it: `assetService.loadAll()` used to assign `state.availableLoras`/`state.upscaleModels` unconditionally, the state Proxy emits `state:changed` on *every* assign, and the component's live-rerender subscription answers those two keys by calling `el.open()` again — two events per pass, exponential re-entry, an unclosable overlay and ~13k `net::ERR_INSUFFICIENT_RESOURCES`. Fixed on both sides: `loadAll` assigns only on a real content change, and `open()` sets `_rescanning` around its own `loadAssets()` so the subscription skips the changes it causes itself. **General rule: a component that both writes a state key and re-renders on that key must exclude its own writes — and a service must not fake a `state:changed` for a value that did not change.**

## MpiInput — write values with `el.setValue()`, never by finding the field (2026-08-20)

`MpiInput` shipped with **no** programmatic-write API, while the Primitives that do get driven from outside all have one (`MpiRadioGroup.setValue`, `MpiCheckbox.setChecked`, `MpiButton.setLabel/setActive/setIcon/setDisabled`, `MpiTileSheet.setSelected`, `MpiColorPicker.setHex`). So callers reached into it and set `.mpi-input__field`'s `.value` by hand — **seven modules do, at eleven sites**: `MpiRunpodSettings`, `MpiSettings` (×2), `MpiEngineInstall` (×3), `MpiErrorDialog`, `MpiNewProject` (×2), `MpiToolOptionsResize` (×2). All eleven happen to resolve a real control (`.mpi-input__field`, or `input` inside the instance), so none of them is broken. (`MpiTreePicker` and `MpiStylePicker` still carry no setter, and `MpiDropdown` exposes only `setOptions` — same gap, not yet paid for.) The one that did NOT resolve a control: `MpiBaseFlow._writeFieldValue` queried the **mount HOST div** (`.mpi-base-flow__field-text`) and assigned `.value` to it. Assigning `.value` on a `<div>` creates an expando property — **no error, no exception, no log, no repaint, clean exit** — so a Flow's Enhance button ran the op, got its text, stored it correctly, and left the box empty. It read as a broken enhancer for a whole session; the enhancer was never involved (MPI-504).

`el.setValue(v)` now exists. It sets the field, keeps `props.value` in sync, re-runs the auto-height measure when `autoHeight` is on, and **emits nothing** — a programmatic write is not user input, and an `input`/`change` echo would run the caller's own onChange against the value it just wrote. Use it. The hand-reaches that predate it are not broken and were left alone, but they are the habit that produced the bug.

## MpiInput size='sm' width cap

`MpiInput size='sm'` sets `.mpi-input--sm .mpi-input__field { width: 6ch }` on the `<input>` element directly, not the wrapper. Setting width on `.mpi-input` does nothing. To widen: target the field with equal-or-higher specificity (e.g. `.mpi-model-settings__lora-strengths .mpi-input--sm .mpi-input__field { width: 8ch }`). 8ch clears `-1.00`; 7ch still clips. Overlay renders 0-size on the landing page — don't measure through the overlay. CSS cache trap: edit + reload full page before measuring, not just re-mount. Inline-row trap: to put a unit label next to a small input (`Min System RAM [ 0 ] GB`), give the input's HOST `width: auto` — a fixed host width (e.g. 90px) reserves dead space so the unit floats far right, because the `--sm` field is only ~6ch.

## MpiInput `type='number'` — bind `change`, not `input` (2026-08-04)

Number mode emits BOTH: `input` on every keystroke (raw, possibly half-typed) and `change` only on blur / Enter / wheel, already clamped to `min`/`max` and rounded (`MpiInput.js` `commit()`). Binding both — the natural-looking `on('input', …)` + `on('change', …)` pair — means every handler runs per keystroke on a partial value. In `MpiToolOptionsResize` that dispatched a real preview workflow mid-type: typing the `1` of `1024` sent `width: 1`, which thumb-scaling plus the node's ratio math rounded to 0 on the other axis → an error dialog reading `ImageResizeKJv2 failed: ValueError: height and width must be > 0`. **Default to `change` alone.** Add `input` only when live per-keystroke feedback is genuinely wanted, and never when the handler dispatches work.

## MpiButton icon mode REWRITES `variant` (2026-08-04)

Passing `icon` switches MpiButton to icon mode, where `variant` is not honoured as given: only `danger` and `ghost` pass through, and **everything else — `primary`, `secondary`, `outline` — collapses to `mpi-btn--secondary`** (`MpiButton.js:70`). Two consequences: `outline` is unreachable in icon mode (asking for it silently yields secondary), and `ghost` is the one value that removes the surface+border, so it reads as an unstyled label rather than a button. Text mode (no `icon`) honours all five, but has no icon slot — you cannot get `outline` AND an icon. **To match a sibling button, copy its props rather than reasoning from variant names**: the Resize panel's Apply is `{ icon:'check', label:'Apply', variant:'primary', size:'sm' }`, and any button meant to look like it uses exactly that shape. Base `.mpi-btn` is already `justify-content: center`, so a `width: 100%` rule on the host row centres icon+label with no extra flex work.

## Hint / label line-height — set `display:block`, not just line-height (2026-07-13)

`.mpi-settings__hint` is a `<span>` with no `display` set → it stays `inline` and takes `body { line-height: 1.6 }`'s line-box metrics, NOT the `.mpi-settings__hint { line-height: 1.5 }` rule, when the hint is injected by a DIFFERENT component's sheet than the one defining the class (a `ce()`-built hint in `MpiRunpodSettings` vs the rule in `MpiSettings.css` — sheet load order lets `body` win). Symptom: one hint has visibly looser leading than its siblings; overriding `line-height` (even inline `line-height:0`) does NOTHING because an inline span's used leading follows the block container. FIX: `display: block` on the span (breaks it off the body's inline line-box) + the `line-height` you want, scoped in the RENDERING component's own sheet. Burned ~an hour chasing this as a line-height bug when it was a `display` bug.

## MpiCanvasViewer spinner flags

`MpiCanvasViewer` spinner visibility = `_isGenerating || _isLoading`. Two separate setters, both flip `.mpi-canvas-viewer__spinner--visible` via `_syncSpinner()`. `el.setGenerating(bool)` = model-driven generation flow; `el.setLoading(bool)` = internal-only async stalls (4K/8K decode + canvas remount). When adding any async path that leaves canvas blank, wrap with `_setLoadingSpinner(true/false)` via try/finally. Do NOT route through `setGenerating` — consumers (mascot peek) read it separately. `MpiVideoViewer` mirrors the same pattern.

## MpiSlideOver popup-open opt-out (MPI-79)

`Overlays.request()` fires `ui:close-all-popups { reason: 'overlay-open' }` on every overlay/modal open. `MpiSlideOver` ignores `reason === 'overlay-open'`; Escape and `Overlays.reset()` still close it. Click-away close was REMOVED entirely (per card: annoying). Transient popups (dropdowns, context menus) ignore the arg and still close on any pulse. Only long-lived panels opt out by checking `payload?.reason === 'overlay-open'`.

## MpiToast — DOM as source of truth + overlay-stash exemption

MpiToast caps visible toasts at `MAX_VISIBLE_TOASTS = 2`. Visible count = live DOM query (`qsa(':scope > .mpi-toast:not(.mpi-toast--queued)', stack)`), NEVER a counter var. Queued toasts mount INSIDE `.mpi-toast-stack` hidden via `.mpi-toast--queued { display:none }` — NEVER park a toast in `document.body`. Queued toasts get NO timer until promoted. `dismiss()` is idempotent. One clean drain path. Verify any toast change with a burst test: fire 5+ toasts, assert never >2 visible, none at top-left/out-of-stack, full drain to zero.

**A full-page `body`-mount `MpiOverlay` (e.g. Model Library, MPI-215) buries a toast fired while it's open**, even though the stack is `z-index: 20000` (way above the overlay's ~10000-10030) — z-index alone did NOT save it. Root cause was DOM, not paint order: `MpiOverlay._doShow` stashes (detaches) every `document.body` child except the backdrop + titlebar, and `.mpi-toast-stack` used to get swept up in that stash. `MpiOverlay.js` now explicitly exempts `.mpi-toast-stack` from stashing. Belt: `MpiToast`'s safety-net `MutationObserver` (detects a toast yanked from the DOM outside its own dismiss path) used to fire-and-drain on the FIRST mutation — a stash/rebuild transiently detaching the toast's ancestor tripped it and instant-killed a just-mounted toast (`--closing`, opacity 0, straight to dead) before the user ever saw it. It now re-checks one `requestAnimationFrame` later before treating the detach as permanent. Debugging note: a toast dying instantly reads as "did the emit even fire" — verify with the DOM (`document.querySelector('.mpi-toast-stack .mpi-toast')`, check `classList` + computed `opacity`), not just the `Events.emit` call site.

## MpiModal-based dialogs — `hide()` BEFORE `emit()` (MPI-362)

`MpiModal.destroy()` unbinds Enter, drops its subscriptions and disconnects its observer — it does **not** take the backdrop/wrapper down; only `hide()` does. Callers routinely destroy a dialog inside its own action handler (`dlg.on('ok', () => { dlg.destroy(); … })`), so a button that emits first and hides second leaves a blurred backdrop stranded over the workspace with the Overlays slot still held. Order every action handler `el.hide(); emit(…)`. Same reason a modal-based dialog should define `el.destroy = () => { modal.el.hide(); modal.el.destroy?.(); }` — Escape hides without emitting, so a later `destroy()` must still be safe. (`MpiOkCancel` gets away with emit-then-hide only because its consumers happen to `await` before destroying.)

**`props.width` is read ONCE, at portal time — a dialog that changes width per phase cannot go through it (MPI-519).** `_doShow` applies `props.width` to the wrapper when it builds the portal, so mutating the props object later does nothing to an already-open modal, and a multi-phase dialog (`MpiEngineInstall`: a two-card choice at 760px, every other phase at 520px) would be stuck at whichever width it opened on. Mount at the WIDEST value and set `max-width` on `modal.el` (the `.mpi-modal` element) per phase instead — `.mpi-modal-wrapper` paints nothing, so a narrower phase just reads as a centred box inside it, and a `transition: max-width` on the same element makes the change a morph rather than a jump.

## MpiPopup reuse — `mount()` wipes the anchor + `transition: all` animates restyles (MPI-264)

Reusing `MpiPopup` as a hover tooltip (rail buttons, MpiHistoryTools) surfaced two traps. (1) **`ComponentFactory.mount(container, …)` does `container.innerHTML = html`** — mounting a popup INTO the anchor element WIPES the anchor's own content (the button's icon vanished). Mount into a throwaway `<div>` and pass the real anchor as `triggerEl:` (the popup portals itself to `<body>` on setup anyway). (2) `.mpi-popup` has `transition: all var(--t-fast)` — any runtime class/style change you apply after mount (compact-skin class, `left` nudge) gets ANIMATED, reading as a big→small "shrink". Fix on the consumer side (don't touch the shared primitive): scope `transition: opacity …, transform …` on your own modifier class so size/position snap instantly and only the entrance fade+slide animates. MpiPopup has no size variant — restyle via a `.mpi-popup.mpi-popup--<yours>` modifier (double-class to beat `.mpi-popup` specificity regardless of stylesheet load order).

## MpiStylePicker — image-card popup: measure the pitch, don't fight scroll-snap (MPI-301)

`MpiStylePicker` (Primitive) = trigger button + portalled, horizontally-scrolling grid of image cards (title on top, 4:5 thumb below). Built for style LoRAs; **reuse it for any "pick one of N image-representable things"** — it takes `styles: [{label, image}]`, `value` (index), `imageBase`, and emits `change {index, label}`. Three lessons worth carrying: (1) **portal + center on the trigger** — position with `left = triggerCenter - panelWidth/2` then clamp BOTH edges to the viewport (a left-anchored panel spills off-screen for a trigger near the right edge); anchor above the trigger since the prompt box lives at the viewport bottom. (2) **Wheel must step ONE CARD, not raw `deltaY`** — `scrollLeft += deltaY` leaves a half-cropped card at the panel edge. Step by a **live-measured pitch** (`cards[1].offsetLeft - cards[0].offsetLeft`, never a hardcoded width+gap — it silently rots when either token changes) and `preventDefault()` so the gallery behind doesn't scroll. (3) **`scrollIntoView({inline:'center'})` FIGHTS `scroll-snap-align: start`** — the open-jump to the selected card must use the same boundary the snap uses (`scrollTo({left: card.offsetLeft - grid.offsetLeft, behavior:'instant'})`), or opening lands mid-snap and visibly slides. Cards are self-contained (they do NOT reuse the library's `.mpi-tile` CSS — that carries chips/body the picker doesn't want).

## MpiButton as a toggle-row — swap icons, don't add a variant

A full-width on/off toggle row = `MpiButton { icon:'circle', iconActive:'check', toggleable, active }` in icon mode — off shows the hollow circle, on swaps to the check. No new variant/component needed: passing `iconActive` auto-enables toggle; drive it with `el.setActive(bool)` and read the `toggle` event `{active}`. Wrap the button in a **row `<div>` that owns the surface, border, and all hover/active fill**, and strip the button's own bg+border in EVERY state — `,:hover, .is-pressed, :active, .is-active, .is-active:hover` — scoped under the row + matching `.mpi-ibtn`, with `!important`. Otherwise the primitive's `.mpi-btn.mpi-ibtn:not(--ghost).is-active / .is-pressed` heat-fill (MpiButton.css) out-specifies your override and paints a SECOND heat rect behind the label → two shades of pink + a transition flicker on press. On the heat fill the primitive also forces the label to `--ink-1` (white, punishing on pink) — override to dark ink (`oklch(0.20 0.03 355)`) locally; the icon inherits `currentColor` so it darkens too. Needs a hollow `circle` glyph in `js/utils/icons.js` (added there).

## MpiQueuePanel — signature-based diff render

`MpiQueuePanel._render()` uses signature-based diff render (identity + status + display fields + `previewUrl ? 1 : 0` flag). If sig matches, only `<img src>` is swapped via `_cardByJobId` map; if different, full rebuild. Why: Latent preview ticks fire `generation-queue:changed` rapidly — rebuilding the whole list each tick loses CSS `:hover` mid-frame → hover background flickered. Include "presence" boolean in signature so first-tick transitions (null → url) still force one rebuild.
