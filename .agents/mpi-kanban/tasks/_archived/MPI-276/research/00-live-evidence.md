# Live evidence — 2026-07-13 session that triggered this card

User flow: uninstalled `boogu-edit-high` (20:05:35) → uninstalled `wan-22` t2v (20:06:50) → clicked install on SDXL Realistic, ILL Anime Beauty, LTX 2.3 (balanced), Wan 2.2 5B.

**Backend log (`logs/app.log`):** ZERO `[download] Starting download` lines after 20:06:50. No verify entries. No aria2/NDH partials on disk (`G:/CubricModels` had no `.aria2`/`.cubricdl` for the target models). Last real download activity 15:50 (Wan t2v).

**UI meanwhile showed:** SDXL Realistic "Verifying…", ILL Anime Beauty "100%", Wan 2.2 5B "36%", LTX 2.3 "0%" — phantom progress with no backend job behind any of them. Later screenshot: LTX eventually started for real (19% live) while the untouched phantoms ("Verifying…", "100%") persisted beside it.

**Console:** ~997 errors — same revoked blob URL re-requested in a loop, `net::ERR_FILE_NOT_FOUND` (carded separately as MPI-277, media/preview subsystem, NOT downloads).

**Also that afternoon (remote side):** 18:49–19:08 burst of remote uninstalls (wan-22, boogu-edit-balanced, krea2-turbo, krea2-turbo-nsfw, ill-anime-beauty ×3, ill-anime) while a Pod was connected — heavy churn immediately before the local phantoms appeared.

These symptoms map directly to the mechanisms in `03-frontend-ui.md` (§4 A/B/C/E) and `01-local-backend.md` (§3, §9).
