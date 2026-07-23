# MPI-279 Validation

## What shipped
The OS floating latent window (MPI-270) used to close the instant a generation
finished (complete → drop tile → last tile gone → window closed). Now it persists,
frozen on the final result, until the user acts.

- `floatLatentBridge.js` — `generation:complete` no longer drops the tile. It resolves
  `item.filePath` → data URL (image results only; video keeps the last latent since a
  video data-URL is too heavy for a thumbnail) and sends `float-latent:finalize`.
  `cancelled`/`error` still drop the tile.
- `main.js` + `floatLatentWindow.cjs` — relay `float-latent:finalize`.
- `float-latent.html` — `finalize` freezes the tile (`done` flag ignores late frames),
  paints the final image, and overlays a centered FINISHED cue: happy mascot
  (`../assets/mascot/happy.png`) + a green "Done" pill badge, pop-in animation, dimmed
  scrim over the latent. Caption becomes "Click to open" + hover outline. This is the
  clear "it's finished" signal (hard to tell otherwise on upscales).
- Close paths unchanged: tile click → restore, X → dismiss, app restore/focus → teardown.
  The window no longer auto-closes on completion; only user action / un-minimize closes it.

## Automated checks — PASSED
- eslint clean: floatLatentBridge.js, floatLatentWindow.cjs, main.js.
- float-latent.html inline script `node --check` OK.

## Needs USER verification (user-ux — desktop only)
Verify mode: user-ux. The float window is Electron-only; can't auto-drive.
- [ ] Start an IMAGE gen, minimize → gen finishes → window STAYS, tile shows the final
      image + centered happy mascot + "Done" badge (pop-in), caption "Click to open".
- [ ] Mascot image actually loads in the float window (relative file:// path resolves).
- [ ] Click the tile → app restores/focuses, window closes.
- [ ] Minimize again, X the window → it dismisses (stays dismissed this minimize cycle).
- [ ] Restore the app the normal way (taskbar) → window tears down.
- [ ] VIDEO/LTX gen finishes while minimized → tile stays showing the last latent (no crash;
      no video in the tile, by design).
- [ ] Multi-gen: two gens running, one finishes → its tile freezes, the other keeps updating;
      window stays until both done + user acts.
