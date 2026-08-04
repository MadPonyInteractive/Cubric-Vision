# MPI-308 — `image_descriptor`: caption the current image into the prompt box

**Filed:** 2026-07-18. Branch `1.2.0`. Every code anchor below was read in-source this session — line numbers are current as of filing but **verify before relying on them** (concurrent sessions edit these files; match by content anchor, not line number).

---

## 1. Why

Creative upscalers need a **faithful description of the actual pixels**. Today a user writes a thin prompt ("cat in a hat"), the model hallucinates rich detail the prompt never described, the user *likes* the result — then re-uses the **original thin prompt** on the upscale pass. The upscaler gets no information about what is actually in the image, and the result is mediocre.

Fix: caption the **generated result**, upscale with that.

Same argument applies harder to **Apps**, which are more automated — there is no user in the loop to write a better prompt.

**This card is a dev-gated test harness, not the product surface.** The point is to run real generations and judge whether caption→upscale actually improves output. If it does, the shipped surface is a button on the prompt box next to the positive/negative toggle — a separate card, not this one.

---

## 2. What already exists (do not rebuild)

### 2a. The workflow — authored, on disk
`comfy_workflows/raw/image_descriptor.json` (raw/ = user-owned LiteGraph source; scripts READ raw and WRITE `comfy_workflows/` — see memory `feedback_raw_workflows_user_owned`).

Graph shape:
```
Input_Image (MpiNodes path→string, block_if_empty: true)
  → Scale Image to Total Pixels (1.00 MP, nearest-exact)
  → Generate Text  ← clip from Load CLIP (qwen3vl_4b_fp8_scaled, type krea2)
                   ← prompt from Text String (System Prompt)
  → Output_prompt (PreviewAny)
```
`Generate Text` settings baked in: **temperature 0.2**, `max_length` 512, `thinking: false`, `top_k` 64, `top_p` 0.95.

**Not yet converted** raw → API/runtime. Needs `scripts/workflow-to-api.mjs` / `sync-raw-workflows.mjs` (memory `tool_litegraph_to_api_converter`). ⚠️ Do NOT run `orchestrate.py` on a dirty `comfy_workflows/` tree — it rebuilds ALL templates and overwrites uncommitted runtime files (memory `feedback_orchestrate_global_rebuild_hazard`).

### 2b. Text output capture — SOLVED, general contract (MPI-242)
- `js/services/commandExecutor.js:1347` — collects node ids whose `_meta.title.toLowerCase() === 'output_prompt'`. Comment at :1346 states explicitly **"GENERAL CONTRACT, not a Krea2 special case"**.
- `js/utils/comfyOutputUrls.js:51` `readComfyOutputText()` — reads `PreviewAny`'s `{ui:{text:[str]}}` off the `executed` message. Returns trimmed string or null.
- `js/services/commandExecutor.js:1768` — assigns `promptTextOutput`.
- `js/services/commandExecutor.js:1612` — delivers it: `onComplete(outputUrls, { latents, audioUrl, promptText })`.

**`image_descriptor` already satisfies this contract** by naming its output node `Output_prompt`. No new capture code needed.

### 2c. The model — already loaded, no download
`Generate Text` uses `qwen3vl_4b_fp8_scaled.safetensors` — **the same text encoder Krea2 already loads** (`G:/CubricModels/text_encoders/`, 5.24GB). fp8_scaled IS the quantized form (E4M3 per-tensor, hardware-native on Ada). Zero extra download, zero new dependency, works on every platform ComfyUI does.

Rejected alternatives (do not re-litigate — all evaluated 2026-07-18):
- **JoyCaption via llama.cpp** — validated and works, but needs per-platform native binaries; 3 distinct fault classes hit in one session. Full research record: **Cubric-Prompt MPI-12** (`c:\AI\Mpi\Cubric-Prompt\.agents\mpi-kanban\tasks\MPI-12\brief.md`). Weights deleted.
- **Florence-2** — ruled out on user's production experience: fast, poor quality in some cases.
- **MXFP8** (Blackwell-favoured), **NVFP4** (fragile in practice), **GGUF Qwen-VL** (reintroduces a custom node), **abliterated/Heretic builds** (stock already described explicit NSFW accurately — user-verified).

---

## 3. ⚠️ THE BLOCKER — text-only workflows have no completion path

**Verified in source, not assumed.**

