# MPI-425 Validation

**Verify mode:** `user-ux` — the whole card is a toolbar interaction. The strip's
placement, its timing and its dismissal are things the user has to feel, and the
auto-dismiss constant is almost certainly wrong on the first guess.

## Automated gates — PASSED 2026-08-02

- [x] `tests/mask-tool-registry.test.cjs` 7/7
- [x] `eslint` on the four touched files: 0 errors, 0 new warnings. The 2 warnings
      in `hotkeyRegistry.js` are pre-existing `querySelector` calls at :284/:304,
      outside the 15 added lines (`git diff` is purely additive)
- [x] Guard negative-controlled in BOTH directions:
      - added an unregistered `maskBogus` to the collapse `sub[]` -> failed naming
        BOTH `_MASK_TOOLS` and `TOOL_OPTIONS_REGISTRY`; restored -> 7/7
      - gave the collapse entry its own `mode:` -> `a collapse entry declares no
        mode of its own` failed, plus both registry guards; restored -> 7/7
- [x] `docs/masking.md` at exactly 200 lines (its cap)

**Full suite: 298/301, and all 3 failures are foreign to this card.** A concurrent
session was writing `js/data/progressStages.js`, `models.js`, `commandRegistry.js`,
`operationRegistry.js` and `comfy_workflows/` during the run. Two of the three
(`inject-params-titles`) reproduce on clean HEAD — `comfy_workflows/krea2_t2i_sfw.json`
is unmodified and has no `Input_wf_type` node at HEAD either. The third
(`output-prompt-capture`) passed earlier in this same session and broke only after
the peer touched `progressStages.js`. Nothing this card changed is reachable from
any of them.

## User pass — PASSED 2026-08-02 (verify mode `user-ux`)

User verified in the running app and accepted the timing as shipped:
**"1.5 seconds is fine, works well as it is."** `STRIP_DISMISS_MS = 1500` stands —
no retune needed, which the plan had expected to be the likely follow-up.

Confirmed by that pass: Detect opens the strip and activates nothing; picking a
method activates as the old toolbar button did; the strip dismisses on pick,
Escape, tool activation and the unhovered timer; re-entering the strip or its
button cancels the countdown; no tooltip overlap.

## Notes

- The dismiss countdown is armed by `mouseout` on the anchor, NOT at open time —
  see `plan.md` § Plan Drift. Arming at open dismissed the strip under a cursor
  that had not moved since the click.
- Escape needed no coordination work: `.mpi-popup.is-active` was already in
  `ESCAPE_DISMISSABLE_SELECTORS`, so the workspace's return-to-gallery handler
  stands down on its own while the strip is up.
