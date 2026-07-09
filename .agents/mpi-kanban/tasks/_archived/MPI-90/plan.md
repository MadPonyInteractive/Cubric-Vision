# MPI-90 Plan — Remote compatibility pre-check

Re-scoped to Design A (see brief.md). Two halves; the app half can partially ship before the wrapper half.

## Dependency order

- **D0 — Wrapper/image writer (mpi-ci, USER ships).** Manifest must carry `manifest_schema_version`,
  `wrapper_version`, `comfyui_ref`, `workflow_bundle_version`, stamped at first boot (not only on model
  install). Until D0 lands, the app half is limited to schema-version + model-completeness checks.

## Phase 1 — App pre-check route (ships now, no D0 needed) → verify

- Add a backend pre-check that fetches `GET /wrapper/manifest` through the proxy (`wrapperFetch`, 404+502
  retry) at readiness or on a dedicated `/remote/pod/manifest-check` route.
- Parse + compare against the app's expected `manifest_schema_version` (define app's max known version in one
  constant). Return a structured verdict: `{ ok, blocks: [...], warns: [...] }`.
- 404 → `{ ok: true }` (fresh/pre-init volume is valid; never a block).
- **Verify:** unit-level — feed a minimal manifest (schema 1), a too-new schema, and a 404; assert verdict.

## Phase 2 — Gate the first remote generate on the verdict → verify

- In the remote generate dispatch path, call the pre-check before the first `/wrapper/prompt` of a session.
- On a `blocks[]` verdict → show the blocking modal (existing overlay/dialog pattern), do NOT dispatch.
- Pre-empt the wrapper's `bundle_incompatible` 409: if the manifest exposes `workflow_bundle_version` (D0),
  compare app-side and block early; if not, keep the 409 → friendly-modal mapping as a fallback.
- **Verify:** desktop/manual — a Pod with a mismatching bundle shows the modal before generation; a matching
  Pod generates with no gate.

## Phase 3 — Warn surface (needs D0 fields) → verify

- Surface non-blocking signals in the remote status panel: incomplete models (reuse existing resume-download),
  and image/wrapper/comfyui version drift (provenance only).
- **Verify:** an older image (missing the new fields) produces NO warns and NO false block; a newer image with
  drift shows the provenance warn only.

## Out of scope (explicit)

- Any volume **Reinitialize** flow (withdrawn under Design A).
- Any **Repair** flow for ComfyUI/PyTorch/custom-node bundles (engine is in the image, not the volume).
- GPU-pick / Pod-create arch filtering (was MPI-91, archived superseded).

## Open questions

- Where does the app's "expected workflow_bundle_version" come from? (app constant vs derived from the
  workflow JSONs it ships). Resolve before Phase 2's early bundle block; until then, rely on the 409 fallback.
- Should the pre-check run once per session (cache the verdict) or per generate? Default: once per Pod
  connection, re-run on reconnect.
