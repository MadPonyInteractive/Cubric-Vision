# MPI-399 — validation

## Phase 4 complete — the per-claim verification pass on the 20 `project_*` files

Method as briefed: read each file, isolate its ONE load-bearing claim, grep the destination for
that claim's distinctive **mechanism** (function name, flag, filename, exact phrase) — never its
topic. Destination paths were existence-checked FIRST (Trap 2).

**Result: the brief's premise ("each appears documented") held for only 10 of 20.**

### Covered → backed up + deleted (10)

| file | proof |
|---|---|
| `deps_facade_text_scan_trap` | `docs/download-manager.md:348-361` — facade, 4 split files, `_universalNodeFilenames`, all 3 killed scanners |
| `float_latent_lane_keying` | `docs/preview-bus.md:79-86` — lane off `engine` tag, never promptId, first-frame owns creation, `laneDepth(lane, excludeGenId)` |
| `krea2_depth_reference_rename` | `docs/models/sdxl/depth-control.md:6-12` |
| `krea2_edit_style_lora_conflict` | `docs/models/krea2/injection.md:284-289` |
| `krea2_encoder_consolidation` | `docs/models/krea2/README.md:18` + code comments `js/data/modelConstants/assetDeps.js:110-119` |
| `krea2_ref_boost_regimes` | `docs/models/krea2/editing.md:81-112` |
| `ltx_preview_cannot_use_taesd` | `docs/models/ltx/workflow-authoring.md:13-36`, `docs/builder/05-author-and-test.md:45-53` |
| `preview_bus_mpi269` | `docs/preview-bus.md` (whole file) |
| `shared_dep_guard_exclusive_evidence` | `docs/download-manager.md:114-162` |
| `style_picker_image_cards` | `docs/component-contracts.md:74-76`, `docs/playbooks/add-model/05-prompt-and-styles.md:55-70` |

### Gaps → migrated, then deleted (10)

| file | destination |
|---|---|
| `sequenced_filename_reuse_orphan` | `docs/project-integrity.md` § Sequenced media filenames **(zero prior coverage; code live in 4 route files)** |
| `masks_temp_files_not_memory` | `docs/masking.md` § Storage |
| `completion_feedback_rules` | `docs/toasts.md` § Lifecycle notifications |
| `injector_consumes_only_declared` | `.claude/rules/comfy_injection.md` § Standalone Workflow Injectors |
| `load_node_linked_string_placeholder_slot` | `docs/workflow-authoring/media-inputs.md` |
| `automask_percpick_mask_list_contract` | `docs/masking-sam3.md` (ordering rule only; list contract was covered) |
| `media_slots_addressable_never_packed` | `docs/data.md` |
| `krea2_two_image_edit` | `docs/data.md` |
| `landing_rows_handbuilt_not_projectcard` | `docs/workspaces.md` § Landing |
| `mascot_gen_animation_two_surfaces` | `.claude/rules/components.md` § Mascot |

### 6 docs were actively WRONG — healed against code, not against the memory files

1. `docs/workspaces.md:14` + `.claude/rules/component-mounts.md:140` — claimed `MpiProjectCard`
   renders the landing list. It is imported in `projectUI.js` and **never instantiated**; rows
   come from `_buildProjectRow()`.
2. `.claude/rules/components.md:14` — "canonical **4**-file set… peek uses `idle`/`happy`".
   `assets/mascot/` holds **5**; peek shows `waiting.png`; `happy` is consumed only by
   `MpiToast` (`success` → `happy`).
3. `.claude/rules/comfy_injection.md:14` — documented MPI-253 blanket delete-both-keys,
   superseded by MPI-306's `{inject, consumes}` allowlist (`commandExecutor.js:1503-1508`).
4. `.claude/rules/component-events-blocks.md:64` — "overflow evicts oldest of same type".
   Code evicts the **last** (`MpiPromptBox.js:377-385`, `afterRoleDrop[len-1]`).
5. `docs/runpod-troubleshooting.md` aria2 self-contradiction — **resolved** (below).

### 2 memory files were WRONG about live state (Trap 5)

- `krea2_ref_boost_regimes` claimed node `408` bakes `ref_boost 4` and `grounding_px 768`
  "needs revisiting". Shipped runtime: `ref_boost: 2` (408), `1` (306), `grounding_px: 1024` —
  measured in all three `comfy_workflows/krea2_t2i_*.json`.
- `krea2_edit_style_lora_conflict` claimed masked edit ships via `InpaintCropImproved` and
  MPI-282 was still `doing`. That path was removed 2026-07-16 (`b3f9a018`).

## Also closed: the `runpod-troubleshooting.md` aria2 contradiction

Resolved by reading the **shipped** wrapper (`c:/AI/Mpi/mpi-ci/cubric-vision-pod/wrapper/wrapper.py`,
`WRAPPER_VERSION = 0.2.38`) rather than guessing. Both halves of the old text were wrong: the
wrapper's `_aria2_status` docstring states there is **no preallocation** on this path
(`--file-allocation=none`) and calls MPI-95's "preallocation artifact" label a misdiagnosis. The
snap was a **sparse-file numerator** (`getsize(.part)` jumping when a late `-s 128` segment writes
near EOF) and it was **fixed** at the wrapper in 0.2.34 by switching to
`aria2.tellStatus → completedLength`. Section rewritten; the "separate, correct behavior"
cross-reference in the MPI-254 entry corrected too.

## Verification run — PASSED

- **28/28 mechanism greps** confirm every migrated fact landed in its destination.
- **Line caps respected.** `masking.md` exactly 200 (trimmed my own addition after it hit 201);
  `masking-sam3.md` 113, `data.md` 90, `workspaces.md` 67, `media-inputs.md` 107,
  `comfy_injection.md` 170. `toasts.md` (242) and `project-integrity.md` (365) are cap-exempt per
  `docs/README.md`. `components.md` 271 / `component-mounts.md` 309 were already over and are
  unchanged in length (in-place line replacement).
- **Backups byte-verified.** All 20 `cp`'d to `memory/.deleted-2026-07-29/` and `cmp`'d before any
  delete. 13 `project_*` files remain — exactly the 13 cross-repo strategy KEEPs.
- **Zero dangling references** to the 20 deleted files. `procedures-index.md` pruned 22 → 5 plus a
  was→now routing table; 4 `feedback_*` wikilinks and `MEMORY.md` ×3 repointed to doc paths.
  11 pre-existing danglers remain (unchanged, listed in `brief.md`); deleting the LTX file
  incidentally cleared a 12th (`project-add-model-playbook`).
- **No code was modified** — docs, rules and memory only, so no test run applies.

## Method finding worth keeping

Four of this session's greps used `rg -rn`. In ripgrep **`-r` is `--replace`**, so it rewrote every
match to the literal `n` and still exited 0 — producing a false "`block_if_empty` appears nowhere in
docs" reading that would have justified migrating an already-documented fact. Recorded as
`memory/tool_rg_dash_r_is_replace.md`; belongs in the brief's FIVE TRAPS as trap 6: **a grep that
finds nothing may be a broken grep, not an absent fact.**

## Remaining on this card

- ~11 pre-existing dangling memory wikilinks (marked optional in the brief; none introduced here).
- `.claude/rules/component-comfy.md:125` still says "Current injector: `resize`" and misses
  `headSwap`. Left alone deliberately — it is a **generated view**; regenerate via
  `mpic-update-component-map` rather than hand-editing.
