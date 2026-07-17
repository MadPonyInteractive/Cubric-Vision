# [shared] Output capture titles — the naming law (MPI-252)

> How the app captures a workflow's result. Single naming law, both playbooks.

- The capture node title is `Output_Image` / `Output_Video` / `Output_Preview`
  (single naming law, MPI-252) — matched case-insensitively, no bare `Output`.
- Use `PreviewImage` (titled `Output_Preview`), NOT `SaveImage`, for preview capture.
- A typo'd capture title = a silently EMPTY capture (same silent-skip family as the
  [inject-titles guard](inject-titles-guard.md); a run that logs `Prompt executed in N
  seconds` but the app captures nothing → check the capture node's title first, MPI-217).
- The match is on the EXACT lowercased title (`Output_image` resolves too — Chroma's
  detailer/upscaler use that spelling). The bare `'output'` base string survives only as
  a defensive fallback; no shipping workflow relies on it.

**Playbook override (divergence lives inline in the playbook):**
- **App** — multi-output capture uses PREFIX match: `Output_Image*` / `Output_video*`
  so numbered siblings qualify; `output_audio` / `output_preview` stay EXACT:
  [../add-app/02-media-io.md](../add-app/02-media-io.md). Models use the single-capture case.
