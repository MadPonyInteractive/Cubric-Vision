---
schema: mpi-kanban/project-knowledge-index/v1
profile: .agents/mpi-kanban/project-profile.md
last_refresh: 2026-06-18
last_refresh_notes: full memory re-sync — wired all 88 memory files into topics (was 6 topics with memory, ~30 files orphaned since 2026-06-01); added 8 topics (RunPod, Pod image/mpi-ci, Build/release, macOS, Release ops, Cross-project/product, Conventions/gotchas); verified promotion candidates already live in docs (project-integrity/versioning/comfy) — no promotion needed, memory files are the war-story/breadcrumb companions that point AT those docs.
---

# Project Knowledge Index

## How To Use

Topic-to-files map. Match the topic closest to the current task and read the listed files first. If no topic matches, read the profile and ask the user for a pointer rather than scanning the repo.

**Memory layering:** the authoritative "how the system works" lives in `docs/` and `.claude/rules/`. The `**Memory:**` files below are companions — they capture the *why a fix exists*, breadcrumbs, gotchas, and process feedback that don't belong in the docs. Read the doc/rule first, then the memory for the war-story context.

## Topics

### Components & UI

- **Read first:** `.claude/rules/components.md`
- **Rules:** `.claude/rules/dos_and_donts.md`, `.claude/rules/component-mounts.md`, `.claude/rules/component-events.md`, `.claude/rules/component-state.md`
- **Memory:** `project_canvas_viewer_spinner_flags.md`, `project_queue_panel_render_diff.md`, `project_gallery_card_chrome.md`, `project_gallery_slider_sizing.md`, `project_gallery_video_thumb_pattern.md`, `project_gallery_window_drop_cleanup.md`, `project_mpi_radio_emits_select.md`, `project_video_trim_frame_semantics.md`, `project_toast_dom_source_of_truth.md`, `project_notes_feature.md`

### Events & cross-component communication

- **Read first:** `docs/events.md`
- **Rules:** `.claude/rules/events.md`, `.claude/rules/component-events.md`
- **Memory:** none

### Application state

- **Read first:** `js/state.js`
- **Rules:** `.claude/rules/state.md`, `.claude/rules/component-state.md`
- **Memory:** `project_reuse_prompt_recall.md`, `project_cue_queue_contract.md`, `project_prompt_draft_persistence.md`, `project_extend_reuse_sidecar.md`

### Workspaces & routing

- **Read first:** `docs/workspaces.md`
- **Rules:** `.claude/rules/workspaces.md`
- **Memory:** none

### ComfyUI workflow injection

- **Read first:** `docs/comfy.md`
- **Rules:** `.claude/rules/comfy_injection.md`, `.claude/rules/component-comfy.md`
- **Memory:** `project_reuse_prompt_recall.md`, `project_cue_queue_contract.md`, `project_comfy_cache_dedupe.md`, `project_savevideo_split_contract.md`, `project_lora_path_separator.md`, `project_empty_media_dispatch_guard.md`, `feedback_comfy_node_naming_law.md`

### ComfyUI engine / backend / models

- **Read first:** `docs/comfy.md`
- **Rules:** `.claude/rules/comfy_engine.md`
- **Memory:** `project_comfy_models_path_source.md`, `project_comfy_extra_model_folders.md`, `project_models_path_absolute.md`, `project_gpu_build_selection.md`

### Downloads

- **Read first:** `docs/comfy.md#download-manager`
- **Rules:** `.claude/rules/downloads.md`
- **Memory:** `project_ndh_resumable_downloads.md`, `project_download_complete_lingering_job.md`, `project_engine_bootstrap_retry.md`, `project_install_models_folder_wiped.md`

### Project data & integrity

- **Read first:** `docs/project-integrity.md`, `docs/data.md`
- **Rules:** none
- **Memory:** `project_reuse_prompt_recall.md`, `project_remove_history_entry_guard.md`, `project_video_trim_frame_semantics.md`, `project_external_project_registry.md`, `project_sidecar_controlstate_schema.md`, `project_dep_url_filename_integrity.md`

### Versioning & migrations

- **Read first:** `docs/versioning.md`
- **Rules:** `.claude/rules/versioning.md`
- **Memory:** `project_app_stage_derivation.md`
- **Notes:** APP_VERSION, SCHEMA_VERSION, COMFY_VERSION, operation registry, release-health gate. APP_STAGE + dev_mode are DERIVED (never hand-set) — see docs/versioning.md.

### RunPod / remote engine

- **Read first:** `docs/runpod-remote-engine.md`
- **Rules:** `.claude/rules/comfy_engine.md` (engine routing), `.claude/rules/comfy_injection.md` (remote upload path)
- **Memory:** `project_runpod_remote_engine_doc.md`, `project_autoretry_gpu_wait.md`, `project_manifest_compat_gate.md`, `project_image_pin_restart.md`, `project_runpod_download_mode.md`, `project_runpod_volume_persistent.md`, `project_mpi82_model_autoupload.md`, `project_watchdog_crash_backstop.md`, `project_wrapper_fetch_502_retry.md`, `project_remote_restart_poll_wrong_flag.md`, `project_reconnect_deletes_warm_pod.md`, `project_runpod_pod_shape_rest.md`, `project_stale_pod_reconnect_toast.md`, `project_oom_container_self_heal.md`, `project_video_gen_ram_wall.md`, `project_remote_install_progress_truth.md`, `project_remote_route_branch_audit.md`

### Pod image / mpi-ci

