# MPI-90 — Remote compatibility pre-check (manifest gate)

> Promoted from MPI-64 Phase 3 Step 5 / OPEN-ITEMS F1 + MPI-94 F4.
> **Re-scoped 2026-06-17 to the live Design-A architecture** (see "Re-scope" below). App + backend +
> one wrapper/image dependency.

## Plain-language goal

Before the app lets you generate on a remote Pod, ask the Pod what it has installed and check it matches
what the app needs. On a mismatch, show a clear popup with a fix action — instead of letting the
generation start and crash mid-run.

The Pod reports this via the authenticated `GET /wrapper/manifest` endpoint (already live in the wrapper).
The manifest survives Pod stop/start (it lives on the volume / is re-stamped at boot).

## Re-scope (why this card shrank)

The original brief was written against **Design B** (PyTorch/ComfyUI/CUDA on the *volume*). The live system
is **Design A** (engine in the Docker *image*; volume holds *models only*, which are arch-agnostic). See the
supersession note at the top of `research/volume-manifest-schema.md` (in MPI-64 workspace). Consequences:

- **The "Reinitialize" outcomes are mostly withdrawn.** `arch_family`, `cuda_version`, `docker_image_digest`,
  `pytorch_version` no longer force a volume wipe — the runtime is in the image, not the volume. A volume is
  portable across every card the booted image's CUDA build supports. Those fields become *informational*.
- **The real arch-compat axis moved to GPU-pick / Pod-create time** ("is there a Cubric image for this card's
  arch?"), which was MPI-91 (archived as superseded). This card does NOT re-implement that.
- **What survives as a real readiness gate is thin:**
  - `manifest_schema_version` unknown/newer than the app understands → block + "incompatible Cubric version".
  - Workflow-bundle version mismatch → already enforced wrapper-side (409 `bundle_incompatible` on
    `/wrapper/prompt`, see wrapper.py:591); the app should surface this as a clear pre-check, not a raw 409.
  - Model `is_complete: false` → **Warn** (existing remote-model-list resume-download pattern), not a gate.
  - Image/wrapper/comfyui version drift → **Warn / informational** (provenance), not Repair/Reinit.

So this card = a **lightweight pre-generation compatibility pre-check** with a clear blocking modal for the
two real block cases (unknown schema, bundle mismatch) and a warn surface for the rest. NOT the big
repair/reinitialize matrix the original title implied.

## Blocking dependency — wrapper writer is a stub

The wrapper currently writes a **minimal** manifest: `{ manifest_schema_version, initialized_at, models[],
last_written_at }` (`_manifest_record_model`, wrapper.py:847). The image *does* know
`CUBRIC_MANIFEST_VERSION` / `CUBRIC_WRAPPER_VERSION` / `COMFYUI_REF` (build args → ENV, Dockerfile:205-209),
but **never writes them into the manifest file**. There is no first-boot init that stamps version/bundle fields.

**Therefore the app gate has almost nothing meaningful to compare today.** This card has two halves:

1. **Wrapper/image half (mpi-ci dependency, USER ships):** extend the manifest writer + add a first-boot
   stamp so the manifest carries `manifest_schema_version`, `wrapper_version`, `comfyui_ref`,
   `workflow_bundle_version` (from the existing ENV) — written on boot, not only on model install. Without
   this, the app half can only check schema-version + model completeness.
2. **App/backend half (this card's code):** read `/wrapper/manifest` at readiness, compare against the app's
   expected schema + bundle version, gate generation on a real mismatch with a clear modal, warn on the rest.

The app half can ship the schema-version + bundle pre-check *now* (those fields exist or come from the
wrapper's existing 409). The version-drift *warn* surface depends on the writer half landing first.

## Decision table (re-scoped, Design-A)

| Manifest signal | Outcome | Blocking? | Surface |
|---|---|---|---|
| `manifest_schema_version` unknown / > app max | **Block** | Yes | Modal: "This Pod was set up by an incompatible Cubric version." |
| Workflow-bundle version mismatch | **Block** | Yes | Modal (pre-empt the wrapper 409): "This Pod's workflow set is out of date." |
| Manifest missing (404) | Treat as fresh / pre-init | No (today) | Proceed; log. (Design-A: a fresh volume is valid; init stamps on first use.) |
| Model `is_complete: false` | **Warn** | No | Remote model list: incomplete + resume-download (existing pattern). |
| Image / wrapper / comfyui version drift | **Warn / info** | No | Status panel only (provenance). Depends on writer-half fields. |

No `arch_family` / `cuda_version` / `docker_image_digest` gate — withdrawn under Design A.

## Likely files (app/backend half)

- `routes/remoteEngine.js` — `waitForWrapperReady` already polls `/health`; add a manifest fetch + compare at
  readiness (or a dedicated `/remote/pod/manifest-check` route the renderer calls before first generate).
- `routes/remoteProxy.js` — proxy/relay for `/wrapper/manifest` (use existing `wrapperFetch` 404+502 retry).
- Settings / remote-status component — the blocking modal (block cases) + status-panel warn surface.
- `js/services/generationService.js` (or the remote dispatch path) — gate the *first* remote generate on the
  pre-check result so a mismatch never reaches `/wrapper/prompt`.

## Constraints

- USER runs live Pod ops; the wrapper/image writer half ships in (or before) the next Pod image build and is
  live-verified by the user. The app half must degrade gracefully when the manifest lacks the new fields
  (older image → fewer fields → fewer warns, never a false block).
- Do not re-introduce the withdrawn Design-B reinitialize gates.
- Manifest 404 is NOT an error state — a fresh/pre-init volume is valid.

## Verify

- Incompatible schema-version or bundle mismatch → clear blocking modal BEFORE generation starts (no mid-gen
  crash, no raw 409 leaking to the user).
- Compatible Pod → no gate, generate proceeds.
- Manifest missing (404) or missing new fields (old image) → no false block; proceed with at most a warn.
- Incomplete model → warn + resume action, generation of other models still allowed.

## Related

- MPI-64 (epic), research/volume-manifest-schema.md (Design-A supersession note at top is authoritative;
  read the field table THROUGH that note), MPI-94 F4 (reassigned here), MPI-81 (CUDA floor / image rebuild),
  MPI-91 (GPU-pick arch filter — archived superseded; that was the arch-compat axis, NOT this card).
