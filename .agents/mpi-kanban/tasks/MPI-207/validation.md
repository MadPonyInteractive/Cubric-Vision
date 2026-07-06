# MPI-207 — validation

## Status: CODE COMPLETE + node-tested. Live A/B deferred (needs a real GPU-arch change).

## What shipped

Three surfaces, one detection primitive.

### 1. Detection primitive (pure + wrapper)
- `detectOtherArchInstall(model, curArch, isOn)` — pure, in `resolveModelDeps.js`.
  Returns `{ otherArch, unusedDepIds }` when THIS GPU's arch weight is absent but
  another arch's weight is fully on disk; else null. Only the `arch` variant axis
  is considered.
- `installedForOtherArch(modelOrId)` — registry wrapper in `modelRegistry.js`,
  feeds the pure fn the live dep-status cache + `remoteEngineClient.archSync(engine)`.
- New exports: `variantAxisTokens`, `variantDepsOf` (was module-private), `detectOtherArchInstall`.

### 2. Toast (shell.js `_maybeNotifyArchChange`)
- Fires `ui:info` "GPU Changed — you may need to reinstall some models for this GPU."
- Runs after EVERY `syncModelInstalled` (engine:ready/boot, remote connect, remote
  disconnect) so a LOCAL GPU upgrade shows on boot and a Pod swap shows on connect.
- De-duped per engine via `localStorage['mpi.lastSeenArch.<engine>']` — one toast
  per real arch change, gated on ≥1 model actually being installed-for-other-arch.

### 3. Panel (MpiModelManager.js)
- Arch-variant model installed-for-other-arch → button label "Install for your GPU"
  (instead of "Install"). Install action already fetches only the missing weight
  (downloader dedupes) — keep-both is the default, no mid-install prompt.
- "Remove old weight (NNGB)" ghost button on the card (opsSlot), shown whenever an
  other-arch weight is on disk (user-approved: even before installing this GPU's
  weight). Deletes ONLY that arch's variant deps via the shared confirm dialog +
  `downloadService.uninstall`; shared VAE/LoRA/base + this GPU's weight untouched.

## Automated verification (DONE)
- `node tests/resolve-model-deps.test.cjs` → 14/14 (added `testOtherArchDetect`:
  other-arch hit, current-arch-present→null, both-present→null, no-weight→null,
  unknown-arch→null, non-variant→null).
- `node --check` on all 4 edited JS files → clean.
- `npx eslint` on all 4 → 0 errors.
- All import/export symbols verified to resolve.

## Live verification (TODO — needs a real arch change)
The pure logic is proven; the live surface needs an actual GPU-arch delta. Two paths:

1. **Remote Pod swap (cheapest):** install LTX balanced on a 4090 Pod (modern/fp8),
   disconnect, connect a 5090 Pod (blackwell/mxfp8) same session. Expect:
   - "GPU Changed" info toast once on the 5090 connect.
   - Models panel: LTX balanced in the uninstalled section, button reads
     "Install for your GPU", card shows "Remove old weight (~NNGB)".
   - Install fetches only `ltx23-transformer-mxfp8` (~24GB), not the whole model.
   - Remove-old-weight deletes only the fp8 transformer.
2. **Local GPU upgrade:** install balanced on a 40xx local desktop, swap to a 50xx,
   boot the app. Expect the same toast + panel state on the LOCAL engine (proves the
   boot/engine:ready detection path, not just remote connect).

## Notes / decisions
- KEEP-BOTH default + opt-in reclaim (no mid-install prompt) — user-approved.
- Remove affordance shown "always when other-arch present" — user-approved (AskUserQuestion).
- Node axes explicitly out of scope (single-version-pinned; weights coexist on disk).
- The remove dialog reuses the shared confirm (checkbox "Also delete model files"
  shows but the handler always deletes — reclaim is the whole point).
