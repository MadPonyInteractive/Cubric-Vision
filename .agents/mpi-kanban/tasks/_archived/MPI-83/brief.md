# MPI-83 — Imported video bugs (prompt box + per-file probe)

> Deferred from the MPI-64 SaveVideo/audio-mux session (2026-06-14). **Log was
> clean — no errors, no stack traces.** Both are import-side gallery logic/data
> issues, a DIFFERENT subsystem than the generation → save-generation → ffmpeg-mux
> path changed in MPI-64. They do NOT block the SaveVideo combine work.

## Bug 1 — No prompt box for imported (model-less) videos

**Repro:** drag two videos into the gallery (one with audio, one without) → open
in history. The PromptBox is not accessible; hovering it shows on the status bar:
**"No prompt-driven ops available for this model."**

**Suspected root:** imported media has `modelId: null` (no model). PromptBox op
availability resolves prompt-driven operations from the item's model; a model-less
import yields none → the message. Universal video TOOLS (interpolate / upscale /
crop / resize) should still be reachable via the tool panel even for imports.

**To confirm:** is this PRE-EXISTING behavior for any model-less dragged-in media,
or did the recent video work change op-availability resolution for video items?
The user phrased it as "probably because of when we split the video model into
two" — clarify whether that means the Wan T2V/I2V model split (MPI-68) or the
SaveVideo output split (MPI-64). For a model-less import, neither should matter —
verify the resolution path for `modelId: null` video items
(`MpiPromptBox`/`PromptBoxControls.js` op-mode resolution, `commandRegistry`
prompt-driven flags).

## Bug 2 — Only the first of multiple imported videos shows fps/duration

**Repro:** import 3 videos (with-audio, no-audio, with-audio). Only the FIRST
displays length (seconds) + fps; the other two lack the probed metadata.

**Suspected root:** the import video-probe (ffprobe → fps/duration/frameCount)
ran for the first imported file only, not per-file across a multi-file import.
Likely an import/reconciliation loop that probes once or races. Look at the
import path (drag-drop handler → projectReconciler / the import save) and the
per-file ffprobe (`services/ffprobeVideo.js` consumers).

## Notes

- Neither bug appears in `logs/app.log` (clean — no throw), so both are
  silent logic/data, not crashes.
- NOT caused by the MPI-64 SaveVideo split: imports do not flow through
  `save-generation` (no mux), and the prompt-box issue is model-resolution.
- Priority: low/medium — imports are a side flow; generation (the core) is
  unaffected. Pick up after the MPI-64 SaveVideo combine lands.
