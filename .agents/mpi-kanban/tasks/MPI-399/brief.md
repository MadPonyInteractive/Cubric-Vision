# MPI-399 — Memory-system audit

## Why this exists

The tutorial-derived memory system (`~/.claude/memory/` + per-project `MEMORY.md` + a
PreToolUse injection hook) had become **duplication plus active misinformation**. Claude Code
now loads `~/.claude/projects/<mapped>/memory/MEMORY.md` natively, so the hook re-sent the same
bytes; and the `project_*` memory files had largely been promoted into `docs/` long ago without
ever being deleted.

## SHIPPED (verified)

| Change | Evidence |
|---|---|
| PreToolUse hook deleted | Payload was **byte-identical** to `MEMORY.md` (`diff` = IDENTICAL); the two index lists were the same 8 files, so the payload was **100%** duplicate. A probe subagent with `tool_uses: 0` still saw all 8 `MEMORY.md` headings → native loading reaches subagents, hook had no purpose. |
| 38 MB debug log + 129 orphan flag files purged | `claude-memory-hook-debug.log` had 119,385 entries, unbounded. `settings.json` invoked `python` directly per tool call (80–214 ms measured) — the tutorial's fast-path `.sh` wrapper was never installed on Windows. |
| `~/.claude/CLAUDE.md` repaired | 17 mojibake em-dashes (cp1252 round-trip) fixed with a byte-level replace + guard. `memory/memory.md` deleted, its per-file dates preserved inline in the CLAUDE.md topic list (now the single index). |
| `MEMORY.md` 20,420 → ~10,960 bytes | In-flight section mirrored ~14 cards and had drifted. |
| `mpi-end` scope gate ×3 repos | Skips `mpi-end-session` step 0's 4 coordination refs + `interop-ops/modes.md` (~28 KB / ~7.6k tok) when the state counters are clear. Verified firing in Cubric-Vision, Cubric-Prompt, MadPony-Identity. |
| `comfy_injection.md` split | 210 → 154 lines; multi-stage `_ms` contract moved to `comfy_injection_multistage.md` (71 lines) + routing row in `.claude/rules/README.md`. |
| 7 verified doc gaps migrated | See "Migrated" below. |
| 20 redundant memory files deleted | Backups in `~/.claude/projects/c--AI-Mpi-Cubric-Vision/memory/.deleted-2026-07-29/`. |

### Migrated (the only real gaps out of 53)

- `docs/project-integrity.md` — § Debugging a WRONG generation (sidecar-first, MPI-351)
- `docs/runpod-remote-engine.md` — § KNOWN BUG reconnect deletes a warm Pod on transient stock-out
- `docs/models/krea2/README.md` — `krea2RealVae_v10` IS the Qwen VAE, renamed
- `docs/models/krea2/slot-order.md` **(new)** — scene chip 1 / subject chip 2 + the 2-ref face wall
- `docs/models/sdxl/depth-control.md` **(new)** — ControlNet-Union, first non-LoRA controlnet dep
- `docs/models/qwen-edit/README.md` — the misleading anime 2D/3D LoRA filenames
- `.claude/rules/comfy_injection.md` — § The silent-skip trap (filled a dead internal pointer)

### Drift healed along the way

- `docs/DEVELOPMENT.md` claimed "254/263 with 9 long-standing failures". **Measured 298/298, zero fail.** Rewritten.
- `MPI-249` card text said "no Linux/mac desktop is on hand" — false for Linux since 2026-07-30. Healed + `task.updated` event.
- `MEMORY.md` index counts were stale (36→22 procedures, 48→49 feedback, 16→17 done).

---

## REMAINING WORK — the per-claim verification pass

33 `project_*` files remain. **13 are cross-repo strategy → KEEP, do not touch:**
`civarchive_lora_browser_and_workflow_cards`, `comfyui_bump_cadence`,
`connector_ownership_split`, `cubric_audio_kickoff`, `cubric_prompt_kickoff`,
`cubric_studio_agent_vision`, `family_work_lands_in_vision`, `hub_scalable_foundation`,
`lora_free_character_system`, `madpony_identity_folder`, `product_scope`,
`release_model_github_only`, `website_subdomain_strategy`.

**The 20 to verify** (each *appears* documented, but only on a loose grep — not good enough):

