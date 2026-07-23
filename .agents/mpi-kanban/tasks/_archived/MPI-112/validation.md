# MPI-112 — Validation

User-verified live on RTX 5090 remote, 2026-06-18.

## Root cause

Extend's final history item is built from the `/extend-video` server sidecar,
which discarded the i2v generation's reuse metadata (no `generationSettings`,
no start-frame snapshot). Both reported bugs + the double-toast + the 0s timing
traced to this.

## Bugs + fixes

| # | Symptom | Fix |
|---|---|---|
| 1 | "No saved frame images" on extend reuse | extend sends `generationSettings` to `/extend-video`; server materializes start-frame snapshot under the extended item's `.preview-assets/<id>/` + persists `generationSettings`; `extendedItem` carries both. `_opAcceptsImageInput` also checks `generationSettings.operation` so extend (video-only op) surfaces the image. |
| 2 | Duration drift (5s→3s→21s) | `buildPromptReuseSettings` reads only the saved `Duration` param — dropped the `?? item.duration ?? videoMeta.duration` fallback (was the 21s combined extend length). Ratio fixed automatically via saved `injectionParams`. |
| 3 | Two toasts on extend | concat sub-step is silent (`silentComplete`) and no longer touches `StatusBar.progress`. |
| 4 | Toast "0s" | concat's `progress.start()` was resetting the gen timer before the gen's completion toast read it. Silent concat no longer drives the bar. |
| 5 | First toast swallowed on back-to-back queue | completion toast fires immediately, not inside the supersession-token-gated 400ms defer. |
| 6 | Create New broken (since v1) | now = Extend minus concat; shared `_captureLastFrameMedia`; both ALWAYS seed from the current clip's last frame (strip stale/reused startFrame → no snap). |
| 7 | Misleading status-bar info | "Extend video from last frame" / "Create video from last frame". |
| 8 | Reuse settings lag until nav | `el.refreshControls()` re-mounts controls after `applyPromptReuseSettings` (settings were written after controls mounted → stale). |

## Verified behaviors (user)

- Extend → ONE toast, real generation time (not 0s).
- Reuse Prompt on extend → start-frame image loads, duration = gen-time seconds (not 21s).
- Create New → standalone video from current clip's last frame, no snap, one toast.
- Queued create-new → extend → two toasts, each its own job.
- Reuse settings reflect live in the PromptBox.

## Scoped out (separate cards)

- **MPI-113** — inline Stop in history mode + prompt draft persistence across nav.
- **MPI-115** — sidecar schema redesign: field duplication (ratioLabel ×2,
  videoMeta dups top-level, media tripled, empty `operations`) + contradictory
  quality sources (`ratioSelector.qualityTier` vs injected W×H). Investigate
  first, migrate, patch master too (no users yet).

## Files

See files.json.
