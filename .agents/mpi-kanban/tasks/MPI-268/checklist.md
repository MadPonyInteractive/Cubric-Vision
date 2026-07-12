# MPI-268 Checklist

- [x] Add `to_gif_stroke` clapperboard SVG icon to `js/utils/icons.js`
- [x] Backend: `POST /api/video/gif` route (2-pass palette, trim, scale, loop) + registered in server.js — **harness-verified: real GIF89a, byteSize match, all size presets + trim + 400/404 paths PASS**
- [x] Organism: `MpiToolOptionsGif` (fps, size dropdown, loop, preview btn + size badge, Export btn)
- [x] Register CSS in `js/shell/preloadStyles.js` + props in `js/components/types.js`
- [x] Wire `exportGif` into `VIDEO_TOOLS` + `TOOL_OPTIONS_REGISTRY` + `TOOL_LABELS`; encoder injection + `_encodeGif`/`_handleGifExport` (fetch → `<a download>`)
- [ ] User live-verify in Electron: preview encodes, badge shows real size, Export opens Save-As, GIF plays
