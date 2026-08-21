# MPI-579 Checklist

Derived from `plan.md` phases at `todo -> doing` (2026-08-19T23:53:43Z).

- [x] Phase 0 - recover the proven bench graph (build_v2v.py) into this session
- [x] Phase 1 - /object_info schema gate + pick the sigma-string route
- [x] Phase 2 - author comfy_workflows/ltx_video_upscale.json (frames 8n+1, /32, AV latent, audio pass-through)
- [x] Phase 3 - the ltxVideoUpscale op: commandRegistry + UNIVERSAL_WORKFLOWS + progress stages
- [x] Phase 4 - the LTX Video upscaler PluginDef with both mapTo sliders
- [x] Phase 5 - in-app VRAM measurement (GO/NO-GO, --lowvram, not a bench number)
- [x] The Library row - _pluginTile aggregates requiredModels (size, install, progress, Uninstall gate)
- [x] Phase 6 - end-to-end user-ux check in an isolated app instance, in front of Fabio

Phase 0 + Phase 1 closed 2026-08-19T23:58:00Z - evidence in validation.md.

The Library row closed 2026-08-20T01:05:00Z - evidence in validation.md. Phase 6 machine-checkable half verified the same run; the visual half is Fabio's.

Phase 6 PASSED 2026-08-20 - Fabio ran the upscale in the History workspace. Slider RENDERING defect he spotted is carded as MPI-582 (every UI element must be a component), deliberately not folded in here.

CLOSED 2026-08-20 - every item green. `npm test` 630/630, `release:check` green after
fixing an `operation_registry.json` mirror that was missing `universal: true`, claim
auditor 10/10 PROVEN. MPI-580 and MPI-568 closed alongside; the Flow half of video
upscale is MPI-584.
