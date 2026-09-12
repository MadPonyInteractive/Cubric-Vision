# Prompt enhancement

How Cubric Vision turns a short idea into a prompt shaped for the model that will
run it. This is the `kind: 'app'` half of the agent corpus; the per-model half is
generated from the recipes themselves.

## The overlay

The Enhance control on the prompt box opens a dialog with two boxes:

- **Your prompt** — the short idea. It stays yours. Editing it invalidates any
  enhancement made from it, because the words the enhancement was built on changed.
- **Enhanced prompt** — the result, editable. **Leaving it empty means "run my own
  words raw"**, which is how you back out of an enhancement without losing the idea.

OK stores both. The box keeps showing the short prompt and the *enhanced* text is
what the graph receives. Both are written to the card, so Reuse hands the short
prompt back to the box and the enhancement back to the overlay — you can iterate on
the idea, not just re-run its output.

A model switch **keeps** the enhancement and says so in the provenance line
("Enhanced by <engine> for <model>"). An enhancement is shaped for one model's
syntax, so running it on another is a real mismatch, but it is the user's to decide —
unlike a prompt edit, which invalidates the words outright.

## Recipes

A recipe is one target model's prompting grammar: element order, vocabulary, a word
budget, what it must never emit, and worked examples. Adding a model is a recipe file
plus one registry line, never a code change.

Each recipe does four jobs and detects which the input needs: **expand** a sparse
idea, **condense** an overlong one, **rearrange** a disordered one into the model's
element order, and **infer intent** when the user gropes for a word. A recipe that
only expands will pad an already-long prompt past its budget.

Some recipes are `separate-field`: they answer with a positive half and a negative
half, which land in their own channels. Others emit no negative block at all —
`pony` and `illustrious` are tag grammars that do not want one.

Every recipe ships `status: 'draft'` until a human has rendered with it and promoted
it. Draft output is unproven, not wrong.

## Which operations enhance

The exemption is **per operation, not per model**:

| Operation | Enhance? | Why |
|---|---|---|
| `t2i`, `i2i` | yes | a scene description is the input |
| `control` | yes | the reference constrains structure; the prompt still carries the creative load |
| `detail`, `upscale` | yes, but a different job | these describe an image that already exists |
| `edit`, `inpaint` | **no** | an instruction ("remove the sign"), not a description — expanding it damages it |

## Backends

Three, chosen automatically and pinnable:

- **DeepInfra** (cloud) — the default when a key is set. No local VRAM, no queue.
- **Ollama** (local) — the fallback, and the only path for uncensored work: no hosted
  provider carries an abliterated build.
- **ComfyUI** (in-graph) — used for an uncensored model that ships its own encoder. It
  is a queued job, so it waits behind a running generation.

The completion always reports which backend and model actually answered. Show it
truthfully; never imply local when the cloud ran.
