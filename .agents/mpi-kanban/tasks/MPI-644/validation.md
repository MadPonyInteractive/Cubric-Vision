# MPI-644 — validation

## Ran

| Check | Result |
|---|---|
| `npx playwright test tests/desktop/flow-step-gate.spec.js --config=playwright.desktop.config.js` | 1 passed (3.4s) |
| All nine flow desktop specs (incl. `flow-clear-slot-advances`) | 9 passed (51.1s) |
| `npm test` | 775 pass, 0 fail |
| `npx eslint` on the two changed js files + the new spec | clean |

## Why the new spec is not vacuous

The two probes share one code path and land on opposite outcomes: outpaint stays on
slide 0, scribble reaches slide 1. So the Next button is found and navigation works —
a silently-missing button would have pinned both at 0.

The asserted message string `You need to add inputs to this flow.` appears in exactly
two places in the repo (`grep`): the gate that emits it and the spec that asserts it.
Nothing else can produce it, so the refusal is the gate's and not a fallthrough to the
dispatch guard, whose copy names the media type.

## Still open

Fabio has not seen the toast in the running app. The copy is his call and the card is
`validating` for that reason alone — the behaviour itself is proven above.

## Known residual, out of scope

Several `MpiBaseFlow` toasts are absent from `docs/toasts.md` altogether (the two Enhance
warnings, the `promptRequired` refusal, the derivation-failed message). That is a docs
sweep of its own, not this card's mess — only the rows already present for the two files
this card edited were corrected.
