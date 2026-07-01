# Docs Reorg Plan — gotchas.md 646 → ≤200 (MPI-170)

> **Status:** PLANNED, not executed. Mapping done by 3 parallel analysis agents 2026-07-01.
> **Rule:** every doc ≤200 lines; if a target would exceed, split into topic files. Durable
> knowledge lives in its subsystem/research doc, NOT gotchas. Gotchas keeps only genuinely
> cross-cutting conventions + temporary/unverified flags. A `docs/README.md` index maps it all
> so agents don't scan every file.

## Why this exists

CLAUDE.md + MEMORY.md route agents INTO gotchas.md as the one blessed "learned stuff" bucket,
but nothing routes entries OUT to their proper home. gotchas became an inbox with no outbox →
646 lines, 138 entries. Most are **duplicates** of content already in research/subsystem docs
(the analysis agents repeatedly found "already fully covered in X — DELETE the gotcha"). This
plan drains it and adds the missing outbox (a README index + the ≤200 discipline).

## End state

| File | Action | Final ~lines |
|---|---|---|
| `docs/gotchas.md` | Drain to conventions + temp/unverified + pointers | ~130-150 |
| `docs/README.md` | **NEW** — index mapping every doc + what lives where | ~60 |
| `docs/runpod-troubleshooting.md` | **NEW** — 7 fixed-bug traps from RunPod domain | ~80 |
| `docs/ui-gotchas.md` | **NEW** — all 18 UI/component entries | ~90 |
| `docs/download-manager.md` | **NEW** — split out of comfy.md (ResumableDownloader) | ~90 |
| `docs/models-path.md` | **NEW** — split out of comfy.md (YAML/path contract) | ~45 |
| `docs/builder/research/black-bars-and-nag.md` | **NEW** — the 2026-07-01 black-bar + NAG findings | ~35 |
| `docs/builder/research/ltx-workflow-authoring.md` | **NEW** — LTX template wiring research | ~60 |
| `docs/runpod-remote-engine.md` | Absorb arch entries; shed §10/§11 to troubleshooting; keep <200 | ~200 |
| `docs/comfy.md` | Shed Download Manager + models-path to new files; absorb engine entries | ~200 |
| `docs/project-integrity.md` | Review for split (already 281) | ≤200 |

## Migration map (per domain)

### RunPod / remote engine (gotchas 7-133, ~126 lines → ~19)
- **DELETE (stale/resolved/stub):** "remote engine architecture doc" (pointer, dup), "video gen RAM wall RESOLVED", the bare-stub duplicate at line 117. (~5 lines)
- **Collapse to 1-line pointer → `.claude/rules/comfy_engine.md § Engine Split`:** both engine-split entries (MPI-163 deps axis + MPI-165 workflow axis). Detail already in the rule. (~12 lines out, 2 left)
- **→ `runpod-remote-engine.md`** (compress each to ~2-3 lines): autoretry GPU wait arch, DC-steer+maintenance (MPI-135), GraphQL↔REST fallback (MPI-159), volume-persists-on-Reset, REST Pod shape (no uptimeInSeconds), CPU-Pod constraints, OOM self-heal (§9 dup→pointer), watchdog-not-idle-timer, remote-route-branch-audit, wrapper-fetch-502-retry, on-demand-auto-upload (MPI-82), manifest gate (MPI-90), wrapper-supervises-ComfyUI (v0.4.2). (~55 lines)
- **→ `runpod-troubleshooting.md` (NEW):** autoretry live-test bugs, image/wrapper-pin-needs-restart, remote-restart-poll-wrong-flag (MPI-107), /history-reconcile-URL (drop /wrapper), remote-cancel-soft-async (MPI-123), aria2c-80%-snap, restart-needed-flag-per-engine. (~18 lines)
- **STAYS (temp/unverified):** RunPod-branch=v1.1.0-trunk (time-bomb, review ~2026-07-09), empty-media-dispatch-guard (homeless), silent-stall-belt MPI-136 (UNVERIFIED), local-restart-server-side (NOT user-verified).

