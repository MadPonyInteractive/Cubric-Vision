# MPI-151 — Fix: Video workspace fullscreen button targets wrong element

## Root cause

`MpiVideoControlBar.js` line 321 calls `el.requestFullscreen()` where `el` is the
control-bar's own root `<div class="mpi-video-control-bar">` — the transport/trim
wrapper — not the `<video>` element itself. The control bar has a reference to its
attached `MpiVideoSurface` instance via `_surface` and can reach the raw `<video>`
through `_surface.getVideoElement()`, but the click handler never uses it. The
correct target is the `<video>` element returned by that call.

There is no shared fullscreen utility between image and video workspaces.
The image path (`focusModeService._enterVideoFullscreenIfPresent`) already
correctly targets the `<video>` element and is unaffected by this fix.

## Fix

**File: `js/components/Compounds/MpiVideoControlBar/MpiVideoControlBar.js`**

1. **Replace the `fsBtn` click handler** (lines 318–323). Current code:

   ```js
   fsBtn.on('click', async () => {
       try {
           if (document.fullscreenElement) await document.exitFullscreen();
           else                            await el.requestFullscreen();
       } catch (err) { console.error('Fullscreen request failed:', err); }
   });
   ```

   New code — guard on `_surface`, get the `<video>`, fullscreen it:

   ```js
   fsBtn.on('click', async () => {
       try {
           if (document.fullscreenElement) {
               await document.exitFullscreen();
           } else {
               const videoEl = _surface ? _surface.getVideoElement() : null;
               if (videoEl) await videoEl.requestFullscreen();
           }
       } catch (err) { console.error('Fullscreen request failed:', err); }
   });
   ```

   No other files need to change. The `<video>` element already has
   `object-fit: contain` and `width/height: 100%` in
   `MpiVideoSurface.css`, so it will fill the screen correctly once it
   is the fullscreen element. No `:fullscreen` CSS rules exist in the
   codebase that need updating.

## Risk / verify

**Manual verification:**
1. Open the video workspace (Group History with a video card selected).
2. Click the fullscreen button in the control bar.
3. Expected: the raw video fills the entire screen with letterboxing/pillarboxing
   per `object-fit: contain`; no player chrome is visible.
4. Press Escape or click the button again — expected: returns to normal view.
5. Also test the `F` focus-mode hotkey path (uses `focusModeService`) — should
   still fullscreen the `<video>` element as before (that path is untouched).

**Image workspace risk:** None. The image workspace has no `<video>` element, so
`focusModeService._enterVideoFullscreenIfPresent` returns early and falls back to
the CSS chrome-hide path. `MpiVideoControlBar` is not mounted in the image workspace.
