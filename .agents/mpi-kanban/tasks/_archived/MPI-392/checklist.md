# MPI-392 Checklist

- [x] Delete the temp/tmp mount guard in MpiSettings.js (no server write from a renderer heuristic)
- [x] Log successful POST /comfy/set-path (old root -> new root)
- [x] Pin it with a test + sweep the other _setComfyPath call sites
- [ ] Live check on the next app restart (routes/ is main-process) — see validation.md