1. `automask_percpick_mask_list_contract` → `docs/masking-sam3.md`, `.claude/rules/component-comfy.md`
2. `completion_feedback_rules` → `docs/toasts.md`, `docs/generation-lifecycle.md`
3. `deps_facade_text_scan_trap` → `docs/download-manager.md`
4. `float_latent_lane_keying` → `docs/preview-bus.md`
5. `injector_consumes_only_declared` → `docs/generation-lifecycle.md`
6. `krea2_depth_reference_rename` → `docs/models/klein/refcontrol.md`, `playbooks/add-model/04`
7. `krea2_edit_style_lora_conflict` → `docs/models/krea2/conditioning-and-control.md`
8. `krea2_encoder_consolidation` → `docs/builder/04-add-models.md`, `05-author-and-test.md`
9. `krea2_ref_boost_regimes` → `docs/models/krea2/editing.md`, `README.md`
10. `krea2_two_image_edit` → `docs/data.md`, `docs/models/krea2/conditioning-and-control.md`
11. `landing_rows_handbuilt_not_projectcard` → `docs/project-integrity.md`, `docs/events.md`
12. `load_node_linked_string_placeholder_slot` → `playbooks/add-model/01-workflow-split.md`, `playbooks/common/hard-rules.md`
13. `ltx_preview_cannot_use_taesd` → `docs/builder/05-author-and-test.md`
14. `mascot_gen_animation_two_surfaces` → `docs/component-contracts.md` **(weak — only other hit was an HTML plan file)**
15. `masks_temp_files_not_memory` → `docs/masking.md`, `docs/masking-undo.md`
16. `media_slots_addressable_never_packed` → `docs/data.md`
17. `preview_bus_mpi269` → `docs/preview-bus.md`
18. `sequenced_filename_reuse_orphan` → `docs/project-integrity.md`
19. `shared_dep_guard_exclusive_evidence` → `docs/download-manager.md`
20. `style_picker_image_cards` → `docs/models/krea2/style-loras.md`, `playbooks/add-model/05`

### THE METHOD (use this — the shortcuts all failed)

For each file: read it, extract its **one load-bearing claim** (the trap, not the topic), then
grep the named destination for **that claim's distinctive mechanism** — a function name, a flag,
a filename, an exact phrase. Then:

- **Covered** → `cp` to `.deleted-2026-07-29/`, delete, drop its row from `procedures-index.md`,
  and repoint any surviving `[[wikilink]]` to the doc path (as `` `docs/x.md (section)` ``).
- **Gap** → migrate compressed into the doc `docs/README.md` routes to, respecting the ≤200-line
  cap (split into a topic file + add a routing row if it would breach), then delete.

### FIVE TRAPS that made loose greps unreliable (all bit me this session)

1. **Token-coverage % is a proxy, not proof.** `lora_merge_ltx` scored 86% while its claimed doc
   **did not exist**. Common domain words inflate the score.
2. **A memory file naming its own home is a CLAIM — verify the path exists.**
   `project_lora_merge_ltx` pointed at `docs/builder/research/lora-merge-ltx.md` (absent); the
   real file was `docs/models/ltx/lora-merge.md`. Deleting on the pointer would have destroyed
   the only copy.
3. **A grep hit on the TOPIC is not a hit on the TRAP.** `krea2_slot_order_scene_first` matched
   "scene" 4× in `editing.md` — all unrelated (scene decomposition, scene adherence). The
   scene-chip-1 rule was genuinely absent. Same for qwen "tier radio" (present) vs the anime
   LoRA filename trap (absent).
4. **`ControlNet-Union` appeared NOWHERE** despite a `poseReference` hit suggesting coverage —
   different token, different fact.
5. **Some memory files are simply WRONG about live state.** `aria2_progress_lie` claimed an open
   6-session bug that MPI-140 resolved 2026-06-29 *and* whose prescribed fix shipped again in
   wrapper 0.2.34 (2026-07-11). `cancel_stale_partial_bytes` said "MPI-123 (open/todo)" — that
   card is `done/complete/accepted`. Both deleted. **Always check the card's real column.**

---

## Also found, deliberately NOT fixed (needs a decision)

- **`docs/runpod-troubleshooting.md` contradicts itself.** Line ~32 says the 80% snap is
  "correct behavior… do NOT keep fixing the app for it"; line ~40 says wrapper 0.2.34 added
  `--enable-rpc` + `completedLength` for a **true-bytes** numerator. Both cannot be current.
  Resolve by reading the shipped wrapper — do not guess.
- **~15 pre-existing dangling `[[wikilinks]]`** in the memory tree (predate this session):
  `tools/sharp`, `project_release_skills`, `project_oom_container_self_heal`,
  `project_video_gen_ram_wall`, `project_model_type_vs_mediatype`,
  `project_disk_layout_c_constrained`, `huggingface-capability`,
  `project-comfy-groups-position-based`, `project-ltx-refaudio-not-setrefaudio`,
  `project_slideover_close_popup_optout`, `project_runpod_branch_v110`,
  `project-add-model-playbook`, plus two malformed `[[name.md]]` refs in
  `feedback_runpod_not_local_engine_proof` and `feedback-index.md`.
- **Rule files still over the 200-line cap** (all pre-existing, none made worse):
  `comfy_engine.md` 385, `component-mounts.md` 309, `component-events-primitives.md` 290,
  `components.md` 271, `component-comfy.md` 261. The `component-*` ones are generated views.

## WARNING — concurrent session in this tree

While this work ran, another session modified `routes/downloadManager.js`,
`routes/install/installStore.js`, `docs/model-library.md`, `docs/releases/UNRELEASED.md`,
`MPI-353`, `MPI-395`, and added `MPI-396/397/398` + `tests/uninstall-store-settle.test.cjs`.
**None of that is this card's work.** Commit by explicit pathspec only — never `git add -A`.