`js/services/generationService.js:769`:
```js
const positive = outputInfo.promptText || _positiveFromBox;   // :767 — caption arrives HERE

if (!urls.length) {
    // ... warn unless cancelling ...
    Events.emit('tool:cancelled', { tool: 'groupHistory', id: _regId });
    activeGenerations.end(_regId, { revokePreview: true });
    Events.emit('generation:cancelled', { id: _regId, ... });
    _emitPromptBoxGenerationEndIfIdle();
    callbacks.onCancel?.();
    return;                                                    // ← caption discarded
}
```

`image_descriptor` returns **text only — zero media URLs**. So a successful caption run is currently treated as a **cancelled generation**: cancel events fire, the activity ends, and `promptText` (read one line above) is thrown away.

Every existing op returns images or video. This is the first text-only op.

**THE ROOT-CAUSE RULE applies.** Adding `if (isCaptionOp) skip` at :769 is the symptom patch and will be rejected. The structural fix is an **op-level declaration** that a workflow returns text rather than media, so the completion path branches on a declared contract instead of on an empty array. Sweep every consumer of that declaration in one pass.

Note `:767`'s existing use of `promptText` is "record what the encoder saw" for Reuse Prompt — **a different concern**. Do not overload it for captioning.

---

## 4. Implementation sketch (not yet designed — the §3 decision comes first)

1. **Op + descriptor** for `image_descriptor` (universal op, no model tier). Follow `docs/playbooks/add-app/` shape; media role = one image in, per memory `project_media_roles_agnostic_op_fit_by_count`.
2. **Text-only completion contract** (§3) — the real work.
3. **Dev radial action** — resolve the current/selected image path, inject into `Input_Image` (path→string, per memory `feedback_media_injection_path_to_string`; note the load-node linked-string placeholder trap, memory `project_load_node_linked_string_placeholder_slot`).
4. **Write caption into the prompt box** — user pointed at `docs/data.md` (Reuse section) and the reuse system as the precedent for setting prompt text. `js/components/Organisms/MpiPromptBox/PromptBoxControls.js:1218` documents the `Output_prompt` relationship.
5. **Test in-app**: generate → caption → upscale with the caption → compare against upscaling with the original thin prompt. **That comparison is the entire point of the card.**

---

## 5. Measured facts (carry forward, don't re-measure)

- **Input resolution barely affects speed.** 479×512 crop = 18.9s vs full 1500×1500 = 21s. VLMs resize to a fixed grid; cost is *token generation*, not pixels. **Do not crop or downscale for speed** — it costs content and buys ~nothing. (The workflow's `Scale Image to Total Pixels` at 1MP is fine as a normaliser, not a speed trick.)
- **Temperature is decisive.** At 0.7 the caption was thin (tower + sky only). At **0.2** it became dense and upscale-grade: subject placement, sun direction, foreground paving, lampposts, landscaping, a red bus, distant cityscape, camera elevation. Use 0.1–0.3.
- **The prompt-enhancer system prompt is WRONG here** — it instructs the model to invent detail, the exact failure this feature exists to fix. The describe-only system prompt is already baked into the workflow's Text String node.
- **~21s per caption** on an RTX 4060 Ti. Trivial next to an upscale pass.
- **NSFW handled accurately** by stock Qwen3-VL 4B (user-verified on an explicit image).
- Model-swap cost is real but sits **inside** Comfy's own manager (log showed `Krea2TEModel_` 4999MB loading after QwenImage unloaded), not fighting it from outside.

---

## 6. Open questions

1. **Does caption→upscale actually improve results?** The claim the whole feature rests on. Still unproven — this card exists to answer it.
2. **Is a VL-capable CLIP always available?** The test used the Krea2 TE (`type: krea2`). For non-Krea2 workflows you would load 5.24GB *purely* to caption, which puts VRAM contention back on the table. Decides whether this is universal or Krea2-family-only.
3. **4B vs 8B** — both on disk (`qwen3vl_8b_fp8_scaled` = 10.6GB). 4B was good at temp 0.2; worth one comparison on a hard image before baking 4B into an operation.
4. **Where does the caption land?** Auto-fill the prompt box, or offer as a suggestion the user accepts/edits? (Dev harness can just overwrite; the product surface needs a real answer.)
5. **Apps integration** — Apps are more automated and arguably benefit more. Out of scope here, but the op should not be shaped in a way that blocks it.
