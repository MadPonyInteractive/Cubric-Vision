# MPI-724 — checklist

Plan: `plan.md`. Steps map 1:1 onto its § Implementation.

## 1 — Extract the shared parts
- [x] `Compounds/MpiModelSettings/loraSlotParts.js` exports `buildStrengthsRow`,
      `buildBypassBtn`, `applyBypass`, `baseName`, `resolveInfo`, `isMissing`
- [x] `buildStrengthsRow` returns `{ el, modelInput, clipInput }` (handles needed by § 4)
- [x] `MpiModelSettings.js` imports them, private copies deleted
- [x] Both overlay mount paths keep a handle registry keyed `` `${stageKey ?? ''}:${index}` ``
- [x] Verify: overlay still mounts 6 slots per stage, picker + strength + bypass all work

## 2 — MpiLoraRack Compound
- [x] `MpiLoraRack.js` + `.css`, registered CSS path, BEM per plan
- [x] Flat model: filled slots only, ORIGINAL index preserved, `LORAS` label
- [x] Staged model: per-stage groups in declared order (HIGH NOISE then LOW NOISE),
      header = `${stage.label} LORAS`, empty stage renders nothing
- [x] Nothing filled / no model / no project → renders NOTHING (no label, zero height)
- [x] Row = MpiBadge (basename, no extension, `title` = full path) + strengths + bypass
- [x] Badge NOT `pill` — base `.mpi-badge` is already `--r-2`, matching the row, the
      strength fields and the bypass button; name cell stretches so the badge is the
      same height (measured 26 / 26 / 25.6). Fabio confirmed in his own app
- [x] No picker, no `+`, no clear — the rack can never change the SET
- [x] `isMissing` → `--missing` + title, never heals
- [x] Writes emit `settings:model:update { modelId, key:'loras', value }`, same shape as
      `_autoSave()`

## 3 — Mount in the popup
- [x] `#settings-lora-slot` FIRST child of `.mpi-prompt-box__settings`
- [x] Mounted once at popup build; destroy wired into teardown
- [x] `rack.el.setModel()` from the tail of `_refreshOpSlot()` — ONE call site
- [x] ~~`rack.el.refresh()` from the popup open handler~~ REVERSED: that read lands
      inside projectService's 300ms debounce and showed an EMPTY rack for LoRAs just
      set. openPopup no longer reads; the rack's listener already covers it. See
      plan.md § Plan Drift
- [x] `positionPopup()` re-called after a rebuild while `popupActive`

## 4 — Two-way live sync
- [x] Both surfaces listen to `settings:model:update`, filter `key==='loras'` + modelId
- [x] `_selfWrite` flag skips own echo (emit is synchronous)
- [x] Rack ← overlay: signature change → rebuild; same signature → in-place setValue/applyBypass
- [x] Overlay ← rack: always in-place; `_mountLoraSlots` never re-runs on a rack write
- [x] No `state:changed` subscription anywhere in the rack

## 5 — Types + doc
- [x] `types.js`: `MpiLoraRackProps` + instance methods
- [x] `docs/component-contracts.md`: contract, sync protocol, self-echo guard

## Verification (plan § Verification, 1-10)
- [x] `npm run lint` + `npm run lint:components` clean
- [x] `npm test` green
- [x] Live in `app:isolated`: one LoRA → label + one row, values match
- [x] Two → two rows; cleared → nothing at all
- [x] Sync rack → overlay, and `project.json` index matches
- [x] Sync overlay → rack without tearing down an open TreePicker
- [~] Bypass → dispatched graph: NOT run, needs a GPU generation and this card
      changes no injection code (MPI-223 path untouched) — see validation.md
- [x] Wan: HIGH/LOW groups, model-strength only, stages independent
- [x] No-LoRA model and upscale-type model → nothing
- [~] Model switch with popup open: the re-read half is covered (refreshControls()
      mid-debounce, check 15) but a real picker-driven model swap with the popup OPEN
      was not exercised — the anchoring claim is unmeasured
