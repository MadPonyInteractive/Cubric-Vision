# MPI-263 — Validation

## Static (done)
- `node --check` passed on all 3 edited JS files.
- Diff confirmed: my hunks only; peer RemoveBg hunks (MPI-260/264) excluded from commit `7230d1e2`.
- Screenshot from user shows the 3-button dialog rendering correctly (Cancel / Prompt Box / App), all same color, one row after label shortening.

## Behavioral (OPEN — needs real app card)
- [ ] App card + **Prompt Box** → prompt/images inject into PromptBox, app NOT opened, checkboxes honored.
- [ ] App card + **App** → reopens app with restored inputs (today's behavior).
- [ ] Non-app card → single **Apply**, unchanged.
- [ ] Quick reuse (`promptReuseOptions.ask === false`) on app card → app opens (no regression).
- [ ] Same four in the Gallery reuse path (MpiGalleryBlock).

User confirmed the visual (button labels/layout) live. Functional click-through
pending a real app-generated history card.
