# MPI-306 — App carousel frame (build plan)

**Design is settled.** `docs/playbooks/add-app/ui/carousel-frame.md` § The approved
composition is the spec — do NOT re-derive it. Reference artefact: `mockup-C2.html`
(scratchpad, throwaway).

**Sequencing decided by the user (2026-07-18):**
1. Frame first, generically, with Head Swap as its proof — NOT Head-Swap-first-then-extract.
2. The hold-until-Apply run-path change is a SEPARATE phase, after the frame lands.

## Current State

- `MpiBaseApp` is a flat one-screen form: head / stacked media groups / `#app-content` slot /
  Run + result. No steps, no carousel. It is the thing being reworked.
- `steps` DOES NOT EXIST IN CODE — it is design only, from carousel-frame.md § Steps are DATA.
  The `AppDef` typedef (`js/data/appsRegistry.js:22-37`) has 9 properties and none of them is
  `steps`; the only occurrence of the word in that file is a comment on line 142. **Phase 1
  introduces it** (field + typedef + `STEP_KINDS` registry) — it is not a half-finished thing
  to complete. Head Swap's entry has `uiComponent` commented out, pending this work.
- `submitAppGeneration` commits at ENQUEUE time — `scope: 'gallery'` + `placeholderGroup`
  (`js/services/appService.js:105-107`). That is Phase 3's target, untouched before then.
- `js/utils/cropTool.js` is a standalone factory with 8 handles, drag, clamping and ratio-lock
  already correct. The box step REUSES it (add a `showGrid` option; do NOT fork the file).
- ~~Head Swap CANNOT RUN regardless of this work — the graph 404s on its LoRA~~ **WRONG
  (corrected 2026-07-18).** It RUNS on the LOCAL engine: node 109's
  `bfs_head_v5_2511_merged_version_rank_32_fp32.safetensors` is present in
  `G:\CubricModels\loras\qwen\`. The R2 upload blocks RunPod/remote and installs on OTHER
  machines, not a local run here. UI is buildable and inspectable either way.

## Phase 1 — The frame (portable, app-agnostic) — ✅ BUILT, self-verified 2026-07-18

Steps 1–6 all shipped and checked in the running app (22/22 frame + 10/10 box checks).
Evidence + the three bugs found during verification: `validation.md`. Awaiting the
user's look-and-feel pass (`verify mode: user-ux`) before this is called done.

Two deltas from the plan as written:
- **Discard dropped** (user-decided mid-build): no Discard button, no close prompt; the
  "Not saved yet" note carries hold-until-Apply. `carousel-frame.md` updated.
- **`cropTool` needed a restore fix, not just `showGrid`.** `enable(rect)` discarded the
  caller's rect in both branches — a latent bug that also silently affected
  `MpiVideoViewer.enterCropMode(initialRect)`. Fixed at the root behind an opt-in
  `preserve` flag so the croppers' fresh-maximal default is untouched.

Rework `MpiBaseApp` into the step carousel. Nothing Head-Swap-specific in it.

1. **Frame shell** → verify: an app with `steps: []` renders a 2-step flow (inputs → run)
   and navigates.
   - Topbar ticker (CLICKABLE, `aria-current="step"`), arrows outside content, slide.
   - Divider inset top/bottom, on FIRST and LAST step only.
   - Centre-gravity layout; centre-out-horizontal gradient (local CSS tokens, per doc).
2. **Slot rendering** → verify: a filled image slot is the image itself — no box chrome, no
   crop, no letterbox padding — at its own aspect.
3. **`STEP_KINDS` registry + `MpiStepBox`** → verify: box drag/resize CLAMPS to image bounds;
   coords land in the app's input state as source pixels.
   - Contract: a step kind receives `{ media, value, onChange }`, reports a value, and never
     knows its host app / the workflow / any injector.
   - `MpiStepBox` wraps `cropTool` with `showGrid: false`.
4. **Declared step `fields`** → verify: a step declaring `fields:[...]` renders ONE row between
   canvas and hint, and its values arrive in the step's reported value — with no frame code
   that knows what any field means.
   - The FRAME renders the row (not the gizmo), so every gizmo's controls match for free.
   - Hard cap: one row, no nesting/panels/accordions. A gizmo wanting more = split the step.
   - Head Swap needs no fields; build the mechanism, prove it with a throwaway declaration.
5. **`steps` on `AppDef`** → verify: declaring `steps:[{kind,role,title,hint}]` produces those
   middle steps with NO per-app layout code.
6. **Register CSS in `js/shell/preloadStyles.js`; document props in `js/components/types.js`.**

**Verify mode:** `user-ux` — the whole point is how it feels.

## Phase 2 — Head Swap as the proof — ✅ BUILT, self-verified 2026-07-18

7. **Head Swap `steps` + `uiComponent`** → verified: boxes reach `Input_Box` / `Input_Box_2`
   as top-left source pixels through the REAL injector + REAL graph (8/8); tier radio ships
   the MEASURED relative labels. Evidence: `validation.md`.
   - If ANY of this needs a frame change, the frame was wrong — fix the frame, not the app.

**One frame change, and it was the frame's fault:** `getInputs()` took no arguments, so the
controls component could not see the boxes the frame had collected. The role→node mapping is
app knowledge and must stay out of the frame, so the frame now passes
`getInputs({ stepValues })`. `MpiBaseApp` still names no app, role or node.

Still awaiting the user's look-and-feel pass, AND a real local generation — Head Swap does run
locally (the "LoRA 404" premise was wrong; see Current State), so the boxes can and should be
proven end-to-end by generating. User is running that test.

**Verify mode:** `user-ux`.

## Phase 3 — Hold-until-Apply (run-path, NOT UI)

Separate phase deliberately: a UI regression and a data-path regression must not land in the
same diff.

8. **Results stay in-app until Apply** → verify: generating creates NO gallery card; Apply
   commits one; Discard leaves none; closing with an unapplied result prompts.
   - Touches `submitAppGeneration`'s `scope`/`placeholderGroup` and the completion path.
   - Pending results live in app state, do NOT survive close (per the design doc).
   - Files still land on disk — orphans are the existing `.preview-assets` + Cleanup GC path's
     job (MPI-277/227), NOT a new mechanism.

**Verify mode:** `user-ux` + check the gallery/project JSON is genuinely untouched pre-Apply.

## Out of scope

- The fp32-vs-fp16 LoRA A/B and any R2 upload (NOT authorised).
- Deprecating the three test apps (image-regen, sdxl-4k, video-stitch) and the dev-gate's
  ">=4 apps" trigger — noted on the card as a side effect to decide deliberately, not here.
- Video/audio slot previews (still open, MPI-259).

## Verification

**Verify mode:** `user-ux` for every phase — this is a UI/UX surface only the user can judge.
Per-phase checks are listed inline above.
