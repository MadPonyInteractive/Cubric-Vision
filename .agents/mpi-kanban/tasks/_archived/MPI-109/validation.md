# MPI-109 — Validation

USER live-verified (2026-06-17, remote Pod, Wan 2.2 I2V Smooth / i2v_ms):

- Gallery, empty PromptBox (no image, no prompt), pressed Cue (Q).
- Result: warning toast **"Add an image before generating — this workflow needs one."**
- NO bug dialog, NO generation dispatched, no remote 503.
- Console warnings present in screenshot are unrelated dev-mode Electron security notices.

Logic self-check (node, `assert`): empty media blocks on startFrame; role match OK; mediaType fallback OK; item with no url blocked; wrong-type-only blocked; no-slot (text-only) op never blocked. All pass.

Reload-only test (renderer JS change); no app restart needed.
