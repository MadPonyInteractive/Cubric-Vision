# MPI-663 — Flow: Stems (audio separation)

One audio file in, four stems out as separate gallery cards. No model, no prompt, no options the
user has to understand — pick a track, run, get Bass / Drums / Other / Vocals as FLAC.

## Why

The user's stated workflow: generate several songs in Cubric Vision, listen, pick the keeper, pull
its stems, take them into a DAW and mix/master there properly. Stems are the export bridge between
"the app made something" and "I finished it like a record".

It also works on audio the user brings in, not only on Cubric-generated tracks — the flow's input
is a normal audio media slot, so any file staged into the project can be stemmed. That half is
free and is probably the wider use.

## Decisions taken

- **Separate Flow from music generation, not one flow with two stages.** One Flow is one dispatch;
  there is no second Run button, and stemming every candidate would waste GPU on tracks that get
  binned.
- **Ship Hybrid Demucs v3 as-is.** Better separators exist (`htdemucs_ft`, BS-Roformer, and the
  `set-soft/AudioSeparation` pack that exposes MDX + 6-stem models). The user has heard the output
  and accepted the bleed: "bleeds can be fixed in the mix". Revisit only if it bites in practice.
- **FLAC out, never MP3.** The source is already lossy from MiniMax; separating then re-encoding
  then mastering stacks artifacts three deep.
- **No instrumental output in v1.** It is two `AudioCombine` nodes on `add` away if wanted later.

## Full detail

`plan.md` — graph, constraints table, and the pinning problem.
