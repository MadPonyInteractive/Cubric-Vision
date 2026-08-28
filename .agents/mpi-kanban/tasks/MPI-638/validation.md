# MPI-638 validation

Clock checked against GitHub before any timestamp was written: local `07:24:10Z` vs
`Date: Fri, 28 Aug 2026 07:24:11 GMT` — 1s apart, no VPN skew.

## What shipped

| # | Change | Files |
|---|---|---|
| 1 | Ready flow tile opens the frame directly; the drawer is for a flow that is not ready | `MpiFlowLibrary.js` (`_pick`) |
| 2 | Model dropdown + LoRA cogwheel paired, one row per slot, on the run slide | `MpiBaseFlow.js` (`_paintModelSlots`), `MpiBaseFlow.css` |
| 3 | The slot `label` renders only when a flow declares 2+ slots | both components |
| 4 | LoRA cogwheel REMOVED from the drawer (was duplicated MPI-608 + MPI-613) | `MpiFlowLibrary.js`, `.css` |
| 5 | `disambiguatedName(id, siblingIds)` shared by both pickers | `modelRegistry.js` |

## Evidence

### Automated

- **`npm test` — 771 pass, 0 fail.** Up from 769: two new cases in
  `flow-model-choice.test.cjs` (the direct-open branch shape; the run-slide installed-only
  filter, and that the drawer's option list stays UNfiltered so MPI-599 is not reversed by a
  tidy-up).
- **`npm run test:desktop` — 38 pass, 0 fail.** Up from 37: `flow-library-skips-drawer.spec.js`
  is new.
- Four source pins went red on purpose and were re-pointed, not worked around: the drawer's
  cogwheel markup, the run slide's `flowLoraPhases` call, the unconditional `${slot.label}`
  caption, and `sizeTierLetter(id)` living in the component (it now lives in the shared helper).

### Mutation-checked — three mutants, all killed

Each mutant was written to disk, the spec run, and the file restored inside `finally` (a crash
mid-run otherwise leaves a real source file mutated and the mutant reads as somebody's own bad
edit). Restores verified byte-identical.

| Mutant | Spec | Result |
|---|---|---|
| cogwheel opens `slot.models[0]` instead of the resolved id | `flow-lora-button.spec.js` | **survived** the first draft — killed after the spec was strengthened |
| `_pick` drops the `currentPage === PAGE_GALLERY` half | `flow-library-skips-drawer.spec.js` | killed |
| `_pick` drops the `flowAvailability().available` half | `flow-library-skips-drawer.spec.js` | killed |

**The first one is the finding worth keeping.** The original spec asserted the cogwheel's
`aria-label`, which is derived from the same resolved id — so a cogwheel wired to a FIXED model
rendered an identical row with an identical tooltip and the spec passed. It now reads
`settings:model:select`, the id the panel actually opens on. This is the exact silent shape
MPI-610 was written to catch, and it had come back in the assertion rather than the code.

### Live, on my own instance (`npm run app:isolated`, port 55796 — the user's :3000 untouched)

Real project opened in the Gallery so the `main-area` overlay had real geometry.

- **Row geometry, measured:** control column 236px; the row 236x39; dropdown 182 wide, cogwheel
  46 wide, 8px gap — sums exactly to 236, sitting directly above Generate.
- **Cogwheel carries no text** (`textContent` empty), which is the MPI-638 point.
- **No caption rendered** for the Character Sheet's single slot — screenshotted; the column reads
  `[Krea 2 v][cog]` above GENERATE, with no "Render model" anywhere.
- **Pick switch:** selecting Krea 2 NSFW → `flowModelIds` returns `['krea2-nsfw']`, cogwheel
  `aria-label` becomes "LoRAs for Krea 2 NSFW", still one slot, **and the result pane survived**
  — confirming the row repaints rather than the slide.
- **Direct open:** Head Swap tile with `qwen-edit` installed → badge "Ready", `flow:open`
  emitted once with `head-swap`, `#flow-detail-panel.is-open` absent, `.mpi-base-flow` mounted.

Side effects cleaned up: the probe project was deleted through the app's own
`/delete-project` (id-matched), the screenshot removed, and the instance killed by the PID
resolved from its own port — never by a name pattern, which is what killed a live session on
2026-08-21. `:3000` re-checked 200 after the kill.

## Decisions taken during the work

- **No `docs/releases/UNRELEASED.md` entry.** Flows have never shipped in any released build, so
  no user has ever seen the slide-over or a slot label. Per that file's own § Fixes rule, this is
  part of the debut feature, not a change to it. Writing "we improved the Flow Library" would be
  a claim about history that never happened.
- **The run-slide picker filters to installed candidates; the drawer's does not.** Deliberate and
  pinned both ways. `flowModelIds` lets a pick win uninstalled (MPI-599) so the user can say
  "download that one instead" — but inside an OPEN flow that would flip it unavailable and die on
  a toast at Generate with no Install button on screen.
- **A one-candidate slot renders the model NAME, not a one-option dropdown.** A control that
  cannot change anything claims a choice that is not there.

## Healed in passing

`04-overlay-and-shell.md` § Dev-gate claimed `dev_mode` "hides BOTH entry points (Landing nav +
Gallery radial)" and that the gate "stays until >=4 flows exist". **MPI-589 lifted it** — Landing
nav, the gallery bar's Flows button and Tab are all user routes; only the Ctrl+Tab radial is still
gated (`navigation.js:353`). The doc said the opposite of the code. The flow diagram carried the
same stale "(dev-gated)" label and was corrected with it.

## Open — needs the user

1. **`.claude/rules/component-mounts.md:252` describes the old mount** (`.mpi-base-flow__loras`,
   `flowLoraPhases`, `label: <slot label>` e.g. "Render model"). It is now wrong on all three.
   CLAUDE.md § Cardinal Rule 5 forbids editing `.claude/rules/` without explicit permission, so it
   was left alone — say the word and it is a two-line fix, or `/mpi-component-audit`'s map refresh
   will take it.
2. **`04-overlay-and-shell.md` is 213 lines against the 200-line budget** (`docs/README.md:11`).
   It was already at 196 before this card — 4 lines of headroom — and this added ~17 of load-
   bearing content after two compression passes. The documented remedy is a split, which is its
   own piece of work on a file this card does not own. Flagging rather than silently breaching or
   silently restructuring.
