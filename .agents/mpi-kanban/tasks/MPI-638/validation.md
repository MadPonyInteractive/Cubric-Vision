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

## Follow-ups — CLEARED (Fabio gave permission 2026-08-28)

### `.claude/rules/component-mounts.md`

Permission was needed because CLAUDE.md § Cardinal Rule 5 forbids editing `.claude/rules/`
unasked. Four entries were wrong, and only one of them was mine:

| Entry | Was | Now |
|---|---|---|
| `MpiBaseFlow` internal mounts | `MpiButton` cogwheel with `label: <slot label>` in `.mpi-base-flow__loras`, from `flowLoraPhases` | the `[dropdown][cog]` row, from `flowModelSlots` + `flowModelIds`, no text label, `_destroyModelBtns` |
| `MpiBaseFlow` internal mounts | `<per-Flow uiComponent>` (e.g. `MpiFlowHeadSwap`) mounted into the content slot | **stale since MPI-572** — no per-flow component exists; declared `fields` render through `buildField` |
| `MpiBaseFlow` singleton entry | `props: { flow, uiComponent: Blueprint\|null }`, "maps `uiComponent` NAME -> blueprint" | `props: { flow, initialInputs? }` |
| `MpiFlowLibrary` singleton entry | "**Dev-gated** — the only emitters of `flows:open` … are `APP_CONFIG.dev_mode`-gated" | **stale since MPI-589** — three user routes; only the Ctrl+Tab radial is gated. Plus the MPI-638 `_pick` branch |

The `MpiFlowLibrary` internal-mounts section also gained the model dropdown (it was never
listed) and a note that the cogwheel is gone from there.

Two of the four predate this card by weeks. Verified against the code before rewriting
(`grep MpiFlowHeadSwap\|_flowComponents\|uiComponent js/` returns only comments about their
removal; `projectUI.js:79` and `navigation.js:73` carry the MPI-589 un-gating).

### The 200-line budget on `04-overlay-and-shell.md`

Split, which is what `docs/README.md:11` prescribes. The three **result pane** sections
(`result.compare`, the video player, surviving close -> reopen) moved to
`docs/playbooks/add-flow/ui/result-pane.md` — one subject, 103 lines, and the bulk of the file.

- `04-overlay-and-shell.md`: 213 -> **117**
- `ui/result-pane.md`: **109** (new)

Routed from every index that pointed at the moved sections: `ui/README.md` (pattern table, and
its "Result-pane polish" open item is now answered), `add-flow/README.md` (section table + two
checklist rows), `docs/flows.md` (topic table), and the two existing-flow files that cited
"§ The result pane" by name (`head-swap.md`, `ltx-upscale.md`). A relative-link sweep over
`docs/` finds no dead links from this move; the two it does find are pre-existing and unrelated
(`2026-06-14-v1.0.1.md -> patch-distribution.md`, and a `file://` absolute in `mpi-nodes.md`).

`npm test` re-run after the moves: 771 pass, 0 fail.

## Noted, NOT actioned

- `docs/playbooks/add-flow/ui/carousel-frame.md` is **496 lines** against the same 200-line
  budget and is not on the exempt list. Pre-existing, nothing to do with this card, and a split
  of it is real work with real judgement in it. Flagging only.
- While these docs were being written, a peer session had **uncommitted edits live in
  `MpiBaseFlow.js`/`.css`** — one tagged as an MPI-638 follow-up (`closable: false`, dropping the
  overlay X so the topbar's Flows button is the only exit) and one MPI-607 voice-library change.
  Left untouched and not committed. The docs here deliberately do not describe the X change: it
  is uncommitted and could still be revised.

## CI went RED on the first push, and the fix is recorded here

Run 33153649907 failed on `windows-latest` with **both suites green locally**. One test:
`flow-library-skips-drawer.spec.js` - `result.ready.opened` came back `[]` instead of
`["head-swap"]`, i.e. the Ready branch never fired on the runner.

**Cause: the spec inherited availability from the DISK.** `flowAvailability` is
`missing.length === 0 && missingDeps.length === 0`, and Head Swap declares two
`requiredDeps` (`qwen-lora-headswap`, `comfyui-inpaint-cropandstitch`). Their status comes
from `_flowDepStatusCache`, which a dev box fills from disk during the model sync. So
`s_installedModelIds` was stubbed identically in both places and the two machines still
disagreed: Ready here, Get-models on a bare runner.

**Fix:** stub the dep cache too - `setFlowDepStatus(FLOW, new Map(requiredDeps.map(id => [id, true])))`,
read off the descriptor rather than hardcoded so adding a dep to the flow cannot silently
re-break it.

**Diagnosis proved, not guessed.** The bare-runner condition cannot occur on this machine, so
it was simulated by flipping that stub to `false`: the spec then fails with CI's exact output
(`Array []` against `["head-swap"]`), and passes with `true`. Script restored the file in
`finally`, verified byte-identical.

Lesson for the next desktop spec: **stubbing `s_installedModelIds` is only half of
availability.** A flow with `requiredDeps` needs `setFlowDepStatus` as well, or the spec
passes on every developer machine and fails on CI alone.
