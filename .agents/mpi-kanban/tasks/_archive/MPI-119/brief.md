# MPI-119 Brief

## Why deferred

Suggestions came from a Claude Code **Insights** report
(`C:\Users\Fabio\.claude\usage-data\report-2026-06-20-062207.html`,
2026-05-31 → 2026-06-19). User is updating the MPI Kanban skills first. Do NOT
act before that update — several of these may already be covered by the new
skills. **First step of this card = diff skills vs this list, drop anything
already handled, apply only the gaps.**

## Scope = image builds + version bumps only

Other report friction (output-token cap, sub-agent hallucination gate) is out
of scope for this card — flagged to user separately.

## Candidate gaps to apply (verify against updated skills first)

1. **v-prefix tag guard (highest value).** Insights: CI tag came out malformed
   from `manifest_version=v0.4.9` → double-`v`. Add a guard that normalizes /
   rejects version strings already prefixed with `v` before building/tagging.
   - Likely targets: `mpi-version-bump` skill, `build-pod-image` skill,
     release skills (`mpi-merge-branches`, `mpi-apply-patch`).

2. **Post-push public pull-verify.** After push, confirm image is publicly
   pullable (`docker manifest inspect <img>` or pull) BEFORE marking the build
   card done. Partially in memory `project_mpi_ci_pod_build_procedure.md` —
   promote to a mandatory skill step, not a manual one.

3. **Per-image boot smoke test.** Start container post-pull, hit health
   (e.g. `/wrapper/stats`), assert 200. Catches broken torch/GPU installs
   (recurring: see memory `ltxvideo_kornia_pad`, `gpu_build_selection`).

4. **Build card "done" definition.** Done ≠ push success. Done = pulled +
   booted + verified. Codify in the build skill / card-close convention.

## Bump/rebuild "forgot to do it" net (user-requested, the big one)

Problem: lots of changes silently REQUIRE a version bump and/or image rebuild,
and they get forgotten. Examples user named: introducing a new ComfyUI custom
node, adding/changing prompt-box tools, model changes. There are more.

### Deliverable A — investigation (do FIRST, it feeds B + C)

Produce a full inventory: **every change-type / path that requires a version
bump and/or an image rebuild.** Don't guess — grep the codebase, read the
versioning rules, read the build skill. Candidate trigger sources to confirm:

- model constants / model mappings (`js/data/modelConstants/…`) — bump + maybe rebuild
- ComfyUI custom nodes (new node = likely image rebuild; see node-naming law memory `feedback_comfy_node_naming_law`)
- prompt-box tools (add/change) — bump
- operation registry / `operation_registry.json` — bump (per `mpi-version-bump`)
- SCHEMA_VERSION / COMFY_VERSION / APP_VERSION (`.claude/rules/versioning.md`, `docs/versioning.md`)
- `dev_configs/node_lock.json` (memory `project_node_version_lock`) — bump + rebuild
- builder install scripts (`mpi-ci/cubric-vision-builder/`, memory `project_builder_install_scripts`) — rebuild
- Dockerfile / Pod image deps — rebuild

Output of A = a table: `trigger path/pattern → bump? → rebuild? → which version field`.
This table is the single source the hook and skill both consume.

### Deliverable B — reminder hook (the "won't forget" part)

A hook can NOT semantically know "this edit needs a bump" — it only sees a file
changed. So scope it as a **warning net, not a correctness gate**:

- `PostToolUse` matcher `Edit|Write`, path-watch against the Deliverable-A
  trigger list → emit a non-blocking warning: "Touched <path>. This historically
  needs a version bump / image rebuild — confirm before closing the card."
- Keep it advisory (exit 0 + message). Never block edits. Human/skill keeps the
  real judgment call.
- Consider a `Stop`-event variant: at session end, if any bump-trigger path was
  touched this session and no version field changed, surface one summary warning.

### Deliverable C — skill side

Decide hook-vs-skill division (user is unsure): hook = fires whether or not
anyone remembers (wins for *forgetting*); skill = runs only when invoked but can
actually DO the bump/build. They're complementary, not either/or. Likely:
hook reminds → `mpi-version-bump` / `build-pod-image` execute. Confirm the
build skill already nudges "rebuild needed" loudly enough; if yes, hook may only
need to cover the *bump* side.

## First action when picked up

- Read the (updated) skills: `build-pod-image`, `mpi-version-bump`,
  `mpi-merge-branches`, `mpi-apply-patch`, `mpi-release-shared`.
- Cross out every candidate above already implemented.
- Report remaining gaps to user, then apply.
