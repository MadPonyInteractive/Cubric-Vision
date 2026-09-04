# MPI-684 — validation

## The claim, and how it was established

Text to Speech (`chatter-box`) declared `chatterbox-vc-s3gen` + `chatterbox-vc-conds`
(1.06GB) and never loads either. Traced, not assumed:

- the TTS graph (`comfy_workflows/flow_chatter_box.json`) runs `FL_ChatterboxTTS` and
  `FL_ChatterboxMultilingualTTS`. No VC node.
- `chatterbox_vc/` is resolved in exactly one place — `load_vc_model()` at
  `ComfyUI_Fill-ChatterBox/chatterbox_node.py:215`.
- `load_vc_model` has two callers, lines 990 and 1027, both inside `FL_ChatterboxVCNode`
  (class opens at 895). Nothing else in the pack references it.

The registry comment that justified the ids — *"shared with the Voice Changer flow — same
ids, so a user who owns that flow already has these"* — explains why the ids are
IDENTICAL, never that this flow needs them.

## What it cost

| | before | after |
|---|---|---|
| TTS declared size | 6.9GB | 5.96GB |
| bytes a TTS-only user downloads and never uses | 1.06GB | 0 |
| Voice Changer's Uninstall | permanent no-op | frees its own 1.0GB |

The third row is the real damage. The flow dep guard (`_flowRequiredDepIds`) walks
**declared** flows, installed or not, so Voice Changer's entire footprint was a strict
subset of what `chatter-box` declared. No sequence of uninstalls could reclaim that 1.0GB
— not even uninstalling Text to Speech first, and the MPI-462 orphan sweep could not
collect it either, because it asks the same declaration-based primitive. Found by Fabio,
who asked the right question: does Text to Speech actually USE them?

`ComfyUI_Fill-ChatterBox` stays in both lists. That one is genuinely shared — both flows
run the node pack.

## Checks

| Check | Result |
|---|---|
| `npm test` | 882/882 pass |
| `node tests/flow-uninstall-guard.test.cjs` | ok — 38 flow deps protected by default |
| `npx eslint js/data/flowsRegistry.js` | clean |

**Assertion 4 of `tests/flow-uninstall-guard.test.cjs` was rewritten, because it pinned
the bug as correct behaviour.** It read *"voice-changer's 3 deps are ALL shared with
chatter-box, so its uninstall must free NOTHING"* and asserted `shared.length === 3`. It
now asserts the shared set is exactly `['ComfyUI_Fill-ChatterBox']`, that the node pack
survives voice-changer's uninstall, and that neither VC weight is protected any more.

*Mutation:* re-add the pair to `chatter-box.requiredDeps` →
`AssertionError: only the node pack is genuinely shared — a WEIGHT here means chatter-box
has re-declared what it cannot load`.

**The dep union is unchanged at 38** (measured against HEAD side by side): Voice Changer
still declares both ids, so nothing left the registry — only the false claim on them did.

## Not verified here

The end-to-end effect: that Voice Changer's Uninstall now actually removes
`chatterbox_vc/` from disk. The uninstall path itself was live-proven under MPI-682 on
2026-09-04; what is untested is this card's declaration change reaching it. One live run
settles it, and re-installing is 1.0GB.

## Coordination

`js/data/flowsRegistry.js` and `tests/flow-uninstall-guard.test.cjs` are both inside
MPI-664's claim `b7f21c04`. Its owner session `faa0ec81` reads **closed** (heartbeat
2026-09-03T22:44), so it is not a fresh active writer, and both files were clean in the
tree before this edit. Message `a5677667-e573-4f72-b2c8-4fb4f24ccff4` was sent to
`task:MPI-664` before the change, naming both files and the stale claim.
