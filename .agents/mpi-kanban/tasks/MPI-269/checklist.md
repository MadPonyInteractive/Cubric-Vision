# MPI-269 checklist

## P1 — Ingest tagging + attribution ✅ (comfyController.js)
- [x] `_engine` + `_previewSeq` instance state
- [x] `_engine` resolved at connect() from wsUrl (local vs remote proxy WSS)
- [x] Stamp `engine`/`promptId`/`seq` on every binary preview in `_routeMessage`
- [x] `execution_start` now updates `_activePromptId` (closes cross-gen race #1)
- [x] LOG-VERIFIED: 15/15 frames one promptId across SDXL→PiD stage boundary, engine=local, zero cross-gen (match=true every frame)

## Broken-frame gate ✅ (comfyController.js `_stripPreviewHeader`)
- [x] GENERAL rule (not a marker special-case): a frame is a preview image iff it declares ComfyUI event type 1 (PREVIEW_IMAGE) OR carries a JPEG SOI with >1KB payload. Everything else → null → skipped.
- [x] LOG-VERIFIED: real latents (SDXL + PiD) = eventType 1; the 93-byte stage marker = eventType 3, no SOI → skipped. No broken <img> emitted.
- [x] Widened to accept nonstandard-header images (VHS/LTX MPI-166) via the SOI+size fallback, so LTX previews are NOT killed by a strict type==1 gate.
- [ ] **LTX/VHS live-confirm still pending** — LTX slow to run; the SOI+size fallback makes it safe-by-default. Flag for other session / next LTX run.

## P2 — preview:frame event + last-latent hold ✅
- [x] comfyController emits `Events.emit('preview:frame', {engine, promptId, seq, url})` — both engines
- [x] activeGenerations: `byPromptId(promptId)`, `getLastPreview(genId)`
- [x] Bus listener records last-good latent per gen (survives multi-second frame gaps), cleared on end()
- [x] Unresolved promptId → dropped, never falls back to active gen
- [x] Legacy `generation:preview` path UNTOUCHED (additive) — consumers migrate later
- [x] BOTH onmessage closures (reuse-path + fresh-path) honor the null-skip. BUG CAUGHT IN REVIEW: first fix updated only one closure (quote-style differed) → fresh-path wrapped null into a blob → broken frame on seq jump 9→11. User's skepticism surfaced it; now both fixed.
- [x] USER-VERIFIED (in-app SDXL-4K): latents resume cleanly across SDXL→PiD transition, marker skipped, no broken image, last latent held. (4K final-image flash is pre-existing, out of scope.)

## Docs ✅
- [x] docs/preview-bus.md written (event contract, gate, last-latent hold, per-document/IPC gotcha, both-closure note) + routed in docs/README.md

## Follow-up cards ✅
- [x] MPI-270 (todo) — OS floating latent window when minimized, settings-gated; consumer of this bus

## P4 — Migrate consumers (NEXT SESSION, separate)
- [ ] Gallery card + MpiBaseApp pane subscribe `preview:frame`, use `getLastPreview(genId)` on mount/repaint
- [ ] Retire legacy `generation:preview` shim once migrated (P5)
- [ ] See handoffs/ for the contract

## Verify mode: user-ux — bus proven via debug viewer; final app-pane UX is P4 (other session)
