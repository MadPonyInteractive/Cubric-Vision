# MPI-264 — History rail tools: hover tooltip via MpiPopup

## Goal
Hover any Group History rail tool → floating tooltip on the RIGHT showing the tool
name (or the disabled reason). Reuse the `MpiPopup` primitive. No status-bar-only
discoverability, no `title=`, no new component.

## Constraints / decisions (user-confirmed)
- **Lifecycle:** mount-per-hover — mount `MpiPopup` on mouseenter, `destroy()` on mouseleave.
- **Position:** `'right'` (fixed side; rail hugs left edge).
- **Disabled:** show tooltip too — text = the button's `data-info` (already the reason).
- **Text source:** the wrapper's `data-info` attr (set in `_appendFlatButton`, already
  = disabled reason OR `def.info || def.mode`). No new data threading.

## Files
- `js/components/Compounds/MpiHistoryTools/MpiHistoryTools.js` — add hover wiring in `setup`.
- (no CSS change expected — MpiPopup ships its own styles; verify caret/side visually.)

## Steps
1. Import `MpiPopup` into MpiHistoryTools. → verify: import resolves, no lint error.
2. In `setup`, add a single delegated `mouseenter`/`mouseleave` handler bound via
   `on()` (from utils/dom) on `el`, matching `.mpi-history-tools__btn`. Track one
   live tooltip instance ref (`_tip`). On enter: if a `_tip` exists, destroy it;
   read `target.getAttribute('data-info')`; if non-empty, mount
   `MpiPopup.mount(target, { active: true, position: 'right', triggerEl: <the button el>, variant: 'glass' }, textNode)` — pass the name as the child/content. On leave: `_tip?.destroy(); _tip = null`.
   → verify: hover shows popup on right with correct name; move between buttons swaps text.
   - NOTE on content: MpiPopup renders `children` as raw HTML in `__content`. Pass the
     tool name as an escaped text string (names are static/internal — low risk, but
     use textContent-safe insertion, not attacker input).
   - NOTE on anchor: MpiPopup captures `triggerEl` (or parentElement) at MOUNT into a
     closure — that's why we mount fresh per hover instead of reusing one instance.
3. Ensure teardown: collect the `on()` unsub in `_unsubs`; in `el.destroy` also
   `_tip?.destroy()`. → verify: nav away mid-hover leaves no orphan `.mpi-popup` node in body.
4. Register nothing new in preloadStyles (MpiPopup.css already registered — confirmed
   preloadStyles.js:19). types.js already documents MpiPopupProps (500). No new component.

## Verify (definition of done)
- [ ] Hover Crop → "Crop" tooltip appears to the RIGHT of the icon, with caret.
- [ ] Hover a disabled tool → tooltip shows the disabled reason.
- [ ] Moving cursor between rail buttons swaps the tooltip text, no stacking.
- [ ] Mouseleave → tooltip gone.
- [ ] Navigate away (History → Gallery) while hovered → `document.querySelectorAll('.mpi-popup').length` back to baseline (no orphan).
- [ ] Status-bar `[data-info]` behaviour unchanged (both can coexist).

## Out of scope
- Tooltips on other rails/toolbars (this card = Group History rail only).
- Delay/animation tuning beyond MpiPopup defaults.
