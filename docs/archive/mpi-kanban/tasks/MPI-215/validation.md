# MPI-215 Validation

**Verify mode:** user-ux (self-verified mechanically; awaiting user UX sign-off).

## Self-verification (2026-07-07)

Driven in the running app via a fresh browser page against `http://127.0.0.1:3000/`
(the user's live Electron instance on :3000 was left untouched). Screenshots
captured of the overlay, an open detail drawer, and the Video media filter.

Mechanically confirmed:

- `node --check` passes on all 5 edited files (MpiModelManager.js, shell.js,
  projectUI.js, components.js, types.js).
- ESLint: **0 errors** on MpiModelManager.js + shell.js (pre-existing warnings in
  components.js/projectUI.js are on untouched lines).
- Browser console: **0 errors, 0 warnings** with the Library open + a detail
  drawer open.
- Overlay opens FULL-PAGE (body mode, edge-to-edge, X top-right) — NOT the
  slide-over. Slide-over still reserved for settings/hotkeys/queue.
- Head: "Model Library" title, live count line ("9 installed · 1 available"),
  Media (Image/Video) + Size (Low/Balanced/High) filter tags, search, refresh.
- Split-block grid: Installed then Available; each an Image sub-grid (4:5) then a
  Video sub-grid (16:9); rows aligned; sub-block headers show media icon + count.
- Lean tiles: preview thumb (image still / video), name, `category · tier`, media
  badge, fixed-height inline state row (`✓ Installed` chip; a live partial-progress
  bar seen on LTX High at 33%).
- Media filter (Video) narrows to video sub-blocks only + shows the heat dot on
  the active tag; composes with Size + search.
- Detail drawer (LTX 2.3 arch/video model): description, GPU-weight arch toggles
  (Blackwell / RTX40+older with sizes), VRAM→RAM trade table with the user-GPU row
  highlighted, disk, Uninstall action. Image models omit arch + VRAM blocks.
- Detail closes via its own X (z-index fix confirmed — overlay X no longer steals
  the click).

## Not exercised (needs user / specific hardware)

- A real install/uninstall/download round-trip in the Electron app (browser dev
  mode is not the ship target; install logic reused verbatim from MPI-122/163/
  168/200/209, unchanged).
- Op toggles on an op-selectable model's drawer (Wan) — logic reused, not
  re-clicked this pass.

## Post-UX refinements (round 1, applied + verified live)

After the first look the user flagged 3 issues; all fixed + re-verified in browser:

1. Long model names grew the tile → clamped name to a fixed 2-line height
   (`-webkit-line-clamp` + `min-height`); rows stay aligned for long / future "V2"
   names. NVIDIA PiD Upscaler tile confirmed same height as neighbours.
2. Detail-drawer previews cropped (image → square, video → wrong ratio) → previews
   now size to the asset's TRUE dimensions (no crop): `object-fit:contain`, JS sets
   `aspectRatio` from natural dims on load, `flex:none` + `max-height:46vh`. PONY
   image drawer shows full 4:5; Wan video drawer shows true 16:9.
3. Grid videos too small to judge quality → drawer video now AUTOPLAYS (muted/loop)
   and is CLICKABLE → native `requestFullscreen()` (unmute + native controls in FS;
   Escape exits FS only, drawer stays open; state restored on exit). Grid tiles stay
   HOVER-play, NOT autoplay (user: autoplaying many previews won't scale to hundreds
   of models — the gallery already lags). Fullscreen enter/exit asserted live
   (`fs:true` on click → `fs:false, muted:true, drawerOpen:true` after Escape).

## User sign-off

User confirmed "looks great" (2026-07-07). Card accepted → done/complete.
