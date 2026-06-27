# Volume Manifest Schema

**Status:** Decision record — defines the `/workspace/cubric/volume-manifest.json` schema and all comparison rules. No code written.

> **DESIGN A SUPERSESSION (2026-06-11, user decision — see plan.md Plan Drift).**
> PyTorch + ComfyUI live in the **Docker image** (`/opt/comfyui`), NOT on the volume.
> The volume holds **models only** (arch-agnostic safetensors). Consequences for this doc:
>
> - **`gpu_profile.arch_family` exact-match Reinitialize gate is WITHDRAWN.** That gate
>   assumed PyTorch-on-volume (Design B). A volume has zero GPU-arch binding; one volume
>   is portable across every card whose arch the *booted image's* CUDA build supports.
>   `arch_family` (and `cu_build`) become **informational** — they record the card that
>   last ran, nothing more. The corresponding decision-matrix row downgrades to Warn/log.
> - **The real compatibility axis is card-arch vs available-image CUDA build** ("is there
>   a Cubric image for this card's arch?"), checked at GPU-pick / Pod-create time. New
>   arch support = Cubric publishes another image (e.g. cu124 → Ampere/Ada/Hopper; future
>   cu128 → Blackwell). The user never reinitializes a volume to switch cards.
> - `cuda_version` / `docker_image_digest` mismatches likewise no longer force a volume
>   reinitialize for runtime reasons (the runtime is in the image); they stay recorded for
>   provenance. Custom-node native extensions, if ever installed on-volume, would reopen
>   the question — none are today (custom nodes ship in the image bundle).
> - Wrapper code (v0.2.0+) writes a minimal manifest (`manifest_schema_version`, `models[]`,
>   timestamps) on first model install; full first-boot init remains a Phase 3 item. The
>   live wrapper env names the file `/workspace/cubric/manifest.json` (CUBRIC_MANIFEST_PATH),
>   not `volume-manifest.json` as drafted below.
>
> Everything below is the original Design-B-era record — still authoritative for the
> models[] entry shape, atomic write policy, and the Repair concepts, but read the
> arch/CUDA/reinitialize rows through the lens of this note.

---

## Decision

The manifest is a single JSON file at `/workspace/cubric/volume-manifest.json`, written by the Cubric wrapper on first volume initialization and updated on any meaningful state change (model install, bundle upgrade, Pod start). The desktop app reads it through the wrapper's authenticated `/manifest` endpoint before every Pod start and before creating a new Pod on an existing volume. A missing manifest triggers full initialization. A present-but-incompatible manifest triggers the repair/reinitialize decision matrix below. No field is silently tolerated — every comparison has a defined outcome.

---

## Field Table

| Field | Key | Type | Comparison Rule | Mismatch Failure Action |
|---|---|---|---|---|
| Cubric template version | `cubric_template_version` | `string` (semver) | **Exact major.minor** — patch may differ | Reinitialize |
| Docker image digest | `docker_image_digest` | `string` (sha256 digest) | **Exact match** | Reinitialize |
| Docker image tag | `docker_image_tag` | `string` | Informational (logged alongside digest) | — |
| ComfyUI version | `comfyui_version` | `string` (semver or commit SHA) | **Exact match** | Repair |
| Python version | `python_version` | `string` (X.Y.Z) | **Exact major.minor** — patch may differ | Repair |
| PyTorch version | `pytorch_version` | `string` (semver) | **Exact major.minor** — patch may differ | Repair |
| CUDA version | `cuda_version` | `string` (X.Y) | **Exact match** | Reinitialize |
| Custom-node bundle version | `custom_node_bundle.version` | `string` (semver) | **Exact match** | Repair |
| Custom-node bundle list | `custom_node_bundle.nodes` | `array<{id, version}>` | **Set equality** (id + version pairs) | Repair |
| Workflow bundle version | `workflow_bundle_version` | `string` (semver) | **Minimum** — installed must be >= app requirement | Repair |
| Installed model state | `models` | `array<ModelEntry>` | Informational — app checks `is_complete` per entry | Warn (missing model, not a pod gate) |
| Volume ID | `volume_id` | `string` | **Exact match** (verified against RunPod API at attach time) | Reinitialize |
| Data center | `datacenter_id` | `string` | Informational — shown to user during GPU selection | Warn |
| Last-compatible GPU profile | `gpu_profile` | `GpuProfile` object | **VRAM minimum** + **exact arch family** | Warn → gate if arch incompatible |
| Manifest schema version | `manifest_schema_version` | `integer` | **Exact match** — app refuses to parse unknown schema versions | Reinitialize |
| Initialized at | `initialized_at` | `string` (ISO-8601 UTC) | Informational | — |
| Last written at | `last_written_at` | `string` (ISO-8601 UTC) | Informational | — |
| Cubric app version (writer) | `written_by_app_version` | `string` (semver) | Informational | — |

---

## Sub-Type Definitions

### `ModelEntry`

```jsonc
{
  "id": "string",              // internal Cubric model registry ID
  "filename": "string",        // basename on volume
  "sha256": "string",          // expected SHA-256 of the file (hex)
  "size_bytes": 123456789,     // expected file size
  "is_complete": true,         // false = partial download present
  "installed_at": "2026-06-11T00:00:00Z"
}
```

`is_complete: false` does not block Pod start. The app renders the model as incomplete in the remote model list and offers a resume-download action. This mirrors the local `isCompleteOnDisk` pattern.

### `GpuProfile`

```jsonc
{
  "arch_family": "ampere",     // exact string: "ada_lovelace" | "ampere" | "turing" | "volta" | "hopper" | etc.
  "min_vram_gb": 24,           // minimum VRAM (GB) required for this volume profile
  "reference_gpu": "RTX 3090", // informational — GPU that initialized the volume
  "cu_build": "cu124"          // CUDA compute build used: "cu126" | "cu124" | etc.
}
```

**Arch-family gate rationale:** The local app already gates GPU build selection by architecture — `cu126` is reserved for legacy 10-series/older; remote volumes may have PyTorch built against a specific CUDA compute path that is arch-family-bound. Deploying an Ampere-initialized volume onto a Turing Pod can trigger silent numerical divergence or missing ops. The `arch_family` comparison is therefore exact. `min_vram_gb` is a minimum — a larger GPU is always acceptable.

---

## Concrete Example Manifest

```json
{
  "manifest_schema_version": 1,
  "volume_id": "vol-abc123def456",
  "datacenter_id": "US-TX-3",
  "initialized_at": "2026-06-11T08:00:00Z",
  "last_written_at": "2026-06-11T09:34:17Z",
  "written_by_app_version": "1.0.0",

  "cubric_template_version": "1.0.0",
  "docker_image_digest": "sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "docker_image_tag": "cubric-remote-engine:1.0.0",

  "comfyui_version": "0.3.28",
  "python_version": "3.11.9",
  "pytorch_version": "2.3.1",
  "cuda_version": "12.4",

  "custom_node_bundle": {
    "version": "1.0.0",
    "nodes": [
      { "id": "ComfyUI-VideoHelperSuite", "version": "1.0.3" },
      { "id": "ComfyUI-Impact-Pack",       "version": "7.1.0" },
      { "id": "ComfyUI_GGUF",              "version": "0.1.2" }
    ]
  },

  "workflow_bundle_version": "1.0.0",

  "gpu_profile": {
    "arch_family": "ampere",
    "min_vram_gb": 24,
    "reference_gpu": "RTX 3090",
    "cu_build": "cu124"
  },

  "models": [
    {
      "id": "wan21_t2v_14b",
      "filename": "wan2.1_t2v_14B_bf16.safetensors",
      "sha256": "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
      "size_bytes": 28000000000,
      "is_complete": true,
      "installed_at": "2026-06-11T08:12:00Z"
    },
    {
      "id": "flux_dev",
      "filename": "flux1-dev.safetensors",
      "sha256": "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12",
      "size_bytes": 23800000000,
      "is_complete": false,
      "installed_at": "2026-06-11T09:30:00Z"
    }
  ]
}
```

---

## Repair vs Reinitialize Decision Matrix

**Definitions:**
- **Reinitialize** — the volume contents are incompatible at the base layer. The wrapper and/or ComfyUI cannot safely start against this volume. User must confirm volume wipe + re-initialization. This is a blocking gate: Pod creation is refused until resolved.
- **Repair** — the volume has compatible base layers (image, CUDA) but specific software components (ComfyUI, bundles) are out of sync. A repair run updates only the affected layer without wiping models. User must confirm. Pod creation is blocked until repair completes.
- **Warn** — mismatch is informational. Pod creation proceeds. The app surfaces the discrepancy in the remote engine status panel so the user can act if desired.
- **— (no action)** — informational field only; no comparison occurs beyond logging.

| Mismatch Condition | Outcome | Blocking? | User Prompt |
|---|---|---|---|
| `manifest_schema_version` unknown | Reinitialize | Yes | "Volume was initialized by an incompatible Cubric version. Reinitialize the volume?" |
| `volume_id` does not match RunPod API reported volume | Reinitialize | Yes | "Volume ID mismatch detected — this volume may have been swapped. Reinitialize?" |
| `docker_image_digest` mismatch | Reinitialize | Yes | "Volume was initialized with a different engine image. Reinitialize the volume?" |
| `cubric_template_version` major.minor mismatch | Reinitialize | Yes | "Volume template profile is incompatible. Reinitialize the volume?" |
| `cuda_version` mismatch | Reinitialize | Yes | "Volume CUDA version (X.Y) is incompatible with this template (A.B). Reinitialize the volume?" |
| `gpu_profile.arch_family` mismatch | Reinitialize | Yes | "This GPU architecture is incompatible with the volume profile. Select a matching GPU or reinitialize." |
| `comfyui_version` mismatch | Repair | Yes | "ComfyUI on volume is out of date. Run repair?" |
| `python_version` major.minor mismatch | Repair | Yes | "Python version mismatch detected. Run repair?" |
| `pytorch_version` major.minor mismatch | Repair | Yes | "PyTorch version mismatch detected. Run repair?" |
| `custom_node_bundle.version` mismatch | Repair | Yes | "Custom-node bundle on volume is out of date. Run repair?" |
| `custom_node_bundle.nodes` set mismatch | Repair | Yes | "Custom nodes on volume do not match the required set. Run repair?" |
| `workflow_bundle_version` below app minimum | Repair | Yes | "Workflow bundle on volume is too old. Run repair?" |
| `gpu_profile.min_vram_gb` — selected GPU has less VRAM | Warn | No | Status panel: "Selected GPU has less VRAM than volume profile ({N} GB required)" |
| `datacenter_id` — volume not in same datacenter as selected Pod | Warn | No | Status panel: "Volume datacenter ({X}) differs from Pod datacenter ({Y}). Performance and availability may differ." |
| Model `is_complete: false` | Warn | No | Remote model list: model shown as incomplete with resume-download action |
| `written_by_app_version`, `docker_image_tag`, `initialized_at`, `last_written_at`, `reference_gpu` | Informational | No | Logged only |

---

## Comparison Rules: Rationale Footnotes

**`docker_image_digest` exact match (not just tag):** Tags are mutable. A re-push to the same tag silently changes the underlying image. Only the digest is stable enough to be a compatibility gate. The tag is logged alongside it purely for human readability.

**`cuda_version` exact match (not minimum):** A volume initialized with CUDA 12.4 PyTorch may have compiled custom-node extensions against 12.4 ABI. Running that volume under a Pod with CUDA 12.6 or 11.8 risks extension load failures or numeric errors that are difficult to surface. The arch-gating philosophy used locally (`cu126` = legacy 10-series only) applies identically here.

**`cubric_template_version` major.minor only:** Patch releases within a minor version are assumed to be backward-compatible (bug fixes, security patches). A minor-version increment may change the wrapper API contract, startup command, or volume directory layout — hence a reinitialize gate at minor. A patch bump on the same minor should pass without user action.

**`comfyui_version` exact match (Repair, not Reinitialize):** ComfyUI can be reinstalled on the volume without wiping models. Repair is therefore safe. However, the wrapper enforces the exact version because ComfyUI's workflow JSON format and node APIs change between versions; the workflow bundle is built against a pinned ComfyUI version and must not run against a different one.

**`workflow_bundle_version` minimum (not exact):** Workflow bundles are additive. A volume with a newer bundle than the app requires is acceptable — the app's workflow JSON will still find all required nodes. Only a stale bundle (below the app minimum) triggers repair.

**`gpu_profile.arch_family` exact match:** Matches the local `selectNvidiaBuild` rigor: cu126 (legacy) vs cu124+ (modern Ampere/Ada) are distinct build families. A volume's custom-node native extensions may be compiled for a specific arch family. Best-effort cross-family start is worse than a clear gate.

**`gpu_profile.min_vram_gb` minimum only (Warn, not block):** VRAM sufficiency for a specific workflow is known at generation time, not at Pod start. Blocking Pod start on VRAM would prevent users from connecting to inspect the volume state or perform repairs. A warning is appropriate; workflow dispatch can add a harder VRAM check per-operation.

---

## Manifest Write / Update Policy

| Event | Writer | Fields Updated |
|---|---|---|
| Volume first initialization | Wrapper (init script) | All fields |
| Model install completes | Wrapper (`/models/install` handler) | `models[]`, `last_written_at` |
| Model download resumed and finalized | Wrapper | `models[].is_complete`, `models[].sha256`, `last_written_at` |
| Bundle repair completes | Wrapper (repair script) | Affected bundle fields, `last_written_at` |
| Pod start (version check) | Wrapper (on startup) | `last_written_at`, `written_by_app_version` |

Writes are atomic: the wrapper writes to `volume-manifest.tmp.json`, then renames to `volume-manifest.json`. This prevents a partial-write from corrupting the manifest if the Pod is killed mid-write.

---

## Fields Not Yet Fully Resolved (Uncertainty Notes)

1. **`custom_node_bundle.nodes[].version`** — the exact versioning scheme for each custom node (git commit SHA vs tagged semver vs package.json version) has not been standardized for the Cubric bundle. The schema uses a generic `version` string, but the comparison rule "set equality on id + version" requires the bundle build pipeline to stamp a deterministic version per node. This must be resolved in the Phase 1 template-distribution decision (`template-distribution.md`) when the bundle build is designed.

2. **`gpu_profile.arch_family` enumeration** — the set of valid arch-family strings is derived from RunPod's published GPU catalog at investigation time (`ampere`, `ada_lovelace`, `turing`, `volta`, `hopper`). New GPU families released after this document was written will need explicit addition to the comparator whitelist in the wrapper; an unrecognized `arch_family` value should default to **Warn**, not Reinitialize, to avoid hard-blocking users on newer GPUs Cubric has not yet validated.

3. **`comfyui_version` format** — ComfyUI does not publish stable semver tags consistently. If the Cubric template pins to a git commit SHA rather than a semver string, the "exact match" comparison is still correct (SHA equality), but the human-readable display in the repair prompt should decode the SHA to a date/branch label where possible.
