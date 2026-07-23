# MPI-111 live repro findings (2026-06-18, debug ON, Pod L4)

Two Stop-at-completion repros captured (03:34, 03:38). Debug flag MPI_DEBUG_BUGB=1.
TEMP-DEBUG-111 markers in logs/app.log.

## Confirmed event sequence (03:34 cancel — cleanest)

```
2488  setGenerating id=30e58a01 hasBlob=false        placeholder for the running job (tempId)
2548  STOP pressed targetId=a5830d4d tempId=30e58a01
2549  cancelled-handler id=a5830d4d tempId=30e58a01  _rebuildAfterEnd: removeCard(30e58a01) + _myGenIds.delete(a5830d4d)
2554  setGenerating id=6ed38abf hasBlob=false        NEXT queued placeholder promotes into the freed slot
2564  [generationService] "Generation completed but no output returned."   ← interrupt → empty urls
2615  SWALLOWED cancelled id=a5830d4d tempId=null    2nd cancelled, tempId=null → early-returned
2619  setGenerating id=6ed38abf hasBlob=false
```

03:38 cancel identical (id=20543511, tempId=cac5a11d, then SWALLOWED tempId=null + "no output returned").

## Root cause: DOUBLE generation:cancelled, second one neutered

1. Stop → `activeGenerations.cancel(id)` (activeGenerations.js:106) emits cancelled WITH the
   real tempId AND **ends the entry** (`end()` deletes it from `_registry`).
2. The engine interrupt makes ComfyUI return an empty result → `exec.onComplete([])` hits the
   `if (!urls.length)` branch (generationService.js:583-593). It reads
   `activeGenerations.get(_regId)` — **already null** (ended in step 1) — so
   `_cancelTempId = entry?.tempId ?? null` → **null**, then emits a SECOND
   `generation:cancelled {tempId:null}`.
3. Block's cancelled handler (MpiGalleryBlock:1260) early-returns on `!_myGenIds.has(id)`
   (deleted in step 1) → the second event is SWALLOWED. "no output returned" appears 8× in
   the session — every Stop-at-completion takes this path.

## KEY signal: refresh=true count = ZERO across the WHOLE session

Across 260 FRESH + thousands of REUSE cardEntry logs, **`refresh=true` never appears once**.
`_getCardEntry` only calls `card.el.refreshGroup()` (which re-runs `_render` →
`_clearPreviewImage` + `_swapThumbToImage`) when `_getGroupRenderKey` changes on a REUSED
entry. It never changes here → a reused card is NEVER re-rendered. Whatever a card last
painted, it keeps. This is why a stale/wrong card is sticky: the only paths that repaint a
reused card are (a) renderKey change → never happens, or (b) a FRESH card (new id) →
happens only for brand-new groups, or (c) opening that card's OWN history (remounts → FRESH).

## hasBlob almost always false

Only ONE `hasBlob=true` in the session (3262), unrelated to a cancel. So in THIS repro the
stale visual was NOT a latent blob — it was a wrong/distorted SAVED image (user saw squished
landscape thumbs from a Reuse-on-landscape run). Brief's "latent blob OR prior final image"
— this run hit the prior-final-image / wrong-aspect variant.

## Two distinct bugs

- **Bug A (core stale/distorted thumb):** reused cards never get refresh=true; a card can end
  up showing wrong pixels (wrong image and/or wrong aspect ratio) with no self-heal. Need to
  find WHY a reused `_cardMap` entry (keyed by group.id) shows another group's image —
  candidate: the justified-layout reshuffle after the Stop reorders DOM but a card's `<img>`
  wasn't repainted, OR `_aspectRatioCache`/`_stabilizedIds` keyed wrong. NEEDS the distorted
  card's group.id to pin.
- **Bug B (timer never stops):** status-bar gen timer keeps running after Stop-at-completion.
  The swallowed 2nd cancelled (tempId=null) likely drops a promptbox-generation-end / lane
  settle. Separate from the thumbnail but same race.

## Next

Get the distorted card's filename/id from the user → grep its id in app.log → see whether it
was FRESH-then-stuck or REUSE-no-refresh, and whether a different group's file was painted on
it. THEN design fix (likely: (1) make the empty-output cancel branch read tempId BEFORE
end(), or skip re-emit if already ended; (2) ensure the Stopped slot forces a refresh; (3)
fix the renderKey so a reused card whose displayed image != selected file re-renders).
