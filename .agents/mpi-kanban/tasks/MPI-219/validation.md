# MPI-219 — Validation

## Live-verified 2026-07-08 (user-confirmed, LOCAL engine, Windows)

All THREE bugs from one repro, fixed + verified:

1. **Injection** — LoRA selected on Chroma → gen SUCCEEDED, LoRA applied at
   correct strength (0.75). Was: 400 `Value not in list: lora_name: {dict}`.
   Fix: `comfyController.js` regex `^(?:Input_)?Lora_...`. Guard test
   `tests/lora-injection-routing.test.cjs` — 3/3 pass.

2. **Mid-session folder reload** — remove folder → close → open → add folder
   mid-session → generate → PASSED (no restart). Log confirms
   `extra-folders: engine reloaded extra model paths (no restart)` +
   `[MpiNodes] reloaded extra model paths`. Boot-race (ECONNREFUSED during
   ComfyUI boot) covered by `reloadExtraPathsWhenReady` retry. MpiNodes route
   live-tested via direct curl (list 8→26, Sofia present after reload).

3. **LoRA slot empty on reopen** — restart app → straight into settings →
   LoRA + strength correct. Was a FACET of bug #2 (stale availableLoras), not a
   save bug (disk always saved correctly).

## Shipped
- MpiNodes v1.1.4 — GitHub `2d409b5` + Comfy registry (workflow success).
- `dev_configs/node_lock.json` MpiNodes commit bumped 780c7c3 → 2d409b5.
- Remote/Pod twin: structurally immune (verified by analysis) — no remote code.
