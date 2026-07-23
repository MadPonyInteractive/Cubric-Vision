# MPI-256 research — Agent F: sidecar (.meta) schema + appId/appInputs feasibility

## Sidecar shape + write path
- Fields today (routes/projects.js:1774-1819, hand-built object literal — only explicitly placed fields land): id, type, filePath, operation, displayName, prompt, negativePrompt, seed, modelId, generationSettings, createdAt, name, uploaded, pixelDimensions, generationMs. Video adds fps/duration/frameCount/hasAudio/thumbPath. Preview adds stage/frozenParams/loraSnapshot/previewAssets.
- Route `POST /project/save-generation` (routes/projects.js:1609); write `fs.writeJson(metaPath, ...)` :1819.
- Client wrapper `projectService.js:484 saveGeneration()` — explicit destructure + explicit JSON.stringify repack (:488). Extra props silently dropped. Server destructures req.body :1611 — extra fields ignored.
- meta assembled generationService.js:970-971 `{prompt, negativePrompt, modelId, seed, generationSettings}`; generationSettings built :804-867 `{operation, modelId, injectionParams, mediaItems, previewOnly, controlState?}`.

## appId + appInputs = 4-site plumb (NO server bypass)
1. generationService.js:960 call site — pass appId/appInputs.
2. projectService.js:484 signature + :488 body pack.
3. routes/projects.js:1611 destructure.
4. routes/projects.js:1774-1818 metaContent placement (top-level).
(Alternative — nest under generationSettings, passes through as-is — REJECTED: pollutes reuse snapshot. Top-level clean.)

## Read path / round-trip
- projectReconciler.js:31 reconcileAndHydrate → _fetchMeta :118 → GET /load-meta returns RAW sidecar JSON, whole blob to memory (:66). **Unknown fields survive round-trips** — persistGroups (projectService.js:441-478) writes project.json only, never sidecars. Sidecar rewrites only: save-generation (overwrite), update-meta (spread-merge {...prev,...updates} :1247 — preserves), add-from-cards (clone+patch), preview→final replace.

## Versioning
- SCHEMA_VERSION=4 (appVersion.js:19) = project.json structure ONLY. Sidecars have NO version stamp. Additive optional sidecar fields = NO bump, NO migration. undefined appId = "not app-generated", natural fallback.
- **Parity rule (docs/project-integrity.md:151):** adding a sidecar field ⇒ update (a) createImageItem/createVideoItem defaults (projectModel.js — factories spread ...overrides so flows already, but explicit null defaults expected), (b) fresh-item construction sites, (c) EVERY sidecar-writing route (save-generation, crop-media, upload), (d) projectReconciler._constructSyntheticItem.

## Reuse fields read today (js/utils/promptReuse.js)
- Primary: item.generationSettings (:95) → .operation/.modelId/.injectionParams/.mediaItems/.controlState. Fallback: item.frozenParams (:98) → .injectionParams/.mediaItems. Top-level: prompt, negativePrompt, modelId, operation, ratioLabel, pixelDimensions, seed, previewAssets, stage.

## Risks
- R1: `appId` name collides w/ electron-builder appId in reviewers' heads (not runtime) — consider `generatingAppId`; or keep appId (user's term) + comment.
- R2: parity = crop-media + upload + _constructSyntheticItem must set appId:null consistently.
- R4: appInputs must stay SMALL — no base64; media references should use the MPI-227 content-addressed preview-assets store pattern (by-reference), else add-from-cards copies break refs.
- R6: add-from-cards clone (routes/projects.js:1978-1981) patches id/filePath/createdAt/type/displayName/thumbPath only — appId/appInputs survive copy automatically. Decide: copied app item keeps appId (probably yes — reuse still works if inputs refs valid).
