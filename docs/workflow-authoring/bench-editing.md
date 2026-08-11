# Editing a workflow on the bench without destroying it

> Part of [workflow-authoring](README.md). How to run experiments against, and make
> permanent changes to, a `raw/*.json` template that **the user hand-organises**. Model- and
> Flow-agnostic.

The constraint behind every rule here: **node positions are the user's work.** Regenerating
a workflow file — or exporting it from a re-laid-out graph — destroys a layout that took
real time to build, and it is not recoverable from git if it was never committed.
[README.md § "Changing an EXISTING workflow"](README.md) covers *which* copy to edit; this
covers *how*.

## Experiments never touch the saved file

Convert and dispatch, do not edit:

```bash
node scripts/workflow-to-api.mjs comfy_workflows/raw/<file>.json   # single-file → stdout, writes nothing
# mutate the API JSON in memory, then POST it to /prompt
```

Ten runs of an experiment cost zero writes to `raw/`. Mutate the **converted API graph** —
seeds, prompts, a relinked socket, a swapped loader — and POST that. The saved workflow is
never opened, so there is nothing to restore if the experiment is abandoned.

**A brand-new node is easier in API format than in LiteGraph**: API format needs no link
table and no `pos`/`size`, so porting an upstream reference graph onto our weights is a
pure-JSON job. An 11-link two-stage port was done this way with no LiteGraph surgery at all
(MPI-537).

## Making the change permanent

Only when an experiment is *settled* does it go into the file. In place, never regenerated:

1. **Assert the bench copy and the repo copy still match** (sha256) before writing. The user
   may have saved the tab since you last read it.
2. **Clone donor node objects** out of an existing `raw/*.json` that already uses the node —
   deep-copy, then re-stamp `id` / `title` / `pos` / `size` / `widgets_values` and null the
   links. **Never hand-write a LiteGraph node**: the widget-to-input ordering is implicit and
   a hand-built node shifts widgets silently, producing a file that loads and misbehaves.
3. **Assert `pos` and `size` are byte-identical on every surviving node** after the edit.
   This is the check that catches an accidental re-layout.
4. **Read the file back FROM the bench**, then sync that bytes-for-bytes to `raw/`. Never
   sync what you *think* you wrote.
5. **Re-convert and re-run.** A rename or a rewire that converts clean can still fail to
   queue — see the loader trap below.

## Match ComfyUI's serialisation, or every line lands in the diff

ComfyUI writes `JSON.stringify(obj, null, 2)`. In Python that is:

```python
json.dump(w, f, indent=2, ensure_ascii=True)   # non-ASCII escaped
# opened with newline="\r\n", and NO trailing newline
```

**Prove it before writing anything**: load the untouched file, re-serialise it, and assert
the bytes are identical. If the round-trip is not exact, fix the serialiser — do not write.
Getting this wrong turns a six-node change into a 2400-line diff that no one can review.

> Line endings are **per file**, not a repo-wide constant, and the same is true of the kanban
> JSON for its own reasons (`.claude/rules/kanban.md`). Measure, do not assume.

## The traps

- **The modified dot is the tell.** If the user has the tab open with unsaved changes, your
  write will be overwritten the moment they save. Re-fetch after they touch it, and ask them
  to save or discard before a permanent edit.
- **Convert against `48188`, not the bench.** `8188` is the authoring bench and has run ahead
  of the shipped engine before, shifting a widget silently. Anything the app will ship gets
  converted against the engine.
- **A template authored elsewhere names weights we do not have.** Community and upstream
  graphs reference the checkpoints *they* ran. Converting succeeds — the converter only reads
  `/object_info` for widget *names* — and then `/api/prompt` returns `400
  prompt_outputs_failed_validation` naming `value_not_in_list`. **Bake our own weight names
  into the template** rather than substituting them on every run; a template that cannot
  queue on our own install is broken, and every downstream card inherits it.
- **Node ids in a ported graph are meaningless to the app.** Injection matches on
  `_meta.title` ([injection.md](injection.md)); apply the `Input_*` / `Output_*` law as part
  of the same pass, because a title that matches no node is skipped in silence.
