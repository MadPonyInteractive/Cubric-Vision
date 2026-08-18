# MPI-548 validation

## Phase 0 evidence (2026-08-18) — re-diagnosis, PASSED

Read-only, no Pod, no app instance.

1. `lora_missing_remote` is emitted only from `comfyController.js:1642` (a `/prompt` 400
   `value_not_in_list` from the Pod) and `partialValidationError` at `:161-165` (the 200-ack
   `node_errors` carrier). The pre-dispatch `_findMissingModel` has different copy and never
   sets that code. ⇒ the graph reached the Pod.
2. The hot-store toast is behind `engine === 'remote' && workingPayload.forceLocal !== true`
   (`commandExecutor.js:1518`), so its presence pins the frozen engine (`:1267`) to `'remote'`.
3. `NSFW_party_time_v2.0_klein4b.safetensors` = dep `klein-lora-nsfw`
   (`loraDeps.js:502`), baked into `klein_t2i.json` node 38 as
   `"flux2-klein\\NSFW_party_time_v2.0_klein4b.safetensors"`. Never in `state.availableLoras`.
4. Offline bare-Node run (`docs/testing-harnesses.md` § 1):
   `resolveDeps(klein-4b, ['t2i'], null, 'remote', { arch: 'modern' })` → 21 deps,
   `includes('klein-lora-nsfw') === true` (identical for `'local'`).

Conclusion recorded: the original root cause (`state.availableLoras` not engine-derived)
**cannot** produce this toast. Two separate defects, A and B in `brief.md`.

## Phase 1 — facts (2026-08-18)

| fact | source | answer |
|---|---|---|
| toggle icon on the failing gen (cloud = OFF, laptop = ON) | Fabio | **LAPTOP — the override was ON** |
| `loras/flux2-klein/NSFW_party_time_v2.0_klein4b.safetensors` on the Pod volume | `/remote/pod/ls` | not checked; stopped gating once the laptop answer landed → Defect A′ |

## Phase 2 evidence (2026-08-18) — the override fix, PASSED

Automated:

- `npm test` → **629 pass, 0 fail** (16.6s).
- `npx eslint js/services/generationService.js js/components/Organisms/MpiToolOptionsResize/MpiToolOptionsResize.js`
  → clean.

Live, in an isolated instance (`npm run app:isolated` with `CUBRIC_AGENT_PROFILE` set to its
own path — the shared agent profile was held by a peer session — on port 56403; the user's
`:3000` untouched, tree killed afterwards, port confirmed free). Probe reads the Cue
snapshot's `engine`, which `_buildQueueDisplay` derives from the same resolved flag the
dispatch uses. Opts deliberately shaped as `{ scope: 'gallery' }` — byte-identical to the
`preview:finish` site that never passed `forceLocal`:

| case | `state.engineOverride` | `opts.forceLocal` | result | pre-fix |
|---|---|---|---|---|
| override ON, site silent | `'local'` | absent | **`engine: 'local'`** | `'remote'` — the bug |
| override OFF, site silent | `null` | absent | `engine: 'remote'` | unchanged |
| explicit pin (loop re-fire) | `null` | `true` | `engine: 'local'` | unchanged — `??` keeps it authoritative |

Pre-fix column is read off the old line directly: `_buildQueueDisplay` received the raw
`opts`, so `engine: undefined ? 'local' : 'remote'` → `'remote'`, and
`startGeneration` computed `forceLocal: undefined === true` → `false` → frozen engine
`'remote'` → hot-store preflight + Pod rejection. Exactly the two toasts reported.

### Still needs Fabio's eyes (Pod connected) — the card is `validating` on this

1. **Local-only LoRA, "Run locally" ON (laptop icon), Cue** → runs on the local engine. No
   "isn't installed on the remote Pod" toast, and NO "Preparing the cloud engine..." toast.
2. **Continue / Preview finish on a preview card with the toggle ON** → also runs locally.
   This is the path the fix is really about; it was cloud-bound before regardless of the toggle.
3. **The Cue chip reads LOCAL** for a queued Continue while the toggle is ON (it read REMOTE before).

Evidence to capture for cases 1-2: `clientLogger` must NOT contain
`hot-store: N/M file(s) on Pod disk`.

## Phase 2′ — Defect A′ cases (Pod connected, no evidence yet)

4. **Cloud dispatch, Klein t2i, the baked LoRA absent from the volume** → blocked BEFORE
   `/prompt` by the op-not-installed gate (`commandExecutor.js:1375`), naming the
   operation. `lora_missing_remote` reaching the user means the graph already reached
   ComfyUI, which is the residual bug.
5. **A dep installed to the volume mid-session** → the next dispatch sees it without a
   reconnect (the staleness half a connect-edge-only sync fails).

## Phase 3 — Defect B cases (Pod connected)

4. **User LoRA present locally, absent on the Pod, cloud dispatch** → still uploaded from
   local disk and the gen runs (MPI-82 semantics preserved, not regressed into a
   Pod-only check).
5. **User LoRA absent locally, cloud dispatch** → still blocked. "Present locally" is the
   requirement in both modes.
6. **Model Settings dropdown reflects the effective engine** — flipping "Run locally"
   re-derives the option list and the "missing" styling, same as it already re-derives
   install state.
7. **Subfolder LoRA, Windows local dispatch** → still resolves (separator regression,
   `routes/comfy.js:999-1001` + `comfyController.js:92-95`).
8. **Empty asset list** → `_findMissingModel` still fails OPEN, and the
   `lora_missing_local` backstop (`commandExecutor.js:2184`) still catches it at the loader.
9. `node --test "tests/*.test.cjs"` green.

Evidence to capture for case 1: `clientLogger` must show the op gate blocking, and
`hot-store: N/M file(s) on Pod disk` must NOT appear for a dispatch that was blocked.
