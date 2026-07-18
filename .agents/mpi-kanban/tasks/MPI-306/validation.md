# MPI-306 — validation

## Mock-up phase (2026-07-18) — COMPLETE, user-approved

Three independent mock-ups produced via the `impeccable` skill, each given the vision
and the hard constraints but deliberately NO prescribed layout.

| Mock-up | Thesis | Outcome |
|---|---|---|
| A | Workbench — desk zones you clear to work | not chosen |
| B | Spine — persistent named left rail | not chosen |
| C | Surgical — the gizmo IS the product | **CHOSEN**, revised to C2 |

**C2 approved verbatim by the user:** "This is it. Very good. ... This is the design."

### Revisions applied to C before approval
1. Middle steps reverted to the written design — bounded centred canvas, title above,
   guidance below. C's 60/40 annotation-column split rejected.
2. Step ticker made CLICKABLE (overturns "dots indicate but do not navigate").
3. Step 0 rebuilt for air: centre gravity, inset divider, vertically-centred left group,
   slot-is-placeholder (filled slot = the image itself, no box chrome, no crop/padding).
4. Background regrounded on `--lib-bg: oklch(0.26 0.020 350)` — the App/Model Library
   ground — with an ambient radial gradient.
5. Tier cost changed from fabricated absolute seconds to relative percentages
   (baseline / ~40% / ~20% of time), so it holds across any GPU.

### Verified on the artefact
- JS parses clean; zero external requests; no `#000`/`#fff`.
- No prompt UI, no seed UI (only the banned-list comment mentions the word).
- Box gizmo clamps EDGES before deriving w/h — an off-edge drag cannot produce an
  out-of-bounds box. 13 clamp sites.
- `prefers-reduced-motion` honoured.

Artefact (throwaway): `<scratchpad>/mockup-C2.html`.
Durable record: `docs/playbooks/add-app/ui/carousel-frame.md` § The approved composition.

## Phase 1 — the portable frame (2026-07-18) — BUILT, self-verified, awaiting user check

`MpiBaseApp` reworked from a flat form into the step carousel. Nothing Head-Swap-specific
in it. Run path untouched (Phase 3).

**Shipped:** `MpiBaseApp.js`/`.css` (rewritten), `MpiBaseApp/stepKinds.js` (new registry),
`MpiStepBox/` (new step kind), `cropTool.js` (`showGrid` option + a restore fix),
`appsRegistry.js` (`steps`/`AppStep`/`AppStepField` typedefs), `preloadStyles.js`,
`types.js`.

### Automated checks — 22/22 frame + 10/10 box, driven in the running app
Frame: mounts; `steps:[]` → 2-step flow; ticker NAVIGATES; divider present on first/last
and ABSENT on middle steps; declared `fields` → exactly ONE frame-rendered row; a step
with no media explains itself; arrows disable at both ends; reopening destroys the prior
frame (no stacking); zero console errors and zero 404s.

Box gizmo (real 1500×1000 image): default box = whole image; coords are integers in
source pixels; restore round-trips exactly (`{100,120,400,300}`); `ratio:1` yields a
square box in SOURCE px (the anisotropic-normalization trap); every box clamped inside
the source; `destroy()` leaves nothing behind.

Full unit suite: 164/172. The 8 failures are pre-existing — confirmed by re-running with
these changes stashed (`runpod-remote-hardening` fails 4/16 either way). ESLint clean on
every touched file.

### Bugs found and fixed during verification
1. **Declared `fields` were built inside the has-media branch** — a frame-owned contract
   silently depended on a gizmo existing. Lifted out.
2. **`cropTool.enable(rect)` discarded the caller's rect.** `_applyRatioToRect` ignored
   its argument in BOTH branches, so a restored box was replaced by a maximal one. This
   was a LATENT bug in shared code: `MpiVideoViewer.enterCropMode(initialRect)` passes a
   rect that was being thrown away too. Fixed at the root with an opt-in `preserve` flag
   (`setRect` = the restore path); `enable()`'s fresh-maximal default is unchanged, which
   is what the video/canvas croppers rely on.
3. Example image used an invented `assets/models/` path → 404. Now
   `comfy_workflows/display/`, matching the App Library.

### Design change made this session (user-decided)
**Discard removed; closing no longer prompts.** Discard was redundant — *Generate again*
overwrites a pending result and closing drops it, so its only unique act was "clear the
pane and stay here". With nothing unique to destroy, the close dialog guarded a
non-decision. The "Not saved yet" note stays: it is what makes Apply legible. Recorded in
`carousel-frame.md` (both the run-path section and the approved-composition list).

### Known-inert by design
Apply renders but does nothing — the run path still commits at ENQUEUE time. That is
Phase 3, deliberately a separate diff.

## NOT yet validated
- **User check of look and feel** — the whole point (`verify mode: user-ux`). Gradient
  stops are explicitly to be tuned live in the app.
- The box step has never run against a real UPLOADED image in the flow (tested by direct
  mount); Head Swap declares no `steps` yet — that is Phase 2.
- Phase 2 (Head Swap as the frame's proof) and Phase 3 (hold-until-Apply) not started.
- Step-0 example image is a PLACEHOLDER (`app.preview`, currently `sdxl-real-05.webp`).
  User will supply a real image/video later; swapping the `preview` filename is the edit.