### ComfyUI engine / workflows / injection (gotchas ~83 → 0)
- **→ `comfy.md`** (after it sheds Download Manager + models-path to new files): v0.26 execution_success sentinel, sage-attention arch gating, Pod-VRAM-1GB-under, cache-dedupe-Seed-node, PYTHONUTF8, GPU-build-by-arch, engine-bootstrap-retry, engine-upgrade-preserve-path, dep-integrity-cross-check.
- **→ `download-manager.md` (NEW):** NDH resumable download gotchas.
- **→ `models-path.md` (NEW):** YAML-canonical, absolute+additive, extra-folders-separate, path-separator-by-OS.
- **→ `pod-perf-investigation.md`:** aimdo/torch≥2.8 (TL;DR, already there).
- **DELETE (dup/stale):** workflow-validation-trap (in comfy_injection.md rule), v0.26-node-renames, first-run-install (fixed 0.0.4), dep-re-host (in model-set.md), models-path-canonical-files (in comfy.md).

### Generation / prompt / sidecar (gotchas ~35 → 0)
- **→ `comfy.md`:** cue-queue-contract (Ratio_Label injection), prompt-draft-persistence, promptbox-chip-name-nav.
- **→ `data.md`:** reuse-prompt-recall, sidecar-controlState-schema (already partially there), removeHistoryEntry-empty-group, video-trim-frame-semantics.
- **DELETE:** extend-reuse-MPI-112 (history; keep 1-line order rule).

### Downloads / engine (gotchas ~11 → 0)
- **→ `download-manager.md` (NEW):** NDH gotchas.
- **DELETE:** external-project-registry (100% dup of data.md).

### LTX-2.3 workflow authoring (gotchas ~121 → 0)
- **→ `ltx-2.3-tiers.md`:** tier-curve /64 (already there, +NAG-no-fix footnote +2K/4K), stage-1-motion/stage-2-upscaler, ControlNet-Union-soft-control.
- **→ `model-set.md`:** gemma-precision-ranking + VRAM-tier table (NEW facts), ship-config-capability-LoRAs-dropped, transition-LoRA-two-roles.
- **→ `lora-merge-ltx.md`:** DELETE gotcha (already canonical there).
- **→ `pod-perf-investigation.md`:** cold-vs-warm (DELETE gotcha, superseded there).
- **→ `audio-input.md`:** voice-ID-LTXVReferenceAudio, audio-goals-taxonomy (DELETE gotchas, dup there).
- **→ `black-bars-and-nag.md` (NEW):** black-bars-t2v-compositional (2026-07-01), NAG-required-CFG1 (2026-07-01).
- **→ `ltx-workflow-authoring.md` (NEW):** live-latent-previews (MPI-166), workflow-deconstruction, FF/LF-wave-distortion, Input_Use_Reference_Audio-bake-false, ComfyUI-groups-position-based.
- **→ `05-author-and-test.md`:** workflow-generation-system, node-naming-law, SaveVideo-split-contract.
- **→ `02-image-and-rebuild.md`:** sage-Windows-JIT-tax, kornia==0.8.2-pin.
- **DELETE:** LTX-workflow-file-paths (machine-specific; keep 1 line "G: is live, re-read first" in 05).

### Pod image / mpi-ci / version-lock (gotchas ~73 → 0)
- **→ `02-image-and-rebuild.md`** (currently 44 lines → ~89): node-version-lock, bump/rebuild-trigger-table (promote from MPI-119 task folder), mpi-ci-build-procedure, start.sh-R2-fetched (MPI-156), --normalvram-removed, cu124-label-is-cu126, driver-floor-cu126-r550, git-bash-curl-schannel, v0.4.1-prebake, v0.4.3-stats, builder-thin-base, builder-install-scripts-location, curl-loop-flake.
- **→ `01-environments.md`:** ComfyUI-portable-ships-cu130.
- **→ `pod-perf-investigation.md`:** aimdo-torch (dup, DELETE), disabling-aimdo-OOM (dup, DELETE).
- **DELETE (stale/shipped):** remote-gen-hang-Generating (app-fix shipped), SSE-idle-abort-128s (fixed half).

