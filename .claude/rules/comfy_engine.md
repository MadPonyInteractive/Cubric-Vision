# ComfyUI Backend & Engine Rules (routes/comfy.js & modelRegistry.js)

> **AI INSTRUCTION:** This file contains rules for interacting with the raw python process, managing model dependencies, and route architecture.

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves the ComfyUI backend, model registry, or Python engine.

**Model registry source of truth:** `js/data/modelRegistry.js` — all generative models (checkpoints, LoRAs, custom nodes) are defined here. Add new models to `MODELS` or `DEPS` here only.

**Install status:** Never hardcode `installed: true` in the registry. `syncModelInstalled()` in modelRegistry hits `GET /comfy/models/check` and sets `installed` dynamically at runtime.

**No direct Python/pip:** All engine management is via `routes/comfy.js` and `routes/shared.js`. Never spawn Python manually.

**New model checklist:** (1) Add to `MODELS` in modelRegistry, (2) check `DEPS` in `modelConstants/dependencies.js` for dependency array, (3) provide `workflows` map with op→workflowFile entries.

See `docs/comfy.md` for the ComfyUI integration overview and `docs/data.md` for the registry structure.

## 🔴 CRITICAL "NEVER FORGET" RULES
1. **Source of Truth:** `js/data/modelRegistry.js` is the single source of truth for ALL generative models. If you need to add a checkpoint, LoRA, or custom node, you add it to the `MODELS` or `DEPS` dictionary here.
2. **Never Hardcode Install Status:** Never hardcode `installed: true` in the registry. Model presence is dynamically resolved at runtime by the backend `GET /comfy/models/check`.
3. **No Direct Python Exec:** Do not attempt to spawn Python or run `pip` manually from arbitrary files. All engine management is strictly handled by `routes/comfy.js` and `routes/shared.js`.

---

## 🛠️ Architecture

### 1. Model Registry
When adding a new model to the application, it requires a dependency array. Check `DEPS` in `modelConstants/dependencies.js` first.
```javascript
// Adding a model to the registry (example)
{
    id: "flux_dev",
    name: "Flux Dev Base",
    mediaType: "image",
    dependencies: ["flux_dev_checkpoint", "custom_node_flux_manager"],
    workflows: {
        "generator": "flux_base_gen.json"
    }
}
```

### 2. ComfyUI Process State
The Node.js backend tracks the active python process in memory (`processState.activeComfyProcess`). 
- Do not add random CLI arguments to the spawn command without checking if they break compatibility with portable installs.
- Any new routes that communicate with ComfyUI's internal API (`/manager/unload_models`, etc.) must account for deep vs. shallow memory cleaning.

### Download Manager Router
See `.claude/rules/downloads.md` for full download system rules (IPC/SSE, ResumableDownloader, job shapes, event lifecycle, engine pause/resume).
