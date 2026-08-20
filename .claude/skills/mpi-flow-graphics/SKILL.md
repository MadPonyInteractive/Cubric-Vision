---
name: mpi-flow-graphics
description: Make the two preview assets a Flow ships — the 4/5 tile still and the wide autoplaying hero clip. Use when the user says "flow graphics", "create graphics for <flow>", "let's do the graphics for <flow>", "make the images for the <name> flow", "the flow needs art", "tile and hero for <name>", "flow preview image", "give <flow> a proper preview", "art for the new flow", "/mpi-flow-graphics", or hands over clips/plates for a flow. NOT for wiring a flow (that is /mpi-add-flow) and NOT for model previews. This skill ENFORCES docs/playbooks/add-flow/06-preview-image.md — it does not replace it.
user-invocable: true
---

# /mpi-flow-graphics — a Flow's tile and hero

A Flow ships **two** assets under `comfy_workflows/display/`, and they do different jobs:

| Field | Asset | Job |
|---|---|---|
| `preview` | 4/5 still `.webp` | Say what the flow **is**, in a glance, at ~220 px |
| `video` | wide 8:5 or 16:9 autoplaying `.mp4` | Show what the flow **does** |

## STEP 0 — MANDATORY, BEFORE ANY OTHER TOOL CALL

Read **`docs/playbooks/add-flow/06-preview-image.md`** in full. It is one file and it
carries every measurement, the art direction, the build recipes, and the traps that each
cost a rebuild while producing no error at all — `drawbox` not animating, a translucent
reveal cover, a flat `showwavespic`, a `sharp` snippet run from the wrong directory.

Then state, in one line each:

1. **What actually changes** when this flow runs — frame content / length or motion /
   something not visible at all. That choice picks the hero device, and getting it wrong
   is the one mistake this playbook exists to prevent (a before/after on a flow that
   returns the same pixels is two identical panels).
2. **What real material exists** — a run of this flow with its source kept, plates the
   user supplied, or nothing yet. Preview assets come from real runs, never from an
   impression of one.
3. Whether the tile can be **derived from the hero** (a frozen instant of it) or needs
   its own composition.

If the material does not exist, say so and ask for a run before building anything.

## STEP 1 — Build, checking at real size as you go

The playbook carries the recipes. Two things it cannot say often enough:

- **Judge every asset at its real display width** — 220 px for the tile, 446 px for the
  hero. A contact sheet at 620 px flatters everything and has twice sent an unreadable
  asset forward.
- **`:3000` is normally the user's live app.** Generating or driving there touches their
  session. Use `npm run app:isolated` and the port it prints.

## STEP 2 — Wire and prove

- Set `preview` and `video` in `js/data/flowsRegistry.js`, deleting any placeholder comment.
- Launch an isolated instance and confirm the hero is really playing — `paused:false`,
  `muted`, `loop`, `currentTime` advancing — and that both assets return **200 with the
  right byte count**. A `src` in the DOM is not proof the file loaded.
- Run `npm test`.
- Work the playbook's checklist. If you learned something that would have saved you a
  rebuild, add it to the playbook's trap table in the same session.

## Not this skill

- Wiring a new Flow → `/mpi-add-flow`.
- A model's preview/video → those are ModelDef fields with different rules (a model's
  `video` makes its tile a 16:9 hover-play video tile; a flow's never does).
