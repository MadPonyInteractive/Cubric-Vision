# MPI-650 checklist

- [x] Fix `name` on `ComfyUI-Frame-Interpolation` (nodesDeps.js:112) -> `ComfyUI Frame Interpolation`
- [x] Sweep every entry's `name` against its `id`/`filename` for the same clone slip - 17 parsed, 0 mismatches
- [x] `npm test` - 773/773
- [x] `npm run release:check` - red on MPI-649's engine pin only, not this card (see validation.md)
- [x] `validate_board.py .` exit 0
