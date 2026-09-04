# MPI-684 Checklist

- [x] Remove `chatterbox-vc-s3gen` + `chatterbox-vc-conds` from `chatter-box.requiredDeps`
      and correct the comment that justified them
- [x] `ComfyUI_Fill-ChatterBox` STAYS — Text to Speech genuinely runs the node pack; only
      the two VC weights are wrong
- [x] Fix `tests/flow-uninstall-guard.test.cjs` assertion 4, which currently asserts the
      bug as expected behaviour ("voice-changer's 3 deps are ALL shared with chatter-box")
      — rewritten and mutation-checked (re-add the pair → it fails)
- [x] Confirm no other consumer hard-codes the 6.9GB figure or a 13-dep count — the 6.9GB
      hits in `tests/` are unrelated sdxl fixtures; the VC ids remain only in
      `voice-changer.requiredDeps` and `assetDeps.js`
- [x] `npm test` green — 882/882
- [x] Dep union unchanged at 38, measured against HEAD side by side (Voice Changer still
      declares both ids; only the false claim on them is gone)
- [x] Live 2026-09-04, the user's own app: `uninstall flow:voice-changer: removed 2,
      kept 1 universal, 0 shared, 0 model files, swept 0`. Before this card that line
      read `removed 0` with the pair held as shared. Re-installed: `chatterbox_vc/` back
      at 2 files / 1008.29MB, Text to Speech stayed Ready throughout.
