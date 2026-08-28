# MPI-638 checklist

## 1. Shared label helper
- [x] Export `disambiguatedName(id, siblingIds)` from `js/data/modelRegistry.js` — model name,
      plus `sizeTierLetter` only when a sibling in the same slot shares the display name
      (the motivating clash was Klein 9B / 4B, MPI-567 - though MPI-619 has since renamed
      those two; the test finds a LIVE clash rather than hardcoding one).
- [x] Cannot live in `flowsRegistry.js` — one-way import, `modelRegistry.js:26`.

## 2. Flow Library — skip the drawer, drop the cog
- [x] Tile `select` → Ready + `state.currentPage === PAGE_GALLERY` → `el.close()` +
      `Events.emit('flow:open')`. Everything else still `openDetail(flow)`.
- [x] Remove the cogwheel from `_modelChoiceHtml` / `_mountModelChoice`; keep the dropdown.
- [x] Field caption: `slot.label` only when the flow declares 2+ slots, else `Model`.
- [x] Use `disambiguatedName` instead of the local `_label`.
- [x] Sweep `MpiFlowLibrary.css` for CSS orphaned by the cog removal.

## 3. MpiBaseFlow — the model row on the run slide
- [x] `_buildLoraRacks` → `_buildModelSlots`: one row per slot, `[dropdown|name][cog]`.
- [x] Candidates filtered to `state.s_installedModelIds`.
- [x] `>1` installed → `MpiDropdown`; exactly 1 → static name span.
- [x] Cog only when `slot.loras`; icon-only; `info` names the model.
- [x] Caption rule as above (nothing at all when the flow has one slot).
- [x] Pick → `setFlowModel` + rebuild the ROW in place. Never `_renderSlide()` — it tears down
      and replays the result pane, the compare view and the video player.
- [x] Keep the per-slot loop. Today every caller renders one row; the loop is the contract.
- [x] `.mpi-base-flow__loras` CSS: stacked column → dropdown+cog row inside 236px.

## 4. Tests
- [x] `tests/flow-model-choice.test.cjs` — the run-slide picker filters to installed; the
      caption rule; the Library picker still offers uninstalled candidates (MPI-599 intact).
- [x] `tests/flow-lora-rack.test.cjs` — retire the Library cog markup pin, re-point at the frame.
- [x] `tests/desktop/flow-lora-button.spec.js` — rewrite onto the run slide: open the flow,
      assert one row, one cog, and that it emits/opens on the slot's resolved model.
- [x] `npm test` green.
- [x] `npm run test:desktop` green.

## 5. Live check
- [x] Own instance only — `npm run app:isolated`, never the user's `:3000`.
- [x] Ready flow tile → opens the frame directly, no drawer.
- [x] Uninstalled flow tile → drawer with Install.
- [x] Character Sheet / Outpaint (Krea 2 pair) → dropdown + cog on the run slide, no
      "Render model" caption anywhere.
- [x] Switch the pick → the cog follows the new model.

## 6. Docs
- [x] `docs/playbooks/add-flow/any-of-models.md` § The picker — two surfaces, two questions,
      the installed-only rule, the caption rule.
- [x] `docs/playbooks/add-flow/04-overlay-and-shell.md` — the flow diagram still routes every
      open through the slide-over.
- [n/a] `docs/releases/UNRELEASED.md` — NO entry. Flows have never shipped, so no user has seen the drawer or a slot label; per that file's own rule this is part of the debut feature, not a change to it.

- [x] `docs/playbooks/add-flow/ui/lora-rack.md` — the cogwheel is one surface now, and carries no label.
- [x] Healed in passing: `04` § Dev-gate said the gate was still on. MPI-589 lifted it.
- [x] `.claude/rules/component-mounts.md` — permission given; four stale entries healed (two predate this card: MPI-572's per-flow component, MPI-589's dev-gate).
- [x] `04-overlay-and-shell.md` split to meet the 200-line budget: the result-pane sections moved to `ui/result-pane.md` (213 -> 117), routed from every index.