### UI / components (gotchas ~77 → 0)
- **→ `ui-gotchas.md` (NEW, ~90 lines, `##` sub-headers gallery/components/models/build):** all 18 entries — status-bar-stdout-progress (MPI-147), hero-stats-usable-count, MpiRadioGroup-select-not-change, MpiInput-sm-width, MpiCanvasViewer-spinner, MpiSlideOver-opt-out, MpiToast-DOM-truth, gallery-thumbnail/slider/chrome/window-drop/hover-audio, download-complete-lingers, op-selectable-models (MPI-122), queue-panel-diff, notes-two-surfaces, group-field-persist-whitelist, import-depth-case-sensitivity.

### Build / release / distribution (gotchas ~71 → ~1)
- **→ `patch-distribution.md`:** CI-split-to-mpi-ci, release-skills-three, R2-upload-procedure, rclone-no-check-bucket (MPI-129), patreon-patch-train.
- **→ `portable-distribution-contract.md`:** delta-update-bundles (MPI-56), portable-launcher-split, updater-no-host-tools.
- **→ `build-experience-log.md`:** electron-as-node-asar-stall.
- **→ `releases/README.md`:** dev_mode-from-BUILD_HASH, app-stage-derivation, repo-distribution-gating.
- **DELETE (dup/stale):** per-OS-CI (in contract), portable-tar-exec (in contract), changelog-two-surfaces (in README), v1.0.0-release-complete (history).
- **STAYS/DELETE:** disk-layout-C-constrained (machine-specific; delete or 1-line).

### macOS / release ops (gotchas ~11 → 0)
- **→ `build-experience-log.md`:** macOS-build-fixes-1.0.0.
- **→ `github-release-checklist.md`:** rentamac-testing (add link, quarantine already there).

### Conventions / gotchas (gotchas ~20 → ~12, STAYS)
- **KEEP in gotchas** (genuinely cross-cutting): backend-logger-arity, kanban-card-shape, shared-tree-commit-hygiene, no-toast-on-user-Stop, error-dialog-vs-toast.

## Execution order (dependency-safe)

1. **Splits first** (make room before routing): extract Download Manager + models-path out of comfy.md → 2 new files; shed §10/§11 out of runpod-remote-engine.md → runpod-troubleshooting.md. Verify each source doc now <200.
2. **New files:** black-bars-and-nag.md, ltx-workflow-authoring.md, ui-gotchas.md.
3. **Route** each domain's durable entries into targets (compress to 2-3 lines each).
4. **Delete** the confirmed duplicates (~90 lines) — verify content exists in target BEFORE deleting.
5. **Rewrite gotchas.md** to the drained residue + a short "moved to X" pointer table.
6. **README index** (`docs/README.md`) mapping every doc.
7. **Update CLAUDE.md router** — the "Documentation Lookup" + "Context Router" sections point at gotchas for domains that moved; repoint to the new homes.
8. **Reconcile:** line-count every touched file ≤200 (except research lab notebooks, which are exempt by convention — note that in README). Grep for dangling pointers to moved content.

## Guardrails
- **Never delete a gotcha before confirming its content is in the target** (grep the target).
- Research lab notebooks (`docs/builder/research/pod-perf-investigation.md` 616 lines, `audio-input.md` 336) are **exempt** from the 200-line rule — they're evidence logs, not reference. Note the exemption in README.
- Preserve UNVERIFIED / NOT-user-verified flags verbatim on move — they encode trust state.
- This is a shared-branch tree: commit by explicit pathspec, never `git add -A`.
