# MPI-686 — validation

## The leak

Installing Voice Changer toasted **`flow:voice-changer installed.`** — `flowDepKey()`'s
output, verbatim, in front of the user. Fabio: *"looks almost like code."* It is code.

`js/shell/notificationService.js` resolved the announced name as MODELS → PLUGINS → raw
`data.modelId`. Flows were never given a clause, so a flow install fell through to the
fallback. It is not toast-only: the same `message` string is the **OS notification body**
when the window is unfocused, so the identifier left the app entirely.

**Third time through the same chain.** The resolver was written for models; MPI-310 added
the PLUGINS clause for the identical `plugin:image-describer installed.`; MPI-304's flows
were never added. Its own comment already said *"Same miss as the uninstall toast."*

Related but distinct: MPI-682 fixed the UNINSTALL half in `MpiModelManager.js`. This is
the install direction, in a different file.

## Fix

`jobDisplayName(jobId)` extracted and exported, with the FLOWS clause added. One change
covers both surfaces because they share the `message` string.

## Checks

| Check | Result |
|---|---|
| `npm test` | 883/883 pass |
| `node tests/job-display-name.test.cjs` | ok — 37 entities, 0 raw keys announced |
| `npx eslint js/shell/notificationService.js` | clean |

`tests/job-display-name.test.cjs` asserts every flow, plugin and model announces its
title, and that nothing a user reads carries the `<namespace>:<id>` shape.

*Mutation 1:* drop the FLOWS clause → `AssertionError: the flow that reported this must
resolve to its Library title`.

*Mutation 2, the one that matters:* assertion 5 discovers every `*DepKey` helper the
registries export and fails when one appears without a clause. Dropping a throwaway
`js/data/__tmpAppRegistry.js` exporting `appDepKey` into the tree →
`AssertionError: a new *DepKey helper mints a namespace — give jobDisplayName a clause
for it, then add it to KNOWN.` Removed again, green. That tripwire is the reason this
card exists as its own card rather than a one-line patch: the bug is not the missing
clause, it is that nothing failed when an entity was added without one.

Both declaration forms are covered by the scan — `export function flowDepKey(` and
`export const pluginDepKey =`. `*FromDepKey` is the inverse lookup and is excluded.

## Convention

`~/.claude/memory/.../feedback_no_internal_identifiers_in_user_copy.md` (MPI-674): an
identifier goes to `app.log`, never into UI copy. This is that rule's third recorded
violation, and the first one to ship a guard rather than only a fix.

## Not verified here

A live install in the app showing the title. The string is unit-proven against the real
registry, and `voice-changer` — the exact flow that reported it — is asserted by name.