- **Read first:** `docs/runpod-remote-engine.md` (image/volume/secrets), the private `mpi-ci` repo
- **Memory:** `project_mpi_ci_pod_build_procedure.md`, `project_builder_image_flow.md`, `project_mpi81_pod_v041_weight_prebake.md`, `project_remote_comfy_restart_v042.md`, `project_pod_v043_stats_taesd.md`, `project_ci_split_mpi_ci.md`
- **Notes:** image builds are USER-authorized; live Pod ops stay USER-only.

### Build / release / distribution

- **Read first:** `docs/releases/portable-distribution-contract.md`
- **Memory:** `project_repo_distribution_gating.md`, `project_per_os_ci_build.md`, `project_portable_launcher_split.md`, `project_portable_tar_exec_symlink.md`, `project_updater_no_host_tools.md`, `project_electron_asnode_asar_extract.md`, `project_delta_update_bundles.md`, `project_dev_mode_derived.md`, `project_linux_desktop_setup_todo.md`, `project_v1_release_complete.md`

### macOS

- **Read first:** `docs/releases/portable-distribution-contract.md` (mac section)
- **Memory:** `project_macos_cloud_test.md`, `project_macos_build_fixes.md`, `reference_mac_testing_rentamac.md`

### Release ops / versioning skills

- **Read first:** `mpi-release-shared` skill references
- **Memory:** `project_release_skills.md`, `project_changelog_accumulation.md`, `project_patreon_patch_train.md`, `project_r2_upload_procedure.md`
- **Notes:** Patreon 1.0.x patches ship via Cloudflare with NO git tag / NO GitHub publish; tags reserved for public GitHub releases.

### Cross-project / product

- **Read first:** `docs/PROJECT.md`
- **Memory:** `project_product_scope.md`, `project_cubric_studio_agent_vision.md`, `project_connector_ownership_split.md`, `project_hub_scalable_foundation.md`, `project_madpony_identity_folder.md`
- **Notes:** Vision = image/video only; audio + prompt-gen are sibling Cubric apps.

### Conventions / gotchas

- **Read first:** `CLAUDE.md` § "Critical Rules Snapshot"
- **Memory:** `project_kanban_card_shape.md`, `feedback_shared_tree_commit_hygiene.md`, `feedback_no_toast_user_stop.md`, `feedback_error_dialog_vs_toast.md`, `project_backend_logger_arity.md`, `project_import_depth_gotcha.md`

### Shell, overlays, hotkeys

- **Read first:** `docs/shell.md`
- **Rules:** none
- **Memory:** `project_slideover_close_popup_optout.md`
- **Notes:** all blocking UI via `Overlays.request/release`; hotkeys via `Hotkeys.bind` + `hotkeyRegistry.js`.

### Utilities (DOM, icons, ratios, seed)

- **Read first:** `docs/utils.md`
- **Rules:** `.claude/rules/dos_and_donts.md`
- **Memory:** none

### Stage UI baseline (Redesign)

- **Read first:** `docs/redesign/PORTING.md` (only for new surfaces or phases >10.2)
- **Supplemental:** `docs/redesign/MAPPING.md` (legacy-to-Stage file/class mapping)
- **Rules:** `.claude/rules/components.md` § "Stage design baseline", `styles/01_base.css`
- **Notes:** Stage redesign merged at `e9b5eb6`; routine work uses live tokens, not spec.

### Worktrees & engine sharing

- **Read first:** `docs/worktrees.md`
- **Memory:** `project_runpod_branch_v110.md`
- **Notes:** `.engine-config.json` shares ComfyUI engine across worktrees. RunPod is the active shared integration branch (v1.1.0).

### Desktop and browser testing

- **Read first:** `playwright.desktop.config.js`, `tests/desktop/`
- **Rules:** `CLAUDE.md` desktop automation section
- **Notes:** `npm run test:desktop` launches Electron through Playwright with isolated `CUBRIC_E2E_USER_DATA`; keep tests focused unless downloads/generation are explicitly required.

### Debugging runtime issues

- **Read first:** `logs/app.log` (last 50–100 lines via `Read` offset only — never full)
- **Notes:** server crashes, python engine, generation failures.

### Sibling website / docs

- **Read first:** `c:\AI\Mpi\Cubric Studio (Website)\`, `c:\AI\Mpi\Cubric Studio (Docs)\`, design source at `c:\AI\Mpi\CubricStudio_Redesign\`
- **Memory:** `project_website_subdomain_strategy.md`, `tool_website_image_converter.md`
- **Notes:** separate repos; use absolute paths and `git -C`; CLAUDE.md does NOT auto-load there.

### Cubric Studio user docs (sibling Docs repo)

- **Read first:** `c:\AI\Mpi\Cubric Studio (Docs)\.agents\skills\cubric-user-docs\SKILL.md`
- **Notes:** docs-only work should open `c:\AI\Mpi\Cubric Studio (Docs)\` directly and use its local MPI board.

### Dev configs & engine internals

- **Read first:** `dev_configs/app_config.js`, `dev_configs/system_dependencies.json`
- **Memory:** `project_dev_mode_derived.md`, `project_disk_layout_c_constrained.md`
- **Notes:** `engine/ComfyUI_windows_portable/` is the portable runtime; `engine/mpi_models/` holds MPI-bundled model assets. Treat both as runtime artifacts — do not commit engine binaries.

## Cross-cutting

- `CLAUDE.md`, `AGENTS.md`
- `docs/PROJECT.md` — orientation hub
- `.claude/rules/dos_and_donts.md` — universal baseline
- **Memory:** `project_product_scope.md` (Vision = image/video only; audio + prompt-gen are sibling apps)

## Topic Gaps

- None tracked.
