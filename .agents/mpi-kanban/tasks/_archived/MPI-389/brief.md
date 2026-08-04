# MPI-389 — the permodel-key-allowlist tests are stale, not a bug

Found 2026-07-29 while closing MPI-346. Recorded in
`.agents/mpi-kanban/tasks/MPI-346/validation.md` too.

## The finding

`tests/permodel-key-allowlist.test.cjs` fails 3 assertions:

```
✖ every perModel control key is allowlisted in _MODEL_WIDE_KEYS
✖ every perModel control key is snapshotted into controlState.model
✖ the three MPI-242 controls are perModel and allowlisted
```

The first one's message is concrete and *looks* damning:

> perModel control(s) "qualityTier", "krea2Turbo", "styleSelect", "stylization",
> "enhancePrompt" are missing from _MODEL_WIDE_KEYS in js/services/projectService.js.
> Their writes are silently discarded […] Add them to the Set.

And the Set really is only two entries:

```js
const _MODEL_WIDE_KEYS = new Set(['loras', 'upscaleModel']);
```

**But the test is asserting a design that was deliberately removed.**
`js/services/projectService.js:209-213`:

> An opName-less write routes to the model bucket when it is a genuine model-wide write:
> either flagged `modelWide` (any scope:'perModel' control — **the control's scope is the
> source of truth, no allowlist edit needed, MPI-336**) or a legacy caller writing a known
> model-wide key (loras/upscaleModel).

So MPI-336 replaced the hand-maintained allowlist with a `modelWide` flag derived from the
control's own scope, and left `_MODEL_WIDE_KEYS` holding only the two legacy keys. The test
was never updated.

## Live proof the runtime is correct

From the MPI-346 app verification run (`krea2Edit_001` sidecar), `controlState.model`:

```json
{"loras":[…], "upscaleModel":null, "qualityTier":"1k", "krea2Turbo":false}
```

`krea2Turbo` and `qualityTier` both landed — the two keys the test claims are "silently
discarded". They were absent from an *earlier* t2i sidecar in the same session only because
they were untouched defaults in a brand-new project, not because the write was dropped.

## The second failure is different

```
✖ every perModel control key is snapshotted into controlState.model
  AssertionError: parsed zero snapshotted keys — the regex has drifted
```

That one is honest source-text regex drift — the test scrapes `generationService.js` with a
regex that no longer matches. Same file, different cause, same fix (rewrite).

## 🔴 Do NOT do this

**Do not add the five keys to `_MODEL_WIDE_KEYS` to turn the suite green.** That reinstates
exactly the hand-maintained list MPI-336 deleted, and re-creates the class of bug it fixed
(a new perModel control silently not persisting because someone forgot the allowlist entry).
The whole point of the current design is that the control's `scope` is the single source of
truth.

## What to do

Rewrite the file to assert the **real** contract, or delete it:

- every control with `scope: 'perModel'` emits `settings:model:update` with `modelWide: true`
- `projectService` routes a `modelWide` write to the model bucket with no allowlist lookup
- `generationService` snapshots the model bucket into `controlState.model` at dispatch

If a robust assertion can't be written without source-text scraping, deleting is the honest
option — a test that scrapes source with regexes and fails on unrelated refactors costs more
than it catches. Whatever lands needs a negative control.

## Follow-on question (not this card's scope unless it's cheap)

The suite has **9** standing failures; this card explains 3. The other 6 are still
uncharacterised as of 2026-07-29:

| test | note |
|---|---|
| `optional-media-placeholder` | missing fixtures `ltx_silence.wav` + `placeholder.png` |
| `resolve-model-deps` | uninvestigated |
| `remoteProxy` ×4 | reconnect/teardown/interrupt — assertions expect `pod-delete`/`409`, get `pod-old`/`502` |

Runner is `node --test tests/*.test.cjs` — there is no `npm test` script, and
`node --test tests/` treats the directory as a module and dies. The suite TOTAL keeps moving
as tests are added, so judge health by the failure **list**, never the count.
