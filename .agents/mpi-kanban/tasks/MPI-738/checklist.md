# MPI-738 - checklist

- [x] 1. Gate `modal.confirm` off multi-line editors in `js/managers/hotkeyRegistry.js`
- [x] 2. Test proves the gate - unit gate test + a real-keypress desktop spec, both proven able to fail
- [x] 3. Verified through the real Electron stack (`tests/desktop/notes-enter-newline.spec.js`); the same component serves card notes and project notes
