# MPI-652 — Click-away closes every slide-over surface (Cue excepted)

## Why this card exists

Fabio: *"Some slideovers in the app close when we click away. Some don't."* Correct, and
the inconsistency has **two unrelated causes** — one a deliberate decision that has since
been superseded, one a plain missing CSS rule. Both are small; they are one card because
they are one user-visible symptom and one round of visual verification.

## Current behaviour — measured 2026-08-29

| Surface | Component | Click-away? |
|---|---|---|
| Model Library detail drawer | `MpiModelManager` | YES — `.mpi-model-library__scrim` styled, click wired |
| **Flow Library detail drawer** | `MpiFlowLibrary` | **NO — cause B** |
| Settings slide-over | `MpiSlideOver` | **NO — cause A** |
| Hotkeys slide-over | `MpiSlideOver` | **NO — cause A** |
| About slide-over | `MpiSlideOver` | **NO — cause A** |
| Cue (generation queue) | `MpiSlideOver` (`--queue`) | NO — **DELIBERATE, leave it** |

### Cause A — the handler was removed on purpose, and the reason expired

`6ab9f28a` (MPI-79, 2026-06-14) removed the outside-click handler from
`js/components/Compounds/MpiSlideOver/MpiSlideOver.js`. Commit body:

> Click-away also closed the panel, which the user found annoying.

The SAME commit landed the actual fix for the actual complaint: `Overlays.request()` now
emits `ui:close-all-popups` with `{ reason: 'overlay-open' }`, and the panel ignores that
pulse, so a child modal (`MpiOkCancel` / `showError` / RunPod confirms) no longer takes the
panel down with it. That guard is what was needed. The click-away removal was collateral —
the annoyance was portaled children (the Settings device `MpiDropdown` list, confirm
dialogs) reading as "outside" and dismissing the panel. Same bug class later solved
properly in `MpiPromptBox` (~1490) and in MPI-608 for the Flow Library drawer.

Fabio, 2026-08-29: *"I think I asked for that behaviour for something that no longer makes
sense."* Confirmed against the commit.

### Cause B — the Flow Library scrim is armed on nothing

`js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js:68` renders
`<div class="mpi-flow-library__scrim" id="flow-detail-scrim">` and `:420` wires
`on(scrim, 'click', _closeDetail)`. Both correct. But:

```bash
grep -rn "flow-library__scrim" --include=*.css .
```

returns **nothing**. The class has no CSS anywhere in the repo — the element is an
unpositioned, empty, zero-height block with no hit area. The handler can never fire.

Root cause of the omission: the drawer was copied from the Model Library, and its geometry
class `.mpi-detail` is **shared** — defined only in
`js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.css:245`, borrowed
across a component boundary. The drawer therefore inherited working CSS for free and looked
finished. The scrim kept its own BEM block name (`mpi-flow-library__scrim` vs
`mpi-model-library__scrim`), inherited nothing, and nobody noticed. Same class of borrow
MPI-356 flagged for the tiles.

## Decisions already taken (Fabio, 2026-08-29)

1. **Cue is the exception.** It stays click-away-proof. It is deliberately docked above the
   prompt bar so *"its controls stay clickable"* (`38355fff`); a scrim there would close the
   queue on every prompt-bar click mid-generation.
2. Flow Library scrim: **tinted**, copied verbatim from the Model Library so the two
   libraries are identical.
3. Slide-over scrim: **transparent** — behaviour-only change, zero visual difference.

## Implementation

### Step 1 — Flow Library scrim CSS (fixes flows)

`js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.css`

Add the block-renamed twin of `MpiModelManager.css:234-243`:

```css
.mpi-flow-library__scrim {
    position: absolute;
    inset: 0;
    background: oklch(0.14 0.02 350 / 0.5);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--t-base) var(--ease);
    z-index: 30;
}
.mpi-flow-library__scrim.is-open { opacity: 1; pointer-events: auto; }
```

`.mpi-flow-library` already carries `position: relative` (`:40`), and the drawer is `z-40`,
so `z-30` lands between grid and drawer exactly as in the Model Library. **No JS change** —
the markup and the click handler are already there.

Verify: `grep -rn "flow-library__scrim" --include=*.css .` now returns the rule.

### Step 2 — MpiSlideOver scrim

`js/components/Compounds/MpiSlideOver/MpiSlideOver.js`

The factory template has a single root, and the scrim must be a SIBLING of the panel (a
child would sit inside the panel box). So build it in `setup` and manage it alongside the
panel's own body-append:

- create a bare `div.mpi-slide-over__scrim` in `setup`
- in `el.open()`, `document.body.appendChild(scrim)` BEFORE the panel append, then add
  `is-open` in the same reflow-forced frame the panel uses
- in `_doClose()`, remove `is-open` and remove the node in the existing `onEnd` handler —
  reuse it, do not add a second `transitionend` + 400ms backstop pair
- `_unsubs.push(on(scrim, 'click', _doClose))`
- **Cue opt-out:** skip creating the scrim entirely when
  `String(props.extraClasses || '').includes('mpi-slide-over--queue')`. One condition, and
  the payload already sets that class
  (`js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js:105`).

`js/components/Compounds/MpiSlideOver/MpiSlideOver.css`

```css
.mpi-slide-over__scrim {
    position: fixed;
    inset: 0;
    z-index: 99;          /* panel is z-100 */
    background: transparent;
    pointer-events: none;
}
.mpi-slide-over__scrim.is-open { pointer-events: auto; }
```

### Why the MPI-79 regression cannot return

Every portaled child renders far above both panel and scrim — `.mpi-dropdown__list` z-11000
(`MpiDropdown.css:85`), `.mpi-popup` z-9999, `MpiModal` z-10009/10010. Their clicks hit
those elements and never reach the scrim, so the scrim only ever catches clicks on app
chrome BEHIND the panel. This is structural: no `closest()` exemption list to maintain,
unlike the `document`-click route `MpiPromptBox` needs (detached-target guard plus four
escapes, `MpiPromptBox.js:1493-1509`).

The existing `{ reason: 'overlay-open' }` guard in `MpiSlideOver.js:116` stays exactly as
it is — it is doing a different job and is still required.

## Files this card owns (write these into files.json on the todo -> doing move)

- `js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.css`
- `js/components/Compounds/MpiSlideOver/MpiSlideOver.js`
- `js/components/Compounds/MpiSlideOver/MpiSlideOver.css`

## Verification

Own instance only — `npm run app:isolated`, never `:3000` (`docs/testing.md`).

1. Flows -> open any flow tile -> click the dimmed grid left of the drawer -> drawer closes.
   The dim itself is the visible proof step 1 landed.
2. Flows -> open a tile -> open the LoRA cogwheel (Model Settings) from inside the drawer ->
   drawer must SURVIVE (MPI-608 regression check).
3. Settings / Hotkeys / About -> click anywhere in the app behind -> panel closes.
4. Settings -> open the audio-device `MpiDropdown` -> click an option -> panel must SURVIVE.
   This is the exact MPI-79 annoyance; it must not come back.
5. Settings -> trigger a confirm/error dialog (RunPod section) -> panel must SURVIVE, and
   dismissing the dialog must leave the panel open.
6. Cue -> open with `Q` -> click the prompt bar, type, hit Run -> Cue must STAY OPEN.
7. Escape still closes all four panels; X still closes all four.

## Out of scope — separate card if wanted

Hoisting `.mpi-detail` and the scrim rules out of `MpiModelManager.css` into a shared
stylesheet. The cross-component borrow is real debt and is what hid cause B, but fixing it
means touching both libraries' CSS and is not needed to make click-away work.
