# MPI-475 — checklist

## Done — the ComfyUI half

- [x] **`MpiH3References` written** (`c:\AI\Mpi\ComfyUi-MpiNodes\h3.py`). 18 flat optional
      slots, empties dropped by the loaders' sentinel, survivors renumbered from 0 so core's
      index-based soundtrack pairing holds. Delegates the conditioning to core's own
      `MiniMaxH3ReferenceToVideo` rather than copying its tensor maths.
- [x] Registered in `__init__.py` (import + class map + display map), README row, changelog
      entry — the `new-node` command's steps 5-7.
- [x] Self-check: `python h3.py` asserts the renumbering, pairing across a gap, and both
      sentinels (a 1x512 strip and a real silent clip must NOT read as empty).
- [x] **Proved by output** — bench prompt `8da14ac3`, one reference image, 14 empty slots
      dropped, `Output_Video` written. Covers the one thing the self-check cannot: calling
      core's V3 `execute()` classmethod directly.
- [x] Committed and pushed (`ComfyUi-MpiNodes` `a603fc4`, main). No registry publish fired —
      `publish_action.yml` filters on `pyproject.toml`, which the commit does not touch.
- [x] **`generate_h3.py` handles both variants** (`8e40d43b`). `VARIANT_SPECS` carries the
      per-variant transformer, media titles, branch class and count; prune/bake/stage asserts
      stay shared. fl2va output byte-identical after the refactor.
- [x] `comfy_workflows/minimax_h3_r2va.json` baked — 49 nodes, correct ref2va transformer,
      `Input_Refs` titled, `ref_image_size` baked to `match`, zero leftover bench paths, all
      15 loaders `block_if_empty: false`.
- [x] Passes `validate-injection-rules.mjs`.

## Not started — the Vision half

- [ ] Dep entries for `minimax_h3_ref2va_pruned_int8_convrot` (~21 GB) at the **publisher's**
      URLs. NEVER re-hosted on R2 — the licence forbids redistribution.
- [ ] `models.js` ModelDef `minimax-h3-ref2va`. `type: 'h3'` reuses the ratio ladder.
- [ ] `progressStages` — needs a live run to count bars.
- [ ] Media-slot declarations: 9 image, 3 video, 3 audio. Fleet convention is `Input_Image` /
      `Input_Image_2` / … (first slot unnumbered) — see `commandRegistry.js`.
- [ ] The `ref_image_size` control, injected as `params['Input_Refs.ref_image_size']` via the
      MPI-359 dotted form. Must stay an UNLINKED widget or injection refuses to clobber it.
- [ ] Prompt-tag construction for `<Picture i>` / `<Video k>` / `<Audio j>` — tags count
      SURVIVORS, and a reference video's soundtrack consumes an audio ordinal.
- [ ] Type-consumer sweep per `docs/playbooks/add-model/`.
- [ ] **PromptBox chip row must scroll** — 15 chips will overflow. Read the PromptBox section
      of `docs/component-contracts.md` first; the strip carries a reorder fast path and the
      MPI-466 role-repaint fix that a layout change must not break.
- [ ] `docs/models/h3/README.md` ref2va section — held until a real reference run is judged.

## Judgement owed before the Vision half

- [ ] **Re-judge every r2va result.** Until the 2026-08-07 re-export, the graph loaded the
      **fl2va** transformer. It does not error — it samples fine and returns a good-looking
      video that ignored the references. So the `match` vs `max` quality comparison and the
      placeholder reel clip were both produced on the wrong DiT.
- [ ] Confirm identity actually follows the reference now. That is the model's entire claim
      and nothing has tested it on the correct weights.
