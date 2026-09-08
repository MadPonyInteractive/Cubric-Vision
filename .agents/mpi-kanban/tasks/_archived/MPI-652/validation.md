# MPI-652 — Validation

Ran 2026-08-29 against an own isolated instance (`npm run app:isolated`, port 63494,
profile `%TEMP%\cubric-agent-profile`), driven with `playwright-cli`. The user's `:3000`
was never touched — confirmed still listening after the probe instance was killed.

## The two root causes, before and after

| | before | after |
|---|---|---|
| `.mpi-flow-library__scrim` | no CSS anywhere in the repo — `getBoundingClientRect()` **0×0**, `on(scrim,'click',…)` armed on nothing | `absolute`, `inset:0`, z-30, measured **1280×688** |
| `MpiSlideOver` | no outside-click since `6ab9f28a` | body-portaled sibling scrim, z-99, transparent, `pointer-events:auto` only while `is-open` |

## Plan § Verification — 7 steps

1. **Flows → open a tile → click the dimmed grid → drawer closes.** PASS.
   `elementFromPoint(300,400)` returned `mpi-flow-library__scrim is-open`; a real
   mouse click there left `drawerOpen:false, scrimOpen:false`. The dim is real:
   computed `background: oklch(0.14 0.02 350 / 0.5)`, `opacity` 0.99 while open.
   Screenshot taken (grid dimmed, drawer bright — identical to the Model Library).
2. **Drawer must survive a portaled child (MPI-608).** PASS **by equivalent path**.
   The LoRA cogwheel could not be reached: this profile has no installed LoRA, so no
   flow drawer renders one. Substituted the Character Sheet drawer's model
   `MpiDropdown` — same class of portaled child, `.mpi-dropdown__list` at z-11000.
   Opened it and selected an option: `drawerOpen:true, scrimOpen:true` afterwards.
   **The cogwheel itself is unverified** — it needs a machine with the weights.
3. **Settings / Hotkeys / About → click behind → panel closes.** PASS, all three.
   `aria-expanded` went `false`, scrim lost `is-open`, and BOTH nodes left the DOM
   (`.mpi-slide-over` and `.mpi-slide-over__scrim` polled to `false/false`) — no leak
   from the shared `onEnd`.
4. **Settings → audio-device dropdown → select an option → panel SURVIVES.**
   PASS. This is the exact MPI-79 annoyance. List opened at z-11000 over the z-100
   panel; clicking the option closed the list and left `aria-expanded:"true"`.
5. **Settings → a dialog opens over the panel → panel SURVIVES, and dismissing it
   leaves the panel open.** PASS. Mounted a real `MpiOkCancel` over the open panel:
   panel stayed `aria-expanded:"true"`, and `elementFromPoint(200,400)` returned
   `mpi-modal-backdrop` (z-10009) — every point outside the dialog hits the backdrop,
   never the scrim. CANCEL dismissed it with the panel still open and `scrimOpen:true`.
6. **Cue must have no scrim and must not close on a click away.** PASS.
   `Events.emit('slide-over:open', { extraClasses: 'mpi-slide-over--queue' })` produced
   a panel with `.mpi-slide-over--queue` and **no `.mpi-slide-over__scrim` at all**; a
   real click at (200,400) left it `aria-expanded:"true"`.
7. **Escape and X still close all panels.** PASS. Escape on Settings and the X on
   Hotkeys both closed the panel and removed the scrim node.

## Suites

- `npm test` — **773 pass, 0 fail**.
- `npm run test:desktop` — **40 passed** (2.9m), including
  `workspace-sweep.spec.js › settings slide-over mounts and closes`,
  `runpod-settings-extract.spec.js`, `model-settings-popup.spec.js` and
  `popup-contract.spec.js`, i.e. every spec that opens a slide-over or a picker over one.
- `npx eslint` on the changed JS — clean.

## Why the MPI-79 regression cannot return

Structural, not a `closest()` exemption list. Every portaled child renders far above both
panel and scrim (`.mpi-dropdown__list` z-11000, `.mpi-popup` z-9999, `MpiModal`
z-10009/10010, and `Overlays` hands out z from BASE 10000 in steps of 10). Their clicks
land on those elements and never reach the z-99 scrim, so the scrim only ever catches
clicks on app chrome BEHIND the panel — measured in steps 4 and 5 above.

The `{ reason: 'overlay-open' }` guard at `MpiSlideOver.js` is untouched; it does a
different job and is still required.

## Deviation from the plan

The plan's slide-over scrim was `inset: 0`. Shipped as `inset: var(--titlebar-h, 36px) 0 0 0`,
matching `.mpi-modal-backdrop` and `.mpi-overlay`: a full-bleed fixed portal would have
swallowed the custom OS titlebar's minimise/maximise/close controls while a panel was open.
`--titlebar-h` collapses to 0px in F11 fullscreen, so no gap appears when there is no bar.
Measured `top: 32px` live.
