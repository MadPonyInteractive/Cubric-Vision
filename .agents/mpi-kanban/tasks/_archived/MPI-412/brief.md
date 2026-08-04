# MPI-412 — engine install screen strobes between two progress states

Reported by the user 2026-07-30 during the Linux engine install (MPI-391
section D). Cosmetic; the install itself completes. Filed so it is not lost —
the user explicitly said they were not worried about it.

## Symptom, in the user's words

> "The UI looks like a Christmas tree lighting up. It keeps flashing, preparing
> dependencies and showing the download, so it keeps going from one and the
> other. It starts stable and then does that, and then stable again, showing how
> many megabytes have been downloaded."

So: stable → rapid alternation between a "preparing dependencies" state and a
byte-counting download state → stable again.

## Candidate cause — NOT verified

`_provisionUvEngine` broadcasts two different event shapes from
`routes/engine.js`:

- `broadcastEngineEvent('engine:extracting', { status, progress })` — the
  step-label states ("Checking for git…", "Creating Python environment…")
- `broadcastEngineEvent('engine:downloading', { progress, downloadedBytes, totalBytes })`

If both fire interleaved while pip/uv is resolving and fetching, the install
screen would flip between the label view and the byte view on every event. That
matches "one and the other" exactly, but it has not been traced — do not fix
from this brief alone.

Note the strobing appeared during the **dependency** phase specifically, which is
also the phase that emits the most events per second.

## Why it is worth fixing

It reads as instability during the app's very first experience, on the screen a
new user stares at for many minutes. On a slow machine that is a long time to
watch something flicker.

## Verify

Reproduce on any Linux/macOS engine install (the uv path). A fix should hold one
coherent state per phase — either a labelled step or a progress bar — without
alternating between them within a phase.
