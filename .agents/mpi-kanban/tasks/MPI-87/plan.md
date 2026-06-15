# MPI-87 Plan — connect-progress % in the project-page GPU slot

## Investigation verdict (DONE, item 1)

RunPod public API does **NOT** expose image-pull / layer-extract %. Verdict (B) CONSOLE-ONLY.
Checked REST `GET /pods/:id` + GraphQL `pod{runtime}` full field lists, runpod-python SDK,
runpodctl, SkyPilot. Console "1/14 layers · 40.48%" rides RunPod's internal infra websocket,
not the public REST/GraphQL API. A real layer % is unreachable (and the wrapper that could
report it lives *inside* the image, which only exists *after* the pull → physically can't
report its own image's pull).

## Decision (user, 2026-06-15)

- **% source:** elapsed-estimate. Not a real layer %. `pct = clamp(round((now-start)/EST*100), 0, 99)`,
  hold 99% until `/health` ready, then 100%. Honest moving estimate.
- **Surface:** the project-page hero **GPU slot `#heroStatGpu`** shows a bare number like `29%`
  during the connecting phase. The footer line `#heroStatEngine` keeps `connecting · offline`
  (already says "connecting", so the number stays a bare `29%` — no duplicate word).
- On ready → GPU slot reverts to the normal GPU card (`RTX … · VRAM · RAM`). On fail/timeout →
  normal connecting-resolved paths unchanged.

## Mechanism

1. **New event** `remote:connect-progress` with payload `{ pct }`. Lightweight, connect-only.
2. **Emit from both poll loops** (the only place that knows elapsed time):
   - `js/shell.js` `_pollRemoteReady` (boot auto-connect path) — has `start`/`timeoutMs`; emit each 4s tick.
   - `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js` `_pollEngineReady` (manual connect) — same.
   - Both already compute `Date.now() - start`. Add `pct` calc + `Events.emit('remote:connect-progress',{pct})`.
   - On loop exit ready → emit `{pct:100}` right before the connected emit.
3. **Render** in `js/shell/heroStats.js`: subscribe to `remote:connect-progress`; paint
   `#heroStatGpu.textContent = pct + '%'` ONLY while `_remotePhase === 'connecting'` (guard so a
   late tick after resolve can't overwrite the GPU card). The existing `_renderEngine` connecting
   branch (line 134-138) seeds `#heroStatGpu` with `0%` instead of empty.
4. **EST constant:** typical first cold pull ~ user-observed minutes. Use a single tuned constant
   (e.g. `EST_CONNECT_MS`), reused by both loops — keep it in one shared spot or duplicate with a
   comment. Warm-resume is fast; estimate still clamps fine (jumps to 99 quickly, fine).

## Files

- `js/shell.js` — `_pollRemoteReady` emit; connecting-phase seed unaffected (heroStats owns paint).
- `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js` — `_pollEngineReady` emit.
- `js/shell/heroStats.js` — subscribe + paint `#heroStatGpu`; seed `0%` in connecting branch.
- `js/events.js` registry / `.claude/rules/component-events*.md` — register new event name (docs only).

## Rules to honor

- `Events.on/emit` for the new event; store + call unsub in destroy (heroStats subs live app-lifetime — matches existing pattern, no destroy).
- No hardcoded colors; bare text in `#heroStatGpu` needs no new CSS.
- Frontend logging via clientLogger if any; no bare console.log.
- Surgical: touch only the two poll loops + heroStats render. No refactor of the connect flow.

## Verify

- Manual connect on a fresh image tag: GPU slot ticks 0%→…→99%→100%, footer reads `connecting · offline`,
  reverts to GPU card on ready.
- Warm resume: number climbs fast, snaps to ready quickly — no stuck/!00% lie.
- Timeout: number caps at 99%, existing timeout copy/retry still fires.
- Desktop (Electron) is ship target — verify there, browser dev mode connect may differ.

## Open / fallback

- EST constant is a guess until observed on a real pull; tune after first live test. The number is
  explicitly an estimate, not exact — acceptable per decision.
