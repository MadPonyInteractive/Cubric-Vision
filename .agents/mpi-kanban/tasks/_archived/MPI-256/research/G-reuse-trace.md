# MPI-256 research — Agent G: Reuse flow trace (for appId branch)

## Controls
- Gallery card: MpiGalleryGrid.js:444-453 reuse MpiButton → emits 'reuse' w/ `buildGalleryPromptReusePayloads(group)` (bundle {current, original, group}). Visibility :972 `itemHasReusablePrompt(selected) || findOriginalReusableItem(group)`. No context-menu reuse.
- History item: MpiHistoryList.js:174-185, gated `itemHasReusablePrompt(item)` → emits 'reuse' w/ `buildPromptReusePayload(item)` (single payload).

## Flow
- Gallery: grid.on('reuse') MpiGalleryBlock.js:375 → `_handlePromptReuse(bundle)` :1054 → (ask dialog MpiReusePromptDialog | direct) → `_resolveReusePayload` picks current/original by state.promptReuseSource → `_applyPromptReuse(payload, includes)` :1090-1204.
- History: historyList.on('reuse') MpiGroupHistoryBlock.js:1381 → `_handlePromptReuse` :924 → `_applyPromptReuse` :948-1037.
- `_applyPromptReuse` sequence (Gallery lines): setSelectedModelId :1126 → settings:model:select :1127 → pb.setModel :1128 → activeOperation :1130 → pb.setOperation :1131 → injectPrompts :1134 → clearMedia :1147 → resolvePromptReuseMediaItems :1148 → injectMedia loop :1174 → applyPromptReuseSettings :1180 → refreshControls :1189 → **MPI-247 setOperation re-assert :1199**.
- Payload builder promptReuse.js: source = item.generationSettings (:95, fallback frozenParams :98); payload.generationSettings = _clone(source) :154; **payload.item = item :155** (raw item always present). controlState fast-path replay (MPI-115).

## Sidecar availability at reuse time
- Full sidecar in memory from project open: projectReconciler.js:31 → GET /load-meta (routes/projects.js:2165) → whole parsed JSON pushed :66. No on-demand fetch at reuse. Fresh gens: save-generation response carries full generationSettings (routes/projects.js:1920); gallery:item-updated carries full group.

## THE BRANCH POINT
- Insert at TOP of `_applyPromptReuse`, after `_reuseIncludes(includes)` parse, BEFORE any mutation:
  - MpiGalleryBlock.js ~:1093 (before setSelectedModelId :1126)
  - MpiGroupHistoryBlock.js ~:948-950 (**must be BEFORE `_mountPromptBoxIfNeeded({force:true})` :978**)
- `if (payload.item?.appId) { availability-check → open App overlay w/ payload.item.appInputs; return; }`
- Precedent for per-item routing gate: `itemHasReusablePrompt` hard-exits on `item.uploaded === true` (promptReuse.js:207). appId branch = same early-guard pattern, first to exit the PromptBox path entirely.
- Dialog (ask===true) path also funnels into _applyPromptReuse — branch covers it free.

## DECISION RESOLVED (F vs G tension): appId + appInputs = TOP-LEVEL sidecar fields
- F recommended top-level (nesting pollutes generationSettings reuse snapshot). G noted builder reads generationSettings — but `payload.item` (raw item) is always present at the branch, so top-level `payload.item.appId` is accessible. Canonical: **top-level** `appId` + `appInputs`; branch reads `payload.item?.appId`. generationSettings stays app-agnostic.

## Risks for the plan
1. Branch needed in BOTH blocks (`_applyPromptReuse` duplicated Gallery + GroupHistory).
2. Verify nothing strips `payload.item` en route (currently intact).
3. `itemHasReusablePrompt` must return true for app items (they'll have prompt/modelId only if the app sets them) — extend: `|| !!item.appId` so the Reuse button renders on app cards.
4. Gallery bundle current/original: branch fires on the RESOLVED payload — correct; mixed groups behave per-item.
5. `appInputs` schema = part of MPI-256 design (BaseApp input snapshot); keep small, media by reference (MPI-227 store) per F-R4.
